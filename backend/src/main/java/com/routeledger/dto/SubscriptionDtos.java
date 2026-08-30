package com.routeledger.dto;

import com.routeledger.domain.ApprovalStatus;
import com.routeledger.domain.Frequency;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.time.LocalDate;

/** Standing-order payloads with advance payment and owner approval lifecycle. */
public final class SubscriptionDtos {

    private SubscriptionDtos() {
    }

    public record SubscriptionRequest(
            @NotNull Long customerId,
            @NotNull Long productId,
            @Min(1) @Max(999) int quantity,
            @NotNull Frequency frequency,
            @Min(0) @Max(127) int weekdayMask,
            @NotNull LocalDate startOn,
            LocalDate endOn,
            Boolean active) {
    }

    public record AdvanceSubscribeRequest(
            @NotBlank @Size(max = 140) String customerName,
            @NotBlank @Size(max = 20) String phone,
            @NotBlank @Size(max = 255) String address,
            String landmark,
            Double lat,
            Double lng,
            @NotNull Long routeId,
            @NotNull Long productId,
            @Min(1) @Max(999) int quantity,
            @NotNull Frequency frequency,
            @Min(0) @Max(127) int weekdayMask,
            @NotNull LocalDate startOn,
            LocalDate endOn,
            @NotNull @Min(1) Long advanceAmountPaise,
            @NotBlank String paymentReference) {
    }

    public record SubscriptionView(Long id,
                                   Long customerId,
                                   String customerName,
                                   Long productId,
                                   String productName,
                                   String unitLabel,
                                   int quantity,
                                   long unitPricePaise,
                                   long perDeliveryPaise,
                                   String frequency,
                                   int weekdayMask,
                                   String weekdayLabel,
                                   LocalDate startOn,
                                   LocalDate endOn,
                                   boolean active,
                                   ApprovalStatus approvalStatus,
                                   long advancePaidPaise,
                                   Instant approvedAt) {
    }

    public record ApprovalSummaryResponse(
            long pendingCount,
            java.util.List<SubscriptionView> pendingSubscriptions) {
    }
}
