package com.routeledger.dto;

import java.time.LocalDate;
import java.util.List;

/**
 * Collections queue. Rows are ranked by a max-heap over a composite risk score, so the
 * owner always sees the money most likely to be lost at the top.
 */
public final class CollectionDtos {

    private CollectionDtos() {
    }

    public record DuesRow(Long customerId,
                          String customerName,
                          String phone,
                          String routeName,
                          long outstandingPaise,
                          LocalDate oldestDueOn,
                          long daysOverdue,
                          long openInvoices,
                          double riskScore,
                          String bucket,
                          String suggestedAction) {
    }

    public record DuesResponse(long totalOutstandingPaise,
                               int customersOwing,
                               long overdue30Paise,
                               long overdue60Paise,
                               List<DuesRow> rows) {
    }
}
