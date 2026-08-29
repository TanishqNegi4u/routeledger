package com.routeledger.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "delivery_stop_items")
public class DeliveryStopItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "stop_id", nullable = false)
    private Long stopId;

    @Column(name = "product_id", nullable = false)
    private Long productId;

    @Column(name = "product_name", nullable = false, length = 120)
    private String productName;

    @Column(nullable = false)
    private int quantity;

    @Column(name = "unit_price_paise", nullable = false)
    private long unitPricePaise;

    @Column(name = "line_total_paise", nullable = false)
    private long lineTotalPaise;

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getStopId() { return stopId; }
    public void setStopId(Long stopId) { this.stopId = stopId; }
    public Long getProductId() { return productId; }
    public void setProductId(Long productId) { this.productId = productId; }
    public String getProductName() { return productName; }
    public void setProductName(String productName) { this.productName = productName; }
    public int getQuantity() { return quantity; }
    public void setQuantity(int quantity) { this.quantity = quantity; }
    public long getUnitPricePaise() { return unitPricePaise; }
    public void setUnitPricePaise(long unitPricePaise) { this.unitPricePaise = unitPricePaise; }
    public long getLineTotalPaise() { return lineTotalPaise; }
    public void setLineTotalPaise(long lineTotalPaise) { this.lineTotalPaise = lineTotalPaise; }
}
