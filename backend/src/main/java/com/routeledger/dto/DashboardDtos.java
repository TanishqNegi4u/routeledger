package com.routeledger.dto;

import java.time.LocalDate;
import java.util.List;

/** Everything the dashboard screen needs in a single round trip. */
public final class DashboardDtos {

    private DashboardDtos() {
    }

    public record Summary(long activeCustomers,
                          long activeRoutes,
                          long activeSubscriptions,
                          long pausedToday,
                          long todayStops,
                          long todayDelivered,
                          long todayPendingStops,
                          long todayRevenuePaise,
                          long monthRevenuePaise,
                          long monthCollectedPaise,
                          long outstandingPaise,
                          long overdueInvoices,
                          int metresSavedThisMonth,
                          double avgSavedPercent) {
    }

    public record DayPoint(LocalDate day, long valuePaise, long count) {
    }

    public record StatusSlice(String status, long count) {
    }

    public record TopProduct(String productName, long quantity, long valuePaise) {
    }

    public record DashboardView(LocalDate from,
                                LocalDate to,
                                Summary summary,
                                List<DayPoint> revenueSeries,
                                List<DayPoint> collectionSeries,
                                List<StatusSlice> stopStatus,
                                List<TopProduct> topProducts,
                                List<RunDtos.RunView> todayRuns,
                                List<CollectionDtos.DuesRow> topDues) {
    }
}
