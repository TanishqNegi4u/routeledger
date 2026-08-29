package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Frequency;
import com.routeledger.domain.InvoiceStatus;
import com.routeledger.domain.Product;
import com.routeledger.domain.Route;
import com.routeledger.domain.Subscription;
import com.routeledger.dsa.GeoClusterer;
import com.routeledger.dsa.GeoPoint;
import com.routeledger.dto.CustomerDtos;
import com.routeledger.dto.PageResponse;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.InvoiceRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The customer book. Listing enriches every row with its standing-order value and live dues in
 * three queries regardless of page size, and search goes through the trie index.
 */
@Service
public class CustomerService {

    private static final List<InvoiceStatus> OPEN = List.of(InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL);
    private static final int MAX_CLUSTER_POINTS = 1500;

    private final CustomerRepository customers;
    private final RouteRepository routes;
    private final ProductRepository products;
    private final SubscriptionRepository subscriptions;
    private final InvoiceRepository invoices;
    private final CustomerSearchIndex searchIndex;

    public CustomerService(CustomerRepository customers, RouteRepository routes,
                          ProductRepository products, SubscriptionRepository subscriptions,
                          InvoiceRepository invoices, CustomerSearchIndex searchIndex) {
        this.customers = customers;
        this.routes = routes;
        this.products = products;
        this.subscriptions = subscriptions;
        this.invoices = invoices;
        this.searchIndex = searchIndex;
    }

    @Transactional(readOnly = true)
    public PageResponse<CustomerDtos.CustomerView> page(Long businessId, Long routeId,
                                                       boolean activeOnly, Pageable pageable) {
        Page<Customer> page;
        if (routeId == null) {
            page = activeOnly
                    ? customers.findByBusinessIdAndActiveTrueOrderByNameAsc(businessId, pageable)
                    : customers.findByBusinessIdOrderByNameAsc(businessId, pageable);
        } else {
            page = activeOnly
                    ? customers.findByBusinessIdAndRouteIdAndActiveTrueOrderByNameAsc(businessId, routeId, pageable)
                    : customers.findByBusinessIdAndRouteIdOrderByNameAsc(businessId, routeId, pageable);
        }
        Enrichment enrichment = enrich(businessId, page.getContent());
        return PageResponse.of(
                page.getContent().stream().map(customer -> toView(customer, enrichment)).toList(),
                page.getNumber(), page.getSize(), page.getTotalElements());
    }

    @Transactional(readOnly = true)
    public CustomerDtos.CustomerView get(Long businessId, Long id) {
        Customer customer = require(businessId, id);
        return toView(customer, enrich(businessId, List.of(customer)));
    }

    @Transactional(readOnly = true)
    public Customer require(Long businessId, Long id) {
        return customers.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", id));
    }

    @Transactional(readOnly = true)
    public List<CustomerDtos.CustomerHit> search(Long businessId, String term, int limit) {
        int capped = Math.max(1, Math.min(limit, 50));
        List<Long> ids = searchIndex.search(businessId, term, capped);
        if (ids.isEmpty()) {
            return List.of();
        }
        Map<Long, String> routeNames = routeNames(businessId);
        List<Customer> found = customers.findByBusinessIdAndIdIn(businessId, ids);
        Map<Long, Customer> byId = new HashMap<>();
        for (Customer customer : found) {
            byId.put(customer.getId(), customer);
        }
        List<CustomerDtos.CustomerHit> hits = new ArrayList<>(ids.size());
        for (Long id : ids) {
            Customer customer = byId.get(id);
            if (customer != null) {
                hits.add(new CustomerDtos.CustomerHit(customer.getId(), customer.getName(),
                        customer.getPhone(), customer.getAddress(),
                        customer.getRouteId() == null ? null : routeNames.get(customer.getRouteId())));
            }
        }
        hits.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
        return hits;
    }
    @Transactional
    public CustomerDtos.CustomerView create(Long businessId, CustomerDtos.CustomerRequest request) {
        String phone = request.phone().trim();
        if (customers.existsByBusinessIdAndPhone(businessId, phone)) {
            throw new ConflictException("A customer with phone " + phone + " already exists.");
        }
        Customer customer = new Customer();
        customer.setBusinessId(businessId);
        apply(customer, request, businessId);
        customers.save(customer);
        searchIndex.index(customer);
        return toView(customer, enrich(businessId, List.of(customer)));
    }

    @Transactional
    public CustomerDtos.CustomerView update(Long businessId, Long id, CustomerDtos.CustomerRequest request) {
        Customer customer = require(businessId, id);
        String phone = request.phone().trim();
        if (!phone.equals(customer.getPhone()) && customers.existsByBusinessIdAndPhone(businessId, phone)) {
            throw new ConflictException("A customer with phone " + phone + " already exists.");
        }
        apply(customer, request, businessId);
        customers.save(customer);
        searchIndex.evict(businessId);
        return toView(customer, enrich(businessId, List.of(customer)));
    }

    @Transactional
    public CustomerDtos.CustomerView setActive(Long businessId, Long id, boolean active) {
        Customer customer = require(businessId, id);
        customer.setActive(active);
        customers.save(customer);
        searchIndex.evict(businessId);
        return toView(customer, enrich(businessId, List.of(customer)));
    }

    /**
     * "Split this beat into N walkable groups." Single-linkage clustering over the MST of the
     * customers' coordinates, so groups follow the actual shape of the neighbourhood instead of
     * arbitrary grid boxes.
     */
    @Transactional(readOnly = true)
    public CustomerDtos.BeatPlanResponse planBeats(Long businessId, Long routeId,
                                                  int desiredClusters, double maxLinkMetres) {
        List<Customer> pool = routeId == null
                ? customers.findByBusinessIdAndActiveTrue(businessId)
                : customers.findByBusinessIdAndRouteIdAndActiveTrueOrderByNameAsc(businessId, routeId);
        List<Customer> located = new ArrayList<>();
        List<GeoPoint> points = new ArrayList<>();
        for (Customer customer : pool) {
            if (customer.getLat() == 0.0 && customer.getLng() == 0.0) {
                continue;
            }
            located.add(customer);
            points.add(new GeoPoint(customer.getLat(), customer.getLng()));
        }
        if (points.size() > MAX_CLUSTER_POINTS) {
            throw new BadRequestException("Beat planning handles up to " + MAX_CLUSTER_POINTS
                    + " located customers at a time. Filter by route first.");
        }
        int unplaced = pool.size() - located.size();
        Map<Long, String> routeNames = routeNames(businessId);
        List<CustomerDtos.BeatCluster> clusters = new ArrayList<>();
        int index = 1;
        for (GeoClusterer.Cluster cluster : GeoClusterer.cluster(points, desiredClusters, maxLinkMetres)) {
            List<CustomerDtos.CustomerHit> members = new ArrayList<>(cluster.size());
            for (int position : cluster.memberIndexes()) {
                Customer customer = located.get(position);
                members.add(new CustomerDtos.CustomerHit(customer.getId(), customer.getName(),
                        customer.getPhone(), customer.getAddress(),
                        customer.getRouteId() == null ? null : routeNames.get(customer.getRouteId())));
            }
            members.sort((a, b) -> a.name().compareToIgnoreCase(b.name()));
            clusters.add(new CustomerDtos.BeatCluster(index++, cluster.size(),
                    cluster.centroid().lat(), cluster.centroid().lng(),
                    Math.round(cluster.radiusMetres() * 10.0) / 10.0, members));
        }
        String routeName = routeId == null ? "All routes" : routeNames.getOrDefault(routeId, "Route " + routeId);
        return new CustomerDtos.BeatPlanResponse(routeId, routeName, desiredClusters,
                maxLinkMetres, unplaced, clusters);
    }
    private void apply(Customer customer, CustomerDtos.CustomerRequest request, Long businessId) {
        if (request.routeId() != null) {
            Route route = routes.findByIdAndBusinessId(request.routeId(), businessId)
                    .orElseThrow(() -> new BadRequestException(
                            "Route " + request.routeId() + " does not belong to this business."));
            customer.setRouteId(route.getId());
        } else {
            customer.setRouteId(null);
        }
        customer.setName(request.name().trim());
        customer.setPhone(request.phone().trim());
        customer.setAddress(request.address() == null || request.address().isBlank()
                ? "Address not captured" : request.address().trim());
        customer.setLandmark(request.landmark() == null || request.landmark().isBlank()
                ? null : request.landmark().trim());
        customer.setLat(request.lat() == null ? 0.0 : request.lat());
        customer.setLng(request.lng() == null ? 0.0 : request.lng());
        customer.setNotes(request.notes() == null || request.notes().isBlank()
                ? null : request.notes().trim());
        if (request.active() != null) {
            customer.setActive(request.active());
        }
        if (request.joinedOn() != null) {
            customer.setJoinedOn(request.joinedOn());
        } else if (customer.getJoinedOn() == null) {
            customer.setJoinedOn(LocalDate.now());
        }
    }

    /** Per-page enrichment: three queries, no matter how many rows. */
    private record Enrichment(Map<Long, String> routeNames,
                              Map<Long, Integer> lineCounts,
                              Map<Long, Long> monthlyValue,
                              Map<Long, Long> outstanding) {
    }

    private Enrichment enrich(Long businessId, List<Customer> rows) {
        if (rows.isEmpty()) {
            return new Enrichment(Map.of(), Map.of(), Map.of(), Map.of());
        }
        List<Long> ids = rows.stream().map(Customer::getId).toList();
        Map<Long, Long> prices = new HashMap<>();
        for (Product product : products.findByBusinessId(businessId)) {
            prices.put(product.getId(), product.getPricePaise());
        }
        Map<Long, Integer> counts = new HashMap<>();
        Map<Long, Long> value = new HashMap<>();
        for (Subscription line : subscriptions.findByBusinessIdAndCustomerIdInAndActiveTrue(businessId, ids)) {
            counts.merge(line.getCustomerId(), 1, Integer::sum);
            long unit = prices.getOrDefault(line.getProductId(), 0L);
            value.merge(line.getCustomerId(), monthlyValuePaise(line, unit), Long::sum);
        }
        Map<Long, Long> dues = new HashMap<>();
        for (Object[] row : invoices.outstandingByCustomer(businessId, OPEN)) {
            dues.put(asLong(row[0]), asLong(row[1]));
        }
        return new Enrichment(routeNames(businessId), counts, value, dues);
    }

    /** Rough but honest monthly run-rate for one standing order, in paise. */
    static long monthlyValuePaise(Subscription line, long unitPricePaise) {
        long perDelivery = unitPricePaise * line.getQuantity();
        Frequency frequency = line.getFrequency() == null ? Frequency.DAILY : line.getFrequency();
        return switch (frequency) {
            case DAILY -> perDelivery * 30L;
            case ALTERNATE_DAY -> perDelivery * 15L;
            case WEEKLY_DAYS -> perDelivery * Integer.bitCount(line.getWeekdayMask() & 127) * 30L / 7L;
        };
    }

    private Map<Long, String> routeNames(Long businessId) {
        Map<Long, String> names = new LinkedHashMap<>();
        for (Route route : routes.findByBusinessIdOrderByNameAsc(businessId)) {
            names.put(route.getId(), route.getName());
        }
        return names;
    }

    private CustomerDtos.CustomerView toView(Customer customer, Enrichment enrichment) {
        return new CustomerDtos.CustomerView(customer.getId(), customer.getRouteId(),
                customer.getRouteId() == null ? null : enrichment.routeNames().get(customer.getRouteId()),
                customer.getName(), customer.getPhone(), customer.getAddress(), customer.getLandmark(),
                customer.getLat(), customer.getLng(), customer.getNotes(), customer.isActive(),
                customer.getJoinedOn(),
                enrichment.lineCounts().getOrDefault(customer.getId(), 0),
                enrichment.monthlyValue().getOrDefault(customer.getId(), 0L),
                enrichment.outstanding().getOrDefault(customer.getId(), 0L));
    }

    static long asLong(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
