package com.routeledger.dto;

import com.routeledger.domain.Frequency;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.time.LocalDate;

/** Standing-order payloads. */
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
                                   boolean active) {
    }
}
