package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Route;
import com.routeledger.dsa.BinaryHeap;
import com.routeledger.dto.CollectionDtos;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.InvoiceRepository;
import com.routeledger.repository.RouteRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The collections queue - the feature that pays for the subscription.
 *
 * <p>Small delivery businesses lose 5-15% of revenue to dues that were never chased in the right
 * order. Sorting by amount alone chases a rich customer who always pays; sorting by age alone
 * chases a tiny balance. So each debtor gets a composite risk score (money at stake, weighted by
 * how long it has been rotting, weighted by how fragmented the balance is) and the rows are
 * ordered by a hand-written {@link BinaryHeap} max-heap. Popping k gives the top-k in
 * O(n + k log n) without sorting the whole ledger.</p>
 */
@Service
public class CollectionService {

    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 500;

    private final InvoiceRepository invoices;
    private final CustomerRepository customers;
    private final RouteRepository routes;

    public CollectionService(InvoiceRepository invoices,
                            CustomerRepository customers,
                            RouteRepository routes) {
        this.invoices = invoices;
        this.customers = customers;
        this.routes = routes;
    }

    @Transactional(readOnly = true)
    public CollectionDtos.DuesResponse dues(Long businessId, Integer limit) {
        int cap = limit == null || limit <= 0 ? DEFAULT_LIMIT : Math.min(limit, MAX_LIMIT);
        List<Object[]> rows = invoices.outstandingByCustomer(businessId, InvoiceService.openStatuses());
        if (rows.isEmpty()) {
            return new CollectionDtos.DuesResponse(0L, 0, 0L, 0L, List.of());
        }

        LocalDate today = LocalDate.now();
        List<Long> customerIds = new ArrayList<>(rows.size());
        for (Object[] row : rows) {
            customerIds.add(asLong(row[0]));
        }
        Map<Long, Customer> people = new HashMap<>();
        for (Customer customer : customers.findByBusinessIdAndIdIn(businessId, customerIds)) {
            people.put(customer.getId(), customer);
        }
        Map<Long, String> routeNames = new HashMap<>();
        for (Route route : routes.findByBusinessIdOrderByNameAsc(businessId)) {
            routeNames.put(route.getId(), route.getName());
        }

        // Max-heap: highest risk pops first.
        BinaryHeap<CollectionDtos.DuesRow> heap = new BinaryHeap<>(
                Comparator.comparingDouble(CollectionDtos.DuesRow::riskScore).reversed()
                        .thenComparing(Comparator.comparingLong(
                                CollectionDtos.DuesRow::outstandingPaise).reversed()));

        long totalOutstanding = 0L;
        long overdue30 = 0L;
        long overdue60 = 0L;
        int owing = 0;

        for (Object[] row : rows) {
            Long customerId = asLong(row[0]);
            long outstanding = asLong(row[1]);
            if (outstanding <= 0L) {
                continue;
            }
            LocalDate oldestDue = asDate(row[2]);
            long openInvoices = asLong(row[3]);
            long daysOverdue = oldestDue == null || !oldestDue.isBefore(today)
                    ? 0L
                    : ChronoUnit.DAYS.between(oldestDue, today);

            totalOutstanding += outstanding;
            owing++;
            if (daysOverdue >= 60L) {
                overdue60 += outstanding;
                overdue30 += outstanding;
            } else if (daysOverdue >= 30L) {
                overdue30 += outstanding;
            }

            Customer customer = people.get(customerId);
            String routeName = customer == null || customer.getRouteId() == null
                    ? null
                    : routeNames.get(customer.getRouteId());
            double score = riskScore(outstanding, daysOverdue, openInvoices,
                    customer != null && customer.isActive());
            heap.push(new CollectionDtos.DuesRow(customerId,
                    customer == null ? "Customer #" + customerId : customer.getName(),
                    customer == null ? null : customer.getPhone(),
                    routeName, outstanding, oldestDue, daysOverdue, openInvoices,
                    round2(score), bucket(daysOverdue),
                    suggestedAction(daysOverdue, outstanding,
                            customer != null && customer.isActive())));
        }

        List<CollectionDtos.DuesRow> top = new ArrayList<>(Math.min(cap, heap.size()));
        while (!heap.isEmpty() && top.size() < cap) {
            top.add(heap.pop());
        }
        return new CollectionDtos.DuesResponse(totalOutstanding, owing, overdue30, overdue60, top);
    }

    /**
     * Rupees at stake, amplified by age and fragmentation. Ageing is deliberately super-linear:
     * a 60-day-old balance is far more likely to be written off than two 30-day ones.
     */
    static double riskScore(long outstandingPaise, long daysOverdue, long openInvoices, boolean active) {
        double rupees = outstandingPaise / 100.0;
        double money = Math.log10(1.0 + rupees) * 20.0;
        double age = Math.pow(Math.max(0L, daysOverdue), 1.35) * 0.8;
        double fragmentation = Math.max(0L, openInvoices - 1L) * 6.0;
        // A customer still receiving deliveries is easier to collect from - the agent sees them daily.
        double reachability = active ? 0.0 : 15.0;
        return money + age + fragmentation + reachability;
    }

    static String bucket(long daysOverdue) {
        if (daysOverdue <= 0L) {
            return "CURRENT";
        }
        if (daysOverdue <= 15L) {
            return "DUE_SOON";
        }
        if (daysOverdue <= 30L) {
            return "OVERDUE_30";
        }
        if (daysOverdue <= 60L) {
            return "OVERDUE_60";
        }
        return "AT_RISK";
    }

    static String suggestedAction(long daysOverdue, long outstandingPaise, boolean active) {
        if (daysOverdue <= 0L) {
            return "Collect on the next delivery.";
        }
        if (daysOverdue <= 15L) {
            return "Send the bill on WhatsApp and ask the agent to collect tomorrow.";
        }
        if (daysOverdue <= 30L) {
            return active
                    ? "Call today. Offer UPI so the agent does not carry cash."
                    : "Call today - this household is inactive and getting harder to reach.";
        }
        if (daysOverdue <= 60L) {
            return outstandingPaise >= 200000L
                    ? "Visit in person. Agree a two-part settlement before the next cycle."
                    : "Final reminder call, then pause the subscription until cleared.";
        }
        return "Pause deliveries and settle in writing before resuming.";
    }

    private static double round2(double value) {
        return Math.round(value * 100.0) / 100.0;
    }

    static LocalDate asDate(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate date) {
            return date;
        }
        if (value instanceof java.sql.Date sqlDate) {
            return sqlDate.toLocalDate();
        }
        return LocalDate.parse(value.toString().substring(0, 10));
    }

    static long asLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(value.toString());
    }
}
