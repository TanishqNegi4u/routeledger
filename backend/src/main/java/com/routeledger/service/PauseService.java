package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.domain.DeliveryPause;
import com.routeledger.domain.Product;
import com.routeledger.domain.Subscription;
import com.routeledger.dsa.IntervalTree;
import com.routeledger.dto.PauseDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryPauseRepository;
import com.routeledger.repository.ProductRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Vacation and skip windows.
 *
 * <p>Two invariants matter to an owner: a new window must not double-book an existing one for
 * the same scope, and a paused day must never be billed. Both are answered by the augmented AVL
 * {@link IntervalTree} — the write path asks "does anything overlap [start, end]?" in O(log n),
 * and {@link ScheduleResolver} reuses the same structure when it builds the day's runs.
 */
@Service
public class PauseService {

    private static final int MAX_WINDOW_DAYS = 366;

    private final DeliveryPauseRepository pauses;
    private final CustomerRepository customers;
    private final SubscriptionRepository subscriptions;
    private final ProductRepository products;

    public PauseService(DeliveryPauseRepository pauses, CustomerRepository customers,
                        SubscriptionRepository subscriptions, ProductRepository products) {
        this.pauses = pauses;
        this.customers = customers;
        this.subscriptions = subscriptions;
        this.products = products;
    }

    @Transactional(readOnly = true)
    public List<PauseDtos.PauseView> forCustomer(Long businessId, Long customerId) {
        Customer customer = customers.findByIdAndBusinessId(customerId, businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", customerId));
        List<DeliveryPause> rows = pauses.findByCustomerIdOrderByStartOnDesc(customerId);
        Map<Long, String> lineLabels = lineLabels(businessId, customerId);
        List<PauseDtos.PauseView> views = new ArrayList<>(rows.size());
        for (DeliveryPause pause : rows) {
            views.add(toView(pause, customer.getName(), lineLabels));
        }
        return views;
    }

    @Transactional(readOnly = true)
    public List<PauseDtos.PauseView> calendar(Long businessId, LocalDate from, LocalDate to) {
        if (to.isBefore(from)) {
            throw new BadRequestException("The end date cannot be before the start date.");
        }
        List<DeliveryPause> rows = pauses.findOverlapping(businessId, from, to);
        Map<Long, String> names = new HashMap<>();
        for (Customer customer : customers.findByBusinessIdAndActiveTrue(businessId)) {
            names.put(customer.getId(), customer.getName());
        }
        List<PauseDtos.PauseView> views = new ArrayList<>(rows.size());
        for (DeliveryPause pause : rows) {
            views.add(toView(pause, names.getOrDefault(pause.getCustomerId(), "Customer"),
                    Map.of()));
        }
        views.sort((a, b) -> a.startOn().compareTo(b.startOn()));
        return views;
    }

    @Transactional
    public PauseDtos.PauseView create(Long businessId, PauseDtos.PauseRequest request) {
        Customer customer = customers.findByIdAndBusinessId(request.customerId(), businessId)
                .orElseThrow(() -> new BadRequestException(
                        "Customer " + request.customerId() + " does not belong to this business."));
        if (request.endOn().isBefore(request.startOn())) {
            throw new BadRequestException("The pause end date cannot be before the start date.");
        }
        if (ChronoUnit.DAYS.between(request.startOn(), request.endOn()) + 1 > MAX_WINDOW_DAYS) {
            throw new BadRequestException("A pause cannot be longer than a year.");
        }
        Long subscriptionId = null;
        if (request.subscriptionId() != null) {
            Subscription line = subscriptions.findByIdAndBusinessId(request.subscriptionId(), businessId)
                    .orElseThrow(() -> new BadRequestException(
                            "Subscription " + request.subscriptionId() + " was not found."));
            if (!line.getCustomerId().equals(customer.getId())) {
                throw new BadRequestException("That subscription belongs to a different customer.");
            }
            subscriptionId = line.getId();
        }
        assertNoOverlap(customer.getId(), subscriptionId, request.startOn(), request.endOn(), null);

        DeliveryPause pause = new DeliveryPause();
        pause.setBusinessId(businessId);
        pause.setCustomerId(customer.getId());
        pause.setSubscriptionId(subscriptionId);
        pause.setStartOn(request.startOn());
        pause.setEndOn(request.endOn());
        pause.setReason(request.reason() == null || request.reason().isBlank()
                ? null : request.reason().trim());
        pauses.save(pause);
        return toView(pause, customer.getName(), lineLabels(businessId, customer.getId()));
    }

    @Transactional
    public void delete(Long businessId, Long id) {
        DeliveryPause pause = pauses.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> NotFoundException.of("Pause", id));
        pauses.delete(pause);
    }
    /**
     * Rejects a window that would overlap an existing one in the same scope. Household-wide
     * windows also conflict with line-level windows, because a household-wide pause already
     * covers the line.
     */
    private void assertNoOverlap(Long customerId, Long subscriptionId,
                                 LocalDate startOn, LocalDate endOn, Long ignoreId) {
        IntervalTree tree = new IntervalTree();
        for (DeliveryPause existing : pauses.findByCustomerIdOrderByStartOnDesc(customerId)) {
            if (ignoreId != null && ignoreId.equals(existing.getId())) {
                continue;
            }
            boolean sameScope = subscriptionId == null
                    || existing.getSubscriptionId() == null
                    || subscriptionId.equals(existing.getSubscriptionId());
            if (!sameScope) {
                continue;
            }
            tree.insert(existing.getStartOn().toEpochDay(), existing.getEndOn().toEpochDay(),
                    existing.getId() == null ? 0L : existing.getId());
        }
        IntervalTree.Interval clash = tree.firstOverlap(startOn.toEpochDay(), endOn.toEpochDay());
        if (clash != null) {
            throw new ConflictException("That window overlaps an existing pause from "
                    + LocalDate.ofEpochDay(clash.start()) + " to " + LocalDate.ofEpochDay(clash.end()) + ".");
        }
    }

    private Map<Long, String> lineLabels(Long businessId, Long customerId) {
        Map<Long, Product> catalogue = new HashMap<>();
        for (Product product : products.findByBusinessId(businessId)) {
            catalogue.put(product.getId(), product);
        }
        Map<Long, String> labels = new HashMap<>();
        for (Subscription line : subscriptions.findByCustomerIdOrderByIdAsc(customerId)) {
            Product product = catalogue.get(line.getProductId());
            labels.put(line.getId(), (product == null ? "Product" : product.getName())
                    + " x" + line.getQuantity());
        }
        return labels;
    }

    private PauseDtos.PauseView toView(DeliveryPause pause, String customerName,
                                       Map<Long, String> lineLabels) {
        long days = ChronoUnit.DAYS.between(pause.getStartOn(), pause.getEndOn()) + 1;
        LocalDate today = LocalDate.now();
        boolean activeNow = !today.isBefore(pause.getStartOn()) && !today.isAfter(pause.getEndOn());
        String label = pause.getSubscriptionId() == null
                ? "All deliveries"
                : lineLabels.getOrDefault(pause.getSubscriptionId(), "One line");
        return new PauseDtos.PauseView(pause.getId(), pause.getCustomerId(), customerName,
                pause.getSubscriptionId(), label, pause.getStartOn(), pause.getEndOn(),
                pause.getReason(), days, activeNow);
    }
}
