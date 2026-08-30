package com.routeledger.service;

import com.routeledger.domain.ApprovalStatus;
import com.routeledger.domain.Customer;
import com.routeledger.domain.Frequency;
import com.routeledger.domain.PaymentMode;
import com.routeledger.domain.Product;
import com.routeledger.domain.Subscription;
import com.routeledger.dto.PaymentDtos;
import com.routeledger.dto.SubscriptionDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.TextStyle;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Standing orders: what each household gets, how often, and for how long.
 * 
 * Supports upfront advance payment from the Customer Portal and strict Owner-gating
 * before dispatching downstream to Managers and Agents.
 */
@Service
public class SubscriptionService {

    private final SubscriptionRepository subscriptions;
    private final CustomerRepository customers;
    private final ProductRepository products;
    private final PaymentService payments;

    public SubscriptionService(SubscriptionRepository subscriptions, CustomerRepository customers,
                              ProductRepository products, PaymentService payments) {
        this.subscriptions = subscriptions;
        this.customers = customers;
        this.products = products;
        this.payments = payments;
    }

    @Transactional(readOnly = true)
    public List<SubscriptionDtos.SubscriptionView> forCustomer(Long businessId, Long customerId) {
        Customer customer = customers.findByIdAndBusinessId(customerId, businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", customerId));
        List<Subscription> lines = subscriptions.findByCustomerIdOrderByIdAsc(customerId);
        Map<Long, Product> catalogue = catalogue(businessId);
        List<SubscriptionDtos.SubscriptionView> views = new ArrayList<>(lines.size());
        for (Subscription line : lines) {
            views.add(toView(line, customer.getName(), catalogue.get(line.getProductId())));
        }
        return views;
    }

    @Transactional(readOnly = true)
    public SubscriptionDtos.SubscriptionView get(Long businessId, Long id) {
        Subscription line = require(businessId, id);
        Customer customer = customers.findByIdAndBusinessId(line.getCustomerId(), businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", line.getCustomerId()));
        return toView(line, customer.getName(), catalogue(businessId).get(line.getProductId()));
    }

    @Transactional(readOnly = true)
    public Subscription require(Long businessId, Long id) {
        return subscriptions.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> NotFoundException.of("Subscription", id));
    }

    @Transactional
    public SubscriptionDtos.SubscriptionView create(Long businessId,
                                                   SubscriptionDtos.SubscriptionRequest request) {
        Subscription line = new Subscription();
        line.setBusinessId(businessId);
        line.setApprovalStatus(ApprovalStatus.APPROVED);
        line.setApprovedAt(Instant.now());
        apply(line, request, businessId);
        subscriptions.save(line);
        return get(businessId, line.getId());
    }

    /**
     * Customer Portal self-service subscription with advance payment.
     * Starts in PENDING_APPROVAL and is routed to the Owner's inbox.
     */
    @Transactional
    public SubscriptionDtos.SubscriptionView advanceSubscribe(Long businessId,
                                                             SubscriptionDtos.AdvanceSubscribeRequest request) {
        Product product = products.findByIdAndBusinessId(request.productId(), businessId)
                .orElseThrow(() -> new BadRequestException("Product does not exist."));

        // Find existing customer by phone or create new customer
        Customer customer = customers.findByBusinessIdAndPhone(businessId, request.phone().trim())
                .orElseGet(() -> {
                    Customer newCustomer = new Customer();
                    newCustomer.setBusinessId(businessId);
                    newCustomer.setName(request.customerName().trim());
                    newCustomer.setPhone(request.phone().trim());
                    newCustomer.setAddress(request.address().trim());
                    newCustomer.setLandmark(request.landmark());
                    newCustomer.setRouteId(request.routeId());
                    newCustomer.setLat(request.lat() != null ? request.lat() : 18.5204);
                    newCustomer.setLng(request.lng() != null ? request.lng() : 73.8567);
                    newCustomer.setActive(true);
                    newCustomer.setJoinedOn(LocalDate.now());
                    return customers.save(newCustomer);
                });

        Subscription line = new Subscription();
        line.setBusinessId(businessId);
        line.setCustomerId(customer.getId());
        line.setProductId(product.getId());
        line.setQuantity(request.quantity());
        line.setFrequency(request.frequency());
        int mask = request.weekdayMask() & 127;
        line.setWeekdayMask(request.frequency() == Frequency.WEEKLY_DAYS ? (mask == 0 ? 127 : mask) : 127);
        line.setStartOn(request.startOn());
        line.setEndOn(request.endOn());
        line.setActive(true);
        line.setApprovalStatus(ApprovalStatus.PENDING_APPROVAL);
        line.setAdvancePaidPaise(request.advanceAmountPaise());
        subscriptions.save(line);

        // Record upfront payment in ledger
        payments.record(businessId, new PaymentDtos.PaymentRequest(
                customer.getId(),
                null,
                request.advanceAmountPaise(),
                PaymentMode.UPI,
                LocalDate.now(),
                "ADVANCE:" + request.paymentReference()
        ));

        // Update customer advance credit balance
        customer.setAdvanceCreditPaise(customer.getAdvanceCreditPaise() + request.advanceAmountPaise());
        customers.save(customer);

        return toView(line, customer.getName(), product);
    }

    @Transactional(readOnly = true)
    public SubscriptionDtos.ApprovalSummaryResponse getPendingApprovals(Long businessId) {
        List<Subscription> pending = subscriptions.findByBusinessIdAndApprovalStatusOrderByIdDesc(
                businessId, ApprovalStatus.PENDING_APPROVAL);
        Map<Long, Product> catalogue = catalogue(businessId);
        List<SubscriptionDtos.SubscriptionView> views = new ArrayList<>(pending.size());
        for (Subscription line : pending) {
            String customerName = customers.findByIdAndBusinessId(line.getCustomerId(), businessId)
                    .map(Customer::getName)
                    .orElse("Unknown Customer");
            views.add(toView(line, customerName, catalogue.get(line.getProductId())));
        }
        return new SubscriptionDtos.ApprovalSummaryResponse(views.size(), views);
    }

    @Transactional
    public SubscriptionDtos.SubscriptionView approve(Long businessId, Long id) {
        Subscription line = require(businessId, id);
        line.setApprovalStatus(ApprovalStatus.APPROVED);
        line.setApprovedAt(Instant.now());
        line.setActive(true);
        subscriptions.save(line);
        return get(businessId, id);
    }

    @Transactional
    public SubscriptionDtos.SubscriptionView reject(Long businessId, Long id) {
        Subscription line = require(businessId, id);
        line.setApprovalStatus(ApprovalStatus.REJECTED);
        line.setActive(false);
        subscriptions.save(line);
        return get(businessId, id);
    }

    @Transactional
    public SubscriptionDtos.SubscriptionView update(Long businessId, Long id,
                                                   SubscriptionDtos.SubscriptionRequest request) {
        Subscription line = require(businessId, id);
        apply(line, request, businessId);
        subscriptions.save(line);
        return get(businessId, id);
    }

    @Transactional
    public SubscriptionDtos.SubscriptionView setActive(Long businessId, Long id, boolean active) {
        Subscription line = require(businessId, id);
        line.setActive(active);
        subscriptions.save(line);
        return get(businessId, id);
    }

    private void apply(Subscription line, SubscriptionDtos.SubscriptionRequest request, Long businessId) {
        Customer customer = customers.findByIdAndBusinessId(request.customerId(), businessId)
                .orElseThrow(() -> new BadRequestException(
                        "Customer " + request.customerId() + " does not belong to this business."));
        Product product = products.findByIdAndBusinessId(request.productId(), businessId)
                .orElseThrow(() -> new BadRequestException(
                        "Product " + request.productId() + " does not belong to this business."));
        if (request.endOn() != null && request.endOn().isBefore(request.startOn())) {
            throw new BadRequestException("The end date cannot be before the start date.");
        }
        int mask = request.weekdayMask() & 127;
        if (request.frequency() == Frequency.WEEKLY_DAYS && mask == 0) {
            throw new BadRequestException("Pick at least one weekday for a weekly schedule.");
        }
        line.setCustomerId(customer.getId());
        line.setProductId(product.getId());
        line.setQuantity(request.quantity());
        line.setFrequency(request.frequency());
        line.setWeekdayMask(request.frequency() == Frequency.WEEKLY_DAYS ? mask : 127);
        line.setStartOn(request.startOn());
        line.setEndOn(request.endOn());
        if (request.active() != null) {
            line.setActive(request.active());
        }
    }

    private Map<Long, Product> catalogue(Long businessId) {
        Map<Long, Product> byId = new HashMap<>();
        for (Product product : products.findByBusinessId(businessId)) {
            byId.put(product.getId(), product);
        }
        return byId;
    }

    private SubscriptionDtos.SubscriptionView toView(Subscription line, String customerName, Product product) {
        long unitPrice = product == null ? 0L : product.getPricePaise();
        return new SubscriptionDtos.SubscriptionView(line.getId(), line.getCustomerId(), customerName,
                line.getProductId(), product == null ? "Removed product" : product.getName(),
                product == null ? "unit" : product.getUnitLabel(),
                line.getQuantity(), unitPrice, unitPrice * line.getQuantity(),
                line.getFrequency().name(), line.getWeekdayMask(),
                weekdayLabel(line.getFrequency(), line.getWeekdayMask()),
                line.getStartOn(), line.getEndOn(), line.isActive(),
                line.getApprovalStatus(), line.getAdvancePaidPaise(), line.getApprovedAt());
    }

    /** Turns the bitmask into something an owner can read, e.g. "Mon, Wed, Fri". */
    public static String weekdayLabel(Frequency frequency, int mask) {
        if (frequency == Frequency.DAILY) {
            return "Every day";
        }
        if (frequency == Frequency.ALTERNATE_DAY) {
            return "Every other day";
        }
        List<String> days = new ArrayList<>(7);
        for (int bit = 0; bit < 7; bit++) {
            if ((mask & (1 << bit)) != 0) {
                days.add(DayOfWeek.of(bit + 1).getDisplayName(TextStyle.SHORT, Locale.ENGLISH));
            }
        }
        return days.isEmpty() ? "No days selected" : String.join(", ", days);
    }
}
