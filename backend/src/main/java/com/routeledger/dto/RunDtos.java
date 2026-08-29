package com.routeledger.dto;

import com.routeledger.domain.StopStatus;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

/** Daily run generation, sequencing and doorstep updates. */
public final class RunDtos {

    private RunDtos() {
    }

    public record GenerateRunRequest(
            @NotNull LocalDate runDate,
            /** Plan several days in one pass. 1 (default) to 14. */
            @Min(1) @Max(14) Integer days,
            /** Empty or null means "every active route". */
            List<Long> routeIds,
            /** GEODESIC or ROAD_APPROX. Defaults to ROAD_APPROX. */
            String distanceModel,
            /** Re-sequence and rebuild runs that already exist for these dates. */
            Boolean replaceExisting) {
    }

    public record RunView(Long id,
                          Long routeId,
                          String routeName,
                          String agentName,
                          LocalDate runDate,
                          String status,
                          int totalStops,
                          int completedStops,
                          int plannedMetres,
                          int greedyMetres,
                          int baselineMetres,
                          int savedMetres,
                          double savedPercent,
                          int twoOptSwaps,
                          String distanceModel,
                          long plannedValuePaise,
                          long collectedValuePaise,
                          Instant sequencedAt) {
    }

    public record StopItemView(Long id,
                               Long productId,
                               String productName,
                               int quantity,
                               long unitPricePaise,
                               long lineTotalPaise) {
    }

    public record StopView(Long id,
                           int seq,
                           Long customerId,
                           String customerName,
                           String phone,
                           String address,
                           String landmark,
                           double lat,
                           double lng,
                           String status,
                           long amountPaise,
                           int legMetres,
                           Instant deliveredAt,
                           String note,
                           List<StopItemView> items) {
    }

    public record RunDetailView(RunView run, List<StopView> stops) {
    }

    public record ItemOverride(
            @NotNull Long productId,
            @Min(0) int quantity) {
    }

    public record StopUpdateRequest(
            @NotNull StopStatus status,
            @Size(max = 200) String note,
            /** Optional quantity corrections captured at the doorstep. */
            @Valid List<ItemOverride> items) {
    }

    public record GenerateRunResponse(LocalDate from,
                                      LocalDate to,
                                      int createdRuns,
                                      int rebuiltRuns,
                                      int skippedRuns,
                                      int totalStops,
                                      int savedMetres,
                                      List<String> messages,
                                      List<RunView> runs) {
    }
}
