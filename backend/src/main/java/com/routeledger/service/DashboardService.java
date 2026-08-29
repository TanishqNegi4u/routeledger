package com.routeledger.service;

import com.routeledger.domain.DeliveryRun;
import com.routeledger.domain.StopStatus;
import com.routeledger.dto.CollectionDtos;
import com.routeledger.dto.DashboardDtos;
import com.routeledger.dto.RunDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryPauseRepository;
import com.routeledger.repository.DeliveryRunRepository;
import com.routeledger.repository.DeliveryStopItemRepository;
import com.routeledger.repository.DeliveryStopRepository;
import com.routeledger.repository.InvoiceRepository;
import com.routeledger.repository.PaymentRepository;
import com.routeledger.repository.RouteRepository;
import com.routeledger.repository.SubscriptionRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The owner's morning screen, assembled in one round trip.
 *
 * <p>Everything here is a grouped aggregate rather than a row scan, and the two chart series are
 * gap-filled server-side so the frontend never has to reason about missing days. The dashboard is
 * also where the route optimiser proves its worth: metres saved this month is the difference
 * between the as-entered baseline and the sequenced plan, summed over every run.</p>
 */
@Service
public class DashboardService {

    private static final int DEFAULT_WINDOW_DAYS = 14;
    private static final int MAX_WINDOW_DAYS = 92;
    private static final int TOP_PRODUCTS = 6;
    private static final int TOP_DUES = 8;

    private final CustomerRepository customers;
    private final RouteRepository routes;
    private final SubscriptionRepository subscriptions;
    private final DeliveryPauseRepository pauses;
    private final DeliveryRunRepository runs;
    private final DeliveryStopRepository stops;
    private final DeliveryStopItemRepository stopItems;
    private final InvoiceRepository invoices;
    private final PaymentRepository payments;
    private final RunService runService;
    private final CollectionService collectionService;

    public DashboardService(CustomerRepository customers,
                           RouteRepository routes,
                           SubscriptionRepository subscriptions,
                           DeliveryPauseRepository pauses,
                           DeliveryRunRepository runs,
                           DeliveryStopRepository stops,
                           DeliveryStopItemRepository stopItems,
                           InvoiceRepository invoices,
                           PaymentRepository payments,
                           RunService runService,
                           CollectionService collectionService) {
        this.customers = customers;
        this.routes = routes;
        this.subscriptions = subscriptions;
        this.pauses = pauses;
        this.runs = runs;
        this.stops = stops;
        this.stopItems = stopItems;
        this.invoices = invoices;
        this.payments = payments;
        this.runService = runService;
        this.collectionService = collectionService;
    }

    @Transactional(readOnly = true)
    public DashboardDtos.DashboardView overview(Long businessId, LocalDate from, LocalDate to) {
        LocalDate today = LocalDate.now();
        LocalDate end = to == null ? today : to;
        LocalDate start = from == null ? end.minusDays(DEFAULT_WINDOW_DAYS - 1L) : from;
        if (end.isBefore(start)) {
            throw new BadRequestException("'to' cannot be before 'from'.");
        }
        if (ChronoUnit.DAYS.between(start, end) + 1L > MAX_WINDOW_DAYS) {
            throw new BadRequestException("Charts cover at most " + MAX_WINDOW_DAYS + " days.");
        }
        LocalDate monthStart = today.withDayOfMonth(1);

        Map<String, Long> todayStatus = statusCounts(stops.statusBreakdown(businessId, today, today));
        long todayStops = 0L;
        for (Long count : todayStatus.values()) {
            todayStops += count;
        }

        long todayRevenue = sumValue(stops.revenueByDay(businessId, StopStatus.DELIVERED, today, today));
        long monthRevenue = sumValue(
                stops.revenueByDay(businessId, StopStatus.DELIVERED, monthStart, today));
        long monthCollected = zero(payments.collectedBetween(businessId, monthStart, today));
        long outstanding = zero(invoices.outstandingTotal(businessId, InvoiceService.openStatuses()));
        long overdueInvoices = invoices.countOverdue(businessId,
                InvoiceService.openStatuses(), today);

        // What the hand-written optimiser bought the business this month, in metres.
        long baseline = 0L;
        long planned = 0L;
        for (DeliveryRun run : runs.findByBusinessIdAndRunDateBetweenOrderByRunDateAsc(
                businessId, monthStart, today)) {
            if (run.getBaselineMetres() > 0) {
                baseline += run.getBaselineMetres();
                planned += run.getPlannedMetres();
            }
        }
        int savedMetres = (int) Math.max(0L, Math.min(Integer.MAX_VALUE, baseline - planned));
        double avgSavedPercent = baseline <= 0L
                ? 0.0
                : Math.round((baseline - planned) * 10000.0 / baseline) / 100.0;

        DashboardDtos.Summary summary = new DashboardDtos.Summary(
                customers.countByBusinessIdAndActiveTrue(businessId),
                routes.countByBusinessIdAndActiveTrue(businessId),
                subscriptions.countByBusinessIdAndActiveTrue(businessId),
                pauses.countActiveOn(businessId, today),
                todayStops,
                todayStatus.getOrDefault(StopStatus.DELIVERED.name(), 0L),
                todayStatus.getOrDefault(StopStatus.PENDING.name(), 0L),
                todayRevenue,
                monthRevenue,
                monthCollected,
                outstanding,
                overdueInvoices,
                savedMetres,
                avgSavedPercent);

        List<DashboardDtos.DayPoint> revenueSeries = series(
                stops.revenueByDay(businessId, StopStatus.DELIVERED, start, end), start, end);
        List<DashboardDtos.DayPoint> collectionSeries = series(
                payments.collectedByDay(businessId, start, end), start, end);

        List<DashboardDtos.StatusSlice> slices = new ArrayList<>();
        for (Map.Entry<String, Long> entry
                : statusCounts(stops.statusBreakdown(businessId, start, end)).entrySet()) {
            slices.add(new DashboardDtos.StatusSlice(entry.getKey(), entry.getValue()));
        }

        List<DashboardDtos.TopProduct> top = new ArrayList<>();
        for (Object[] row : stopItems.topProducts(businessId, StopStatus.DELIVERED, start, end)) {
            if (top.size() >= TOP_PRODUCTS) {
                break;
            }
            top.add(new DashboardDtos.TopProduct(row[0] == null ? "Item" : row[0].toString(),
                    asLong(row[1]), asLong(row[2])));
        }

        List<RunDtos.RunView> todayRuns = runService.forDate(businessId, today);
        List<CollectionDtos.DuesRow> topDues = collectionService.dues(businessId, TOP_DUES).rows();

        return new DashboardDtos.DashboardView(start, end, summary, revenueSeries, collectionSeries,
                slices, top, todayRuns, topDues);
    }

    /**
     * Turns grouped rows of [day, valuePaise, count] into a dense day-by-day series. Gap filling
     * happens here so Chart.js gets a continuous axis without any client-side date arithmetic.
     */
    private static List<DashboardDtos.DayPoint> series(List<Object[]> rows,
                                                      LocalDate from,
                                                      LocalDate to) {
        Map<LocalDate, long[]> byDay = new HashMap<>();
        for (Object[] row : rows) {
            LocalDate day = CollectionService.asDate(row[0]);
            if (day == null) {
                continue;
            }
            long[] slot = byDay.computeIfAbsent(day, key -> new long[2]);
            slot[0] += asLong(row[1]);
            slot[1] += row.length > 2 ? asLong(row[2]) : 0L;
        }
        List<DashboardDtos.DayPoint> points = new ArrayList<>();
        for (LocalDate day = from; !day.isAfter(to); day = day.plusDays(1)) {
            long[] slot = byDay.get(day);
            points.add(new DashboardDtos.DayPoint(day,
                    slot == null ? 0L : slot[0],
                    slot == null ? 0L : slot[1]));
        }
        return points;
    }

    private static Map<String, Long> statusCounts(List<Object[]> rows) {
        Map<String, Long> counts = new LinkedHashMap<>();
        for (Object[] row : rows) {
            counts.merge(row[0] == null ? "UNKNOWN" : row[0].toString(), asLong(row[1]), Long::sum);
        }
        return counts;
    }

    private static long sumValue(List<Object[]> rows) {
        long total = 0L;
        for (Object[] row : rows) {
            total += asLong(row[1]);
        }
        return total;
    }

    private static long zero(Long value) {
        return value == null ? 0L : value;
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
