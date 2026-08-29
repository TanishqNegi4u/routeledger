package com.routeledger.dto;

import com.routeledger.domain.PaymentMode;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Cash / UPI collection payloads. */
public final class PaymentDtos {

    private PaymentDtos() {
    }

    public record PaymentRequest(
            @NotNull Long customerId,
            /** Null lets the service settle the oldest open invoices first. */
            Long invoiceId,
            @NotNull @Min(1) Long amountPaise,
            @NotNull PaymentMode mode,
            LocalDate paidOn,
            @Size(max = 80) String reference) {
    }

    public record PaymentView(Long id,
                              Long customerId,
                              String customerName,
                              Long invoiceId,
                              long amountPaise,
                              String mode,
                              LocalDate paidOn,
                              String reference) {
    }

    public record PaymentReceipt(PaymentView payment,
                                 long remainingOutstandingPaise,
                                 java.util.List<Long> settledInvoiceIds,
                                 boolean possibleDuplicate) {
    }
}
