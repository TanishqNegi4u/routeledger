package com.routeledger.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;
import java.util.List;

/** Month-end billing payloads. */
public final class InvoiceDtos {

    private InvoiceDtos() {
    }

    public record GenerateInvoiceRequest(
            @NotNull LocalDate periodStart,
            @NotNull LocalDate periodEnd,
            /** Empty or null means "every active customer with deliveries in the window". */
            List<Long> customerIds,
            LocalDate dueOn) {
    }

    public record InvoiceLineView(Long id,
                                  String productName,
                                  int quantity,
                                  long unitPricePaise,
                                  long amountPaise) {
    }

    public record InvoiceView(Long id,
                              Long customerId,
                              String customerName,
                              String phone,
                              String address,
                              LocalDate periodStart,
                              LocalDate periodEnd,
                              long subtotalPaise,
                              long adjustmentPaise,
                              long totalPaise,
                              long paidPaise,
                              long outstandingPaise,
                              String status,
                              LocalDate issuedOn,
                              LocalDate dueOn,
                              long daysOverdue,
                              List<InvoiceLineView> lines) {
    }

    public record AdjustRequest(
            long adjustmentPaise,
            @Size(max = 200) String reason) {
    }

    public record GenerateInvoiceResponse(LocalDate periodStart,
                                          LocalDate periodEnd,
                                          int created,
                                          int updated,
                                          int skipped,
                                          long totalBilledPaise,
                                          List<String> messages,
                                          List<InvoiceView> invoices) {
    }
}
