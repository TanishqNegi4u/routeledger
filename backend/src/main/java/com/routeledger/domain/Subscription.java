package com.routeledger.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "subscriptions")
public class Subscription {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(nullable = false)
    private int quantity = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Frequency frequency = Frequency.DAILY;

    /** Bitmask of ISO weekdays: bit 0 = Monday ... bit 6 = Sunday. 127 = every day. */
    @Column(name = "weekday_mask", nullable = false)
    private int weekdayMask = 127;

    @Column(name = "start_on", nullable = false)
    private LocalDate startOn = LocalDate.now();

    @Column(name = "end_on")
    private LocalDate endOn;

    @Column(nullable = false)
    private boolean active = true;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public Frequency getFrequency() { return frequency; }
    public void setFrequency(Frequency frequency) { this.frequency = frequency; }
    public int getWeekdayMask() { return weekdayMask; }
    public void setWeekdayMask(int weekdayMask) { this.weekdayMask = weekdayMask; }
    public LocalDate getStartOn() { return startOn; }
    public void setStartOn(LocalDate startOn) { this.startOn = startOn; }
    public LocalDate getEndOn() { return endOn; }
    public void setEndOn(LocalDate endOn) { this.endOn = endOn; }
    public boolean isActive() { return active; }
    public void setActive(boolean active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
}
