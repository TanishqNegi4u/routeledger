package com.routeledger.dto;

import com.routeledger.domain.ApprovalStatus;
import com.routeledger.domain.Frequency;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

public final class MarketplaceDtos {

    private MarketplaceDtos() {
    }

    public record VendorProductView(
            Long id,
            String name,
            String unitLabel,
            long pricePaise,
            String category) {
    }

    public record VendorView(
            Long id,
            String name,
            String city,
            String state,
            String phone,
            List<VendorProductView> products) {
    }

    public record CustomerSubscriptionRequest(
            @NotNull Long businessId,
            @NotBlank @Size(max = 140) String customerName,
            @NotBlank @Size(max = 20) String phone,
            @NotBlank @Size(max = 255) String address,
            String landmark,
            Double lat,
            Double lng,
            @NotNull Long productId,
            @Min(1) @Max(999) int quantity,
            @NotNull Frequency frequency,
            @Min(0) @Max(127) int weekdayMask,
            @NotNull LocalDate startOn,
            @Min(1) @Max(365) int advanceDays,
            @NotNull @Min(1) Long advanceAmountPaise,
            @NotBlank String paymentReference) {
    }

    public record CustomerSubscriptionView(
            Long id,
            Long businessId,
            String vendorName,
            Long customerId,
            String customerName,
            String phone,
            Long productId,
            String productName,
            String unitLabel,
            int quantity,
            long perDeliveryPaise,
            String frequency,
            String weekdayLabel,
            LocalDate startOn,
            ApprovalStatus approvalStatus,
            long advancePaidPaise,
            boolean active,
            boolean isTomorrowSkipped) {
    }

    public record CustomerDashboardResponse(
            String phone,
            String customerName,
            long totalAdvanceCreditPaise,
            List<CustomerSubscriptionView> subscriptions,
            List<PauseDtos.PauseView> upcomingPauses) {
    }
}
