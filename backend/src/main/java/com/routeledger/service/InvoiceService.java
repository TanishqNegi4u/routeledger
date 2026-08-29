package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Invoice;
import com.routeledger.domain.InvoiceLine;
import com.routeledger.domain.InvoiceStatus;
import com.routeledger.domain.StopStatus;
import com.routeledger.dto.InvoiceDtos;
import com.routeledger.dto.PageResponse;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.DeliveryStopItemRepository;
import com.routeledger.repository.InvoiceLineRepository;
import com.routeledger.repository.InvoiceRepository;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Month-end billing. The invoice is never guessed from the subscription - it is assembled from
 * what was actually marked DELIVERED at the doorstep, rolled up per product and unit price. That
 * is the whole reason a milk vendor stops arguing with customers: the bill and the round sheet
 * come from the same rows.
 */
@Service
public class InvoiceService {

    private static final List<InvoiceStatus> OPEN =
            List.of(InvoiceStatus.UNPAID, InvoiceStatus.PARTIAL);
    private static final int MAX_PERIOD_DAYS = 92;
    private static final int DEFAULT_DUE_DAYS = 7;

    private final InvoiceRepository invoices;
    private final InvoiceLineRepository lines;
    private final DeliveryStopItemRepository stopItems;
    private final CustomerRepository customers;

    public InvoiceService(InvoiceRepository invoices,
                          InvoiceLineRepository lines,
                          DeliveryStopItemRepository stopItems,
                          CustomerRepository customers) {
        this.invoices = invoices;
        this.lines = lines;
        this.stopItems = stopItems;
        this.customers = customers;
    }

    // ---------------------------------------------------------------- generation

    @Transactional
    public InvoiceDtos.GenerateInvoiceResponse generate(Long businessId,
                                                       InvoiceDtos.GenerateInvoiceRequest request) {
        LocalDate start = request.periodStart();
        LocalDate end = request.periodEnd();
        if (end.isBefore(start)) {
            throw new BadRequestException("periodEnd cannot be before periodStart.");
        }
        long span = ChronoUnit.DAYS.between(start, end) + 1;
        if (span > MAX_PERIOD_DAYS) {
            throw new BadRequestException("Bill at most " + MAX_PERIOD_DAYS + " days at a time.");
        }
        LocalDate dueOn = request.dueOn() == null ? end.plusDays(DEFAULT_DUE_DAYS) : request.dueOn();
        if (dueOn.isBefore(end)) {
            throw new BadRequestException("dueOn cannot be before the end of the billing period.");
        }

        List<Customer> targets = resolveCustomers(businessId, request.customerIds());
        if (targets.isEmpty()) {
            throw new BadRequestException("No customer matched.");
        }

        List<String> messages = new ArrayList<>();
        List<InvoiceDtos.InvoiceView> views = new ArrayList<>();
        int created = 0;
        int updated = 0;
        int skipped = 0;
        long billed = 0L;

        for (Customer customer : targets) {
            List<Object[]> rows = stopItems.billableLines(customer.getId(), StopStatus.DELIVERED,
                    start, end);
            if (rows.isEmpty()) {
                skipped++;
                continue;
            }
            Optional<Invoice> existing = invoices
                    .findByCustomerIdAndPeriodStartAndPeriodEnd(customer.getId(), start, end);
            if (existing.isPresent() && existing.get().getPaidPaise() > 0L) {
                skipped++;
                messages.add(customer.getName()
                        + ": already has a part-paid invoice for this period, left untouched.");
                views.add(view(existing.get(), customer, lineViews(existing.get().getId())));
                continue;
            }

            Invoice invoice = existing.orElseGet(Invoice::new);
            boolean isNew = invoice.getId() == null;
            if (!isNew) {
                lines.deleteByInvoiceId(invoice.getId());
                lines.flush();
            }
            long subtotal = 0L;
            List<InvoiceLine> batch = new ArrayList<>(rows.size());
            for (Object[] row : rows) {
                String productName = row[0] == null ? "Item" : row[0].toString();
                long unitPrice = asLong(row[1]);
                int quantity = (int) Math.min(Integer.MAX_VALUE, asLong(row[2]));
                long amount = asLong(row[3]);
                if (quantity <= 0 || amount <= 0L) {
                    continue;
                }
                InvoiceLine line = new InvoiceLine();
                line.setProductName(productName);
                line.setUnitPricePaise(unitPrice);
                line.setQuantity(quantity);
                line.setAmountPaise(amount);
                batch.add(line);
                subtotal += amount;
            }
            if (batch.isEmpty()) {
                skipped++;
                continue;
            }

            invoice.setBusinessId(businessId);
            invoice.setCustomerId(customer.getId());
            invoice.setPeriodStart(start);
            invoice.setPeriodEnd(end);
            invoice.setSubtotalPaise(subtotal);
            long adjustment = isNew ? 0L : invoice.getAdjustmentPaise();
            invoice.setAdjustmentPaise(adjustment);
            invoice.setTotalPaise(Math.max(0L, subtotal + adjustment));
            invoice.setPaidPaise(isNew ? 0L : invoice.getPaidPaise());
            invoice.setIssuedOn(LocalDate.now());
            invoice.setDueOn(dueOn);
            invoice.setStatus(statusFor(invoice));
            Invoice saved = invoices.save(invoice);

            for (InvoiceLine line : batch) {
                line.setInvoiceId(saved.getId());
            }
            lines.saveAll(batch);

            if (isNew) {
                created++;
            } else {
                updated++;
            }
            billed += saved.getTotalPaise();
            views.add(view(saved, customer, toLineViews(batch)));
        }

        if (skipped > 0) {
            messages.add(skipped + " customer(s) had no delivered items in this period.");
        }
        return new InvoiceDtos.GenerateInvoiceResponse(start, end, created, updated, skipped,
                billed, messages, views);
    }

    // ---------------------------------------------------------------- reads

    @Transactional(readOnly = true)
    public PageResponse<InvoiceDtos.InvoiceView> page(Long businessId,
                                                     String status,
                                                     Long customerId,
                                                     Pageable pageable) {
        Page<Invoice> found;
        if (customerId != null) {
            found = invoices.findByBusinessIdAndCustomerIdOrderByIssuedOnDescIdDesc(
                    businessId, customerId, pageable);
        } else if (status != null && !status.isBlank()) {
            found = invoices.findByBusinessIdAndStatusOrderByIssuedOnDescIdDesc(
                    businessId, parseStatus(status), pageable);
        } else {
            found = invoices.findByBusinessIdOrderByIssuedOnDescIdDesc(businessId, pageable);
        }
        return PageResponse.of(hydrate(businessId, found.getContent(), false),
                found.getNumber(), found.getSize(), found.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<InvoiceDtos.InvoiceView> forCustomer(Long businessId, Long customerId) {
        requireCustomer(businessId, customerId);
        return hydrate(businessId, invoices.findByCustomerIdOrderByPeriodStartDesc(customerId), false);
    }

    @Transactional(readOnly = true)
    public InvoiceDtos.InvoiceView get(Long businessId, Long id) {
        Invoice invoice = require(businessId, id);
        return hydrate(businessId, List.of(invoice), true).get(0);
    }

    // ---------------------------------------------------------------- mutations

    /** Waivers, spoilage credits and late-delivery goodwill, applied on top of the subtotal. */
    @Transactional
    public InvoiceDtos.InvoiceView adjust(Long businessId, Long id, InvoiceDtos.AdjustRequest request) {
        Invoice invoice = require(businessId, id);
        if (invoice.getStatus() == InvoiceStatus.VOID) {
            throw new ConflictException("This invoice is cancelled and can no longer be adjusted.");
        }
        long adjustment = request.adjustmentPaise();
        if (invoice.getSubtotalPaise() + adjustment < 0L) {
            throw new BadRequestException("The adjustment cannot push the invoice total below zero.");
        }
        long newTotal = invoice.getSubtotalPaise() + adjustment;
        if (newTotal < invoice.getPaidPaise()) {
            throw new ConflictException("That adjustment would make the total less than the "
                    + rupees(invoice.getPaidPaise()) + " already collected. Refund first.");
        }
        invoice.setAdjustmentPaise(adjustment);
        invoice.setTotalPaise(newTotal);
        invoice.setStatus(statusFor(invoice));
        Invoice saved = invoices.save(invoice);
        return hydrate(businessId, List.of(saved), true).get(0);
    }

    @Transactional
    public InvoiceDtos.InvoiceView cancel(Long businessId, Long id) {
        Invoice invoice = require(businessId, id);
        if (invoice.getPaidPaise() > 0L) {
            throw new ConflictException("This invoice already has "
                    + rupees(invoice.getPaidPaise()) + " against it. Refund before cancelling.");
        }
        invoice.setStatus(InvoiceStatus.VOID);
        Invoice saved = invoices.save(invoice);
        return hydrate(businessId, List.of(saved), true).get(0);
    }

    // ---------------------------------------------------------------- helpers

    public Invoice require(Long businessId, Long id) {
        return invoices.findByIdAndBusinessId(id, businessId)
                .orElseThrow(() -> NotFoundException.of("Invoice", id));
    }

    /** Recomputes UNPAID / PARTIAL / PAID from the money on the row. VOID is sticky. */
    public static InvoiceStatus statusFor(Invoice invoice) {
        if (invoice.getStatus() == InvoiceStatus.VOID) {
            return InvoiceStatus.VOID;
        }
        if (invoice.getPaidPaise() <= 0L) {
            return InvoiceStatus.UNPAID;
        }
        return invoice.getPaidPaise() >= invoice.getTotalPaise()
                ? InvoiceStatus.PAID
                : InvoiceStatus.PARTIAL;
    }

    public static List<InvoiceStatus> openStatuses() {
        return OPEN;
    }

    private static InvoiceStatus parseStatus(String raw) {
        try {
            return InvoiceStatus.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BadRequestException("status must be UNPAID, PARTIAL, PAID or VOID.");
        }
    }

    private List<Customer> resolveCustomers(Long businessId, List<Long> requested) {
        if (requested == null || requested.isEmpty()) {
            return customers.findByBusinessIdAndActiveTrue(businessId);
        }
        List<Long> ids = new ArrayList<>();
        for (Long id : requested) {
            if (id != null) {
                ids.add(id);
            }
        }
        if (ids.isEmpty()) {
            return List.of();
        }
        List<Customer> found = customers.findByBusinessIdAndIdIn(businessId, ids);
        if (found.size() != ids.size()) {
            throw new BadRequestException("One or more customer ids do not belong to this business.");
        }
        return found;
    }

    private Customer requireCustomer(Long businessId, Long customerId) {
        return customers.findByIdAndBusinessId(customerId, businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", customerId));
    }

    private List<InvoiceDtos.InvoiceView> hydrate(Long businessId,
                                                  List<Invoice> rows,
                                                  boolean withLines) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> customerIds = new ArrayList<>(rows.size());
        List<Long> invoiceIds = new ArrayList<>(rows.size());
        for (Invoice invoice : rows) {
            customerIds.add(invoice.getCustomerId());
            invoiceIds.add(invoice.getId());
        }
        Map<Long, Customer> people = new HashMap<>();
        for (Customer customer : customers.findByBusinessIdAndIdIn(businessId, customerIds)) {
            people.put(customer.getId(), customer);
        }
        Map<Long, List<InvoiceDtos.InvoiceLineView>> byInvoice = new HashMap<>();
        if (withLines) {
            for (InvoiceLine line : lines.findByInvoiceIdIn(invoiceIds)) {
                byInvoice.computeIfAbsent(line.getInvoiceId(), key -> new ArrayList<>())
                        .add(new InvoiceDtos.InvoiceLineView(line.getId(), line.getProductName(),
                                line.getQuantity(), line.getUnitPricePaise(), line.getAmountPaise()));
            }
        }
        List<InvoiceDtos.InvoiceView> views = new ArrayList<>(rows.size());
        for (Invoice invoice : rows) {
            views.add(view(invoice, people.get(invoice.getCustomerId()),
                    byInvoice.getOrDefault(invoice.getId(), List.of())));
        }
        return views;
    }

    private List<InvoiceDtos.InvoiceLineView> lineViews(Long invoiceId) {
        List<InvoiceDtos.InvoiceLineView> views = new ArrayList<>();
        for (InvoiceLine line : lines.findByInvoiceIdOrderByIdAsc(invoiceId)) {
            views.add(new InvoiceDtos.InvoiceLineView(line.getId(), line.getProductName(),
                    line.getQuantity(), line.getUnitPricePaise(), line.getAmountPaise()));
        }
        return views;
    }

    private static List<InvoiceDtos.InvoiceLineView> toLineViews(List<InvoiceLine> batch) {
        List<InvoiceDtos.InvoiceLineView> views = new ArrayList<>(batch.size());
        for (InvoiceLine line : batch) {
            views.add(new InvoiceDtos.InvoiceLineView(line.getId(), line.getProductName(),
                    line.getQuantity(), line.getUnitPricePaise(), line.getAmountPaise()));
        }
        return views;
    }

    private static InvoiceDtos.InvoiceView view(Invoice invoice,
                                                Customer customer,
                                                List<InvoiceDtos.InvoiceLineView> lineViews) {
        long outstanding = invoice.outstandingPaise();
        long daysOverdue = 0L;
        if (outstanding > 0L && invoice.getDueOn() != null
                && invoice.getDueOn().isBefore(LocalDate.now())) {
            daysOverdue = ChronoUnit.DAYS.between(invoice.getDueOn(), LocalDate.now());
        }
        return new InvoiceDtos.InvoiceView(invoice.getId(), invoice.getCustomerId(),
                customer == null ? "Customer #" + invoice.getCustomerId() : customer.getName(),
                customer == null ? null : customer.getPhone(),
                customer == null ? null : customer.getAddress(),
                invoice.getPeriodStart(), invoice.getPeriodEnd(), invoice.getSubtotalPaise(),
                invoice.getAdjustmentPaise(), invoice.getTotalPaise(), invoice.getPaidPaise(),
                outstanding,
                invoice.getStatus() == null ? InvoiceStatus.UNPAID.name() : invoice.getStatus().name(),
                invoice.getIssuedOn(), invoice.getDueOn(), daysOverdue, lineViews);
    }

    static String rupees(long paise) {
        return "Rs " + (paise / 100L) + "." + String.format("%02d", Math.abs(paise % 100L));
    }

    static long asLong(Object value) {
        if (value == null) {
            return 0L;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        return Long.parseLong(value.toString());
    }
}
