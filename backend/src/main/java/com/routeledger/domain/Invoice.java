package com.routeledger.domain;

import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;

@Entity
@Table(name = "invoices")
public class Invoice {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "business_id", nullable = false)
    private Long businessId;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @Column(name = "period_start", nullable = false)
    private LocalDate periodStart;

    @Column(name = "period_end", nullable = false)
    private LocalDate periodEnd;

    @Column(name = "subtotal_paise", nullable = false)
    private long subtotalPaise;

    @Column(name = "adjustment_paise", nullable = false)
    private long adjustmentPaise;

    @Column(name = "total_paise", nullable = false)
    private long totalPaise;

    @Column(name = "paid_paise", nullable = false)
    private long paidPaise;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private InvoiceStatus status = InvoiceStatus.UNPAID;

    @Column(name = "issued_on", nullable = false)
    private LocalDate issuedOn;

    @Column(name = "due_on", nullable = false)
    private LocalDate dueOn;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();
    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getBusinessId() { return businessId; }
    public void setBusinessId(Long businessId) { this.businessId = businessId; }
    public Long getCustomerId() { return customerId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public LocalDate getPeriodStart() { return periodStart; }
    public void setPeriodStart(LocalDate periodStart) { this.periodStart = periodStart; }
    public LocalDate getPeriodEnd() { return periodEnd; }
    public void setPeriodEnd(LocalDate periodEnd) { this.periodEnd = periodEnd; }
    public long getSubtotalPaise() { return subtotalPaise; }
    public void setSubtotalPaise(long subtotalPaise) { this.subtotalPaise = subtotalPaise; }
    public long getAdjustmentPaise() { return adjustmentPaise; }
    public void setAdjustmentPaise(long adjustmentPaise) { this.adjustmentPaise = adjustmentPaise; }
    public long getTotalPaise() { return totalPaise; }
    public void setTotalPaise(long totalPaise) { this.totalPaise = totalPaise; }
    public long getPaidPaise() { return paidPaise; }
    public void setPaidPaise(long paidPaise) { this.paidPaise = paidPaise; }
    public InvoiceStatus getStatus() { return status; }
    public void setStatus(InvoiceStatus status) { this.status = status; }
    public LocalDate getIssuedOn() { return issuedOn; }
    public void setIssuedOn(LocalDate issuedOn) { this.issuedOn = issuedOn; }
    public LocalDate getDueOn() { return dueOn; }
    public void setDueOn(LocalDate dueOn) { this.dueOn = dueOn; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public long outstandingPaise() { return Math.max(0L, totalPaise - paidPaise); }
}
