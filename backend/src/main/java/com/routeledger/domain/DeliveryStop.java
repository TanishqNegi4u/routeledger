package com.routeledger.domain;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "delivery_stops")
public class DeliveryStop {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "run_id", nullable = false)
    private Long runId;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(nullable = false)
    private int seq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private StopStatus status = StopStatus.PENDING;

    @Column(name = "amount_paise", nullable = false)
    private long amountPaise;

    @Column(name = "leg_metres", nullable = false)
    private int legMetres;

    @Column(name = "delivered_at")
    private Instant deliveredAt;

    @Column(length = 200)
    private String note;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }
    public Long getRunId() { return runId; }
    public void setRunId(Long runId) { this.runId = runId; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public int getSeq() { return seq; }
    public void setSeq(int seq) { this.seq = seq; }
    public StopStatus getStatus() { return status; }
    public void setStatus(StopStatus status) { this.status = status; }
    public long getAmountPaise() { return amountPaise; }
    public void setAmountPaise(long amountPaise) { this.amountPaise = amountPaise; }
    public int getLegMetres() { return legMetres; }
    public void setLegMetres(int legMetres) { this.legMetres = legMetres; }
    public Instant getDeliveredAt() { return deliveredAt; }
    public void setDeliveredAt(Instant deliveredAt) { this.deliveredAt = deliveredAt; }
    public String getNote() { return note; }
    public void setNote(String note) { this.note = note; }
}
