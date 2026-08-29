package com.routeledger.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "routes")
public class Route {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(nullable = false, length = 80)
    private String name;

    @Column(name = "agent_id")
    private Long agentId;

    @Column(name = "depot_label", nullable = false, length = 160)
    private String depotLabel;

    @Column(name = "depot_lat", nullable = false)
    private double depotLat;

    @Column(name = "depot_lng", nullable = false)
    private double depotLng;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public Long getAgentId() { return agentId; }
    public void setAgentId(Long agentId) { this.agentId = agentId; }
    public String getDepotLabel() { return depotLabel; }
    public void setDepotLabel(String depotLabel) { this.depotLabel = depotLabel; }
    public double getDepotLat() { return depotLat; }
    public void setDepotLat(double depotLat) { this.depotLat = depotLat; }
    public double getDepotLng() { return depotLng; }
    public void setDepotLng(double depotLng) { this.depotLng = depotLng; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
