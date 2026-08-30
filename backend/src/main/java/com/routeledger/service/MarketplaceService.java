package com.routeledger.service;

import com.routeledger.domain.ApprovalStatus;
import com.routeledger.domain.Business;
import com.routeledger.domain.Customer;
import com.routeledger.domain.DeliveryPause;
import com.routeledger.domain.PaymentMode;
import com.routeledger.domain.Product;
import com.routeledger.domain.Route;
import com.routeledger.domain.Subscription;
import com.routeledger.dto.MarketplaceDtos;
import com.routeledger.dto.PauseDtos;
import com.routeledger.dto.PaymentDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.repository.BusinessRepository;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryPauseRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consumer & Marketplace service:
 * - Allows end-user customers to discover cloud kitchens, dairies, and vendors.
 * - Allows customers to subscribe to meal plans with advance UPI payments.
 * - Allows customers to view their active subscriptions, skip tomorrow's delivery, and schedule pauses.
 */
@Service
public class MarketplaceService {

    private final BusinessRepository businesses;
    private final ProductRepository products;
    private final CustomerRepository customers;
    private final SubscriptionRepository subscriptions;
    private final DeliveryPauseRepository pauses;
    private final RouteRepository routes;
    private final PaymentService payments;
    private final PauseService pauseService;

    public MarketplaceService(BusinessRepository businesses, ProductRepository products,
                              CustomerRepository customers, SubscriptionRepository subscriptions,
                              DeliveryPauseRepository pauses, RouteRepository routes,
                              PaymentService payments, PauseService pauseService) {
        this.businesses = businesses;
        this.products = products;
        this.customers = customers;
        this.subscriptions = subscriptions;
        this.pauses = pauses;
        this.routes = routes;
        this.payments = payments;
        this.pauseService = pauseService;
    }

    /** Lists all active vendors/kitchens and their available meal plans. */
    @Transactional(readOnly = true)
    public List<MarketplaceDtos.VendorView> listVendors() {
        List<Business> allBusinesses = businesses.findAll();
        List<MarketplaceDtos.VendorView> result = new ArrayList<>();

        for (Business b : allBusinesses) {
            List<Product> prods = products.findByBusinessIdAndActiveTrueOrderByNameAsc(b.getId());
            List<MarketplaceDtos.VendorProductView> productViews = prods.stream()
                    .map(p -> new MarketplaceDtos.VendorProductView(
                            p.getId(),
                            p.getName(),
                            p.getUnitLabel(),
                            p.getPricePaise(),
                            p.getCategory()
                    )).toList();

            result.add(new MarketplaceDtos.VendorView(
                    b.getId(),
                    b.getName(),
                    b.getCity(),
                    "India",
                    b.getPhone(),
                    productViews
            ));
        }
        return result;
    }

    /** Customer creates an advance-paid meal plan subscription for a vendor. */
    @Transactional
    public MarketplaceDtos.CustomerSubscriptionView subscribe(MarketplaceDtos.CustomerSubscriptionRequest request) {
        Long businessId = request.businessId();
        Business business = businesses.findById(businessId)
                .orElseThrow(() -> new BadRequestException("Vendor business not found."));

        Product product = products.findByIdAndBusinessId(request.productId(), businessId)
                .orElseThrow(() -> new BadRequestException("Product does not belong to this vendor."));

        // Get default route for this business
        List<Route> bizRoutes = routes.findByBusinessIdOrderByNameAsc(businessId);
        Long routeId = bizRoutes.isEmpty() ? null : bizRoutes.get(0).getId();

        // Find or create customer
        Customer customer = customers.findByBusinessIdAndPhone(businessId, request.phone().trim())
                .orElseGet(() -> {
                    Customer c = new Customer();
                    c.setBusinessId(businessId);
                    c.setName(request.customerName().trim());
                    c.setPhone(request.phone().trim());
                    c.setAddress(request.address().trim());
                    c.setLandmark(request.landmark());
                    c.setLat(request.lat() != null ? request.lat() : 18.5204);
                    c.setLng(request.lng() != null ? request.lng() : 73.8567);
                    c.setRouteId(routeId);
                    c.setActive(true);
                    c.setJoinedOn(LocalDate.now());
                    return customers.save(c);
                });

        Subscription sub = new Subscription();
        sub.setBusinessId(businessId);
        sub.setCustomerId(customer.getId());
        sub.setProductId(product.getId());
        sub.setQuantity(request.quantity());
        sub.setFrequency(request.frequency());
        int mask = request.weekdayMask() & 127;
        sub.setWeekdayMask(mask == 0 ? 127 : mask);
        sub.setStartOn(request.startOn());
        sub.setActive(true);
        sub.setApprovalStatus(ApprovalStatus.PENDING_APPROVAL);
        sub.setAdvancePaidPaise(request.advanceAmountPaise());
        subscriptions.save(sub);

        // Record upfront payment in ledger
        payments.record(businessId, new PaymentDtos.PaymentRequest(
                customer.getId(),
                null,
                request.advanceAmountPaise(),
                PaymentMode.UPI,
                LocalDate.now(),
                "ADVANCE:" + request.paymentReference()
        ));

        customer.setAdvanceCreditPaise(customer.getAdvanceCreditPaise() + request.advanceAmountPaise());
        customers.save(customer);

        return new MarketplaceDtos.CustomerSubscriptionView(
                sub.getId(),
                businessId,
                business.getName(),
                customer.getId(),
                customer.getName(),
                customer.getPhone(),
                product.getId(),
                product.getName(),
                product.getUnitLabel(),
                sub.getQuantity(),
                product.getPricePaise() * sub.getQuantity(),
                sub.getFrequency().name(),
                SubscriptionService.weekdayLabel(sub.getFrequency(), sub.getWeekdayMask()),
                sub.getStartOn(),
                sub.getApprovalStatus(),
                sub.getAdvancePaidPaise(),
                sub.isActive(),
                false
        );
    }

    /** Customer Dashboard: gets all subscriptions and pauses by phone. */
    @Transactional(readOnly = true)
    public MarketplaceDtos.CustomerDashboardResponse getDashboard(String phone) {
        String cleanPhone = phone.trim();
        List<Business> allBiz = businesses.findAll();
        Map<Long, String> bizMap = new HashMap<>();
        for (Business b : allBiz) bizMap.put(b.getId(), b.getName());

        List<MarketplaceDtos.CustomerSubscriptionView> subViews = new ArrayList<>();
        List<PauseDtos.PauseView> upcomingPauses = new ArrayList<>();
        long totalAdvanceCredit = 0L;
        String customerName = "Customer";

        LocalDate tomorrow = LocalDate.now().plusDays(1);

        for (Business b : allBiz) {
            Customer c = customers.findByBusinessIdAndPhone(b.getId(), cleanPhone).orElse(null);
            if (c != null) {
                customerName = c.getName();
                totalAdvanceCredit += c.getAdvanceCreditPaise();

                Map<Long, Product> catalogue = new HashMap<>();
                for (Product p : products.findByBusinessId(b.getId())) catalogue.put(p.getId(), p);

                List<Subscription> subs = subscriptions.findByCustomerIdOrderByIdAsc(c.getId());
                List<DeliveryPause> pList = pauses.findByCustomerIdOrderByStartOnDesc(c.getId());

                boolean isTomorrowSkipped = pList.stream()
                        .anyMatch(p -> !tomorrow.isBefore(p.getStartOn()) && !tomorrow.isAfter(p.getEndOn()));

                for (Subscription s : subs) {
                    Product prod = catalogue.get(s.getProductId());
                    subViews.add(new MarketplaceDtos.CustomerSubscriptionView(
                            s.getId(),
                            b.getId(),
                            bizMap.getOrDefault(b.getId(), "Vendor"),
                            c.getId(),
                            c.getName(),
                            c.getPhone(),
                            s.getProductId(),
                            prod != null ? prod.getName() : "Product",
                            prod != null ? prod.getUnitLabel() : "unit",
                            s.getQuantity(),
                            (prod != null ? prod.getPricePaise() : 0L) * s.getQuantity(),
                            s.getFrequency().name(),
                            SubscriptionService.weekdayLabel(s.getFrequency(), s.getWeekdayMask()),
                            s.getStartOn(),
                            s.getApprovalStatus(),
                            s.getAdvancePaidPaise(),
                            s.isActive(),
                            isTomorrowSkipped
                    ));
                }

                for (DeliveryPause p : pList) {
                    upcomingPauses.add(pauseService.forCustomer(b.getId(), c.getId()).stream()
                            .filter(pv -> pv.id().equals(p.getId()))
                            .findFirst()
                            .orElse(null));
                }
            }
        }

        upcomingPauses.removeIf(p -> p == null);

        return new MarketplaceDtos.CustomerDashboardResponse(
                cleanPhone,
                customerName,
                totalAdvanceCredit,
                subViews,
                upcomingPauses
        );
    }

    /** 1-Tap Skip Tomorrow for customer. */
    @Transactional
    public void quickSkipTomorrow(String phone, Long subscriptionId) {
        String cleanPhone = phone.trim();
        Subscription sub = subscriptions.findById(subscriptionId)
                .orElseThrow(() -> new BadRequestException("Subscription not found."));

        pauseService.quickSkipTomorrow(sub.getBusinessId(), sub.getCustomerId(), "1-Tap Customer Portal Skip");
    }
}
