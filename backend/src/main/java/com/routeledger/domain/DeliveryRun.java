package com.routeledger.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "delivery_runs")
public class DeliveryRun {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "route_id", nullable = false)
    private Long routeId;

    @Column(name = "run_date", nullable = false)
    private LocalDate runDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private RunStatus status = RunStatus.PLANNED;

    @Column(name = "total_stops", nullable = false)
    private int totalStops;

    @Column(name = "completed_stops", nullable = false)
    private int completedStops;

    @Column(name = "planned_metres", nullable = false)
    private int plannedMetres;

    @Column(name = "greedy_metres", nullable = false)
    private int greedyMetres;

    @Column(name = "baseline_metres", nullable = false)
    private int baselineMetres;

    @Column(name = "two_opt_swaps", nullable = false)
    private int twoOptSwaps;

    @Column(name = "distance_model", nullable = false, length = 20)
    private String distanceModel = "ROAD_APPROX";

    @Column(name = "sequenced_at")
    private Instant sequencedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }
    public Long getRouteId() { return routeId; }
    public void setRouteId(Long routeId) { this.routeId = routeId; }
    public LocalDate getRunDate() { return runDate; }
    public void setRunDate(LocalDate runDate) { this.runDate = runDate; }
    public RunStatus getStatus() { return status; }
    public void setStatus(RunStatus status) { this.status = status; }
    public int getTotalStops() { return totalStops; }
    public void setTotalStops(int totalStops) { this.totalStops = totalStops; }
    public int getCompletedStops() { return completedStops; }
    public void setCompletedStops(int completedStops) { this.completedStops = completedStops; }
    public int getPlannedMetres() { return plannedMetres; }
    public void setPlannedMetres(int plannedMetres) { this.plannedMetres = plannedMetres; }
    public int getGreedyMetres() { return greedyMetres; }
    public void setGreedyMetres(int greedyMetres) { this.greedyMetres = greedyMetres; }
    public int getBaselineMetres() { return baselineMetres; }
    public void setBaselineMetres(int baselineMetres) { this.baselineMetres = baselineMetres; }
    public int getTwoOptSwaps() { return twoOptSwaps; }
    public void setTwoOptSwaps(int twoOptSwaps) { this.twoOptSwaps = twoOptSwaps; }
    public String getDistanceModel() { return distanceModel; }
    public void setDistanceModel(String distanceModel) { this.distanceModel = distanceModel; }
    public Instant getSequencedAt() { return sequencedAt; }
    public void setSequencedAt(Instant sequencedAt) { this.sequencedAt = sequencedAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
