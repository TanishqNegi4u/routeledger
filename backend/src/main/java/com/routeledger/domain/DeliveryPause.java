package com.routeledger.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

/** A closed date window during which deliveries are suspended. */
@Entity
@Table(name = "delivery_pauses")
public class DeliveryPause {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    /** Null means every subscription of the customer is paused. */
    @Column(name = "subscription_id")
    private Long subscriptionId;

    @Column(name = "start_on", nullable = false)
    private LocalDate startOn;

    @Column(name = "end_on", nullable = false)
    private LocalDate endOn;

    @Column(length = 120)
    private String reason;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public Long getSubscriptionId() { return subscriptionId; }
    public void setSubscriptionId(Long subscriptionId) { this.subscriptionId = subscriptionId; }
    public LocalDate getStartOn() { return startOn; }
    public void setStartOn(LocalDate startOn) { this.startOn = startOn; }
    public LocalDate getEndOn() { return endOn; }
    public void setEndOn(LocalDate endOn) { this.endOn = endOn; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
