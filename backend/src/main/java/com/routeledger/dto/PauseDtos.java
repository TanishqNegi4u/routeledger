package com.routeledger.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Vacation / skip windows. Overlaps are rejected using the interval tree. */
public final class PauseDtos {

    private PauseDtos() {
    }

    public record PauseRequest(
            @NotNull Long customerId,
            /** Null means "pause every line for this customer". */
            Long subscriptionId,
            @NotNull LocalDate startOn,
            @NotNull LocalDate endOn,
            @Size(max = 120) String reason) {
    }

    public record PauseView(Long id,
                            Long customerId,
                            String customerName,
                            Long subscriptionId,
                            String subscriptionLabel,
                            LocalDate startOn,
                            LocalDate endOn,
                            String reason,
                            long days,
                            boolean activeNow) {
    }
}
