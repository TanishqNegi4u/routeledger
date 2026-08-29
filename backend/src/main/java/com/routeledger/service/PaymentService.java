package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.domain.Invoice;
import com.routeledger.domain.InvoiceStatus;
import com.routeledger.domain.Payment;
import com.routeledger.domain.PaymentMode;
import com.routeledger.dto.PageResponse;
import com.routeledger.dto.PaymentDtos;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.repository.CustomerRepository;
import com.routeledger.repository.InvoiceRepository;
import com.routeledger.repository.PaymentRepository;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Cash and UPI coming back in. A payment can be aimed at one invoice, or - the common case at the
 * doorstep - handed over as a lump sum, in which case it is allocated oldest-due-first across the
 * customer's open invoices so the ledger never drifts from the money.
 */
@Service
public class PaymentService {

    private final PaymentRepository payments;
    private final InvoiceRepository invoices;
    private final CustomerRepository customers;

    public PaymentService(PaymentRepository payments,
                         InvoiceRepository invoices,
                         CustomerRepository customers) {
        this.payments = payments;
        this.invoices = invoices;
        this.customers = customers;
    }

    @Transactional
    public PaymentDtos.PaymentReceipt record(Long businessId, PaymentDtos.PaymentRequest request) {
        Customer customer = customers.findByIdAndBusinessId(request.customerId(), businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", request.customerId()));
        long amount = request.amountPaise() == null ? 0L : request.amountPaise();
        if (amount <= 0L) {
            throw new BadRequestException("The payment amount must be more than zero.");
        }
        LocalDate paidOn = request.paidOn() == null ? LocalDate.now() : request.paidOn();
        if (paidOn.isAfter(LocalDate.now())) {
            throw new BadRequestException("A payment cannot be dated in the future.");
        }

        List<Long> settled = new ArrayList<>();
        Long attachedInvoiceId = null;

        if (request.invoiceId() != null) {
            Invoice invoice = invoices.findByIdAndBusinessId(request.invoiceId(), businessId)
                    .orElseThrow(() -> NotFoundException.of("Invoice", request.invoiceId()));
            if (!invoice.getCustomerId().equals(customer.getId())) {
                throw new BadRequestException("That invoice belongs to a different customer.");
            }
            if (invoice.getStatus() == InvoiceStatus.VOID) {
                throw new ConflictException("That invoice is cancelled.");
            }
            long owed = invoice.outstandingPaise();
            if (owed <= 0L) {
                throw new ConflictException("That invoice is already fully paid.");
            }
            if (amount > owed) {
                throw new BadRequestException("That invoice only has "
                        + InvoiceService.rupees(owed)
                        + " outstanding. Leave the invoice blank to spread a larger payment.");
            }
            invoice.setPaidPaise(invoice.getPaidPaise() + amount);
            invoice.setStatus(InvoiceService.statusFor(invoice));
            invoices.save(invoice);
            attachedInvoiceId = invoice.getId();
            if (invoice.getStatus() == InvoiceStatus.PAID) {
                settled.add(invoice.getId());
            }
        } else {
            long remaining = amount;
            List<Invoice> open = openInvoicesOldestFirst(customer.getId());
            for (Invoice invoice : open) {
                if (remaining <= 0L) {
                    break;
                }
                long owed = invoice.outstandingPaise();
                if (owed <= 0L) {
                    continue;
                }
                long applied = Math.min(owed, remaining);
                invoice.setPaidPaise(invoice.getPaidPaise() + applied);
                invoice.setStatus(InvoiceService.statusFor(invoice));
                invoices.save(invoice);
                remaining -= applied;
                if (invoice.getStatus() == InvoiceStatus.PAID) {
                    settled.add(invoice.getId());
                }
                if (attachedInvoiceId == null) {
                    attachedInvoiceId = invoice.getId();
                }
            }
            // A surplus is kept as an advance against the customer, not silently dropped.
        }

        // Check for possible duplicate: same customer, same amount, within 5 minutes
        boolean possibleDuplicate = payments.existsRecentDuplicate(
                businessId, customer.getId(), amount, Instant.now().minusSeconds(300));

        Payment payment = new Payment();
        payment.setBusinessId(businessId);
        payment.setCustomerId(customer.getId());
        payment.setInvoiceId(request.invoiceId() != null ? request.invoiceId() : attachedInvoiceId);
        payment.setAmountPaise(amount);
        payment.setMode(request.mode() == null ? PaymentMode.CASH : request.mode());
        payment.setPaidOn(paidOn);
        payment.setReference(trim(request.reference()));
        Payment saved = payments.save(payment);

        long remainingOutstanding = 0L;
        for (Invoice invoice : openInvoicesOldestFirst(customer.getId())) {
            remainingOutstanding += invoice.outstandingPaise();
        }
        return new PaymentDtos.PaymentReceipt(view(saved, customer.getName()),
                remainingOutstanding, settled, possibleDuplicate);
    }

    @Transactional(readOnly = true)
    public PageResponse<PaymentDtos.PaymentView> page(Long businessId, Long customerId, Pageable pageable) {
        Page<Payment> found = customerId == null
                ? payments.findByBusinessIdOrderByPaidOnDescIdDesc(businessId, pageable)
                : payments.findByBusinessIdAndCustomerIdOrderByPaidOnDescIdDesc(
                        businessId, customerId, pageable);
        return PageResponse.of(hydrate(businessId, found.getContent()),
                found.getNumber(), found.getSize(), found.getTotalElements());
    }

    @Transactional(readOnly = true)
    public List<PaymentDtos.PaymentView> forCustomer(Long businessId, Long customerId) {
        customers.findByIdAndBusinessId(customerId, businessId)
                .orElseThrow(() -> NotFoundException.of("Customer", customerId));
        return hydrate(businessId, payments.findByCustomerIdOrderByPaidOnDescIdDesc(customerId));
    }

    @Transactional(readOnly = true)
    public List<PaymentDtos.PaymentView> forInvoice(Long businessId, Long invoiceId) {
        invoices.findByIdAndBusinessId(invoiceId, businessId)
                .orElseThrow(() -> NotFoundException.of("Invoice", invoiceId));
        return hydrate(businessId, payments.findByInvoiceIdOrderByPaidOnAsc(invoiceId));
    }

    private List<Invoice> openInvoicesOldestFirst(Long customerId) {
        List<Invoice> open = new ArrayList<>();
        for (Invoice invoice : invoices.findByCustomerIdOrderByPeriodStartDesc(customerId)) {
            if (invoice.getStatus() != InvoiceStatus.VOID && invoice.outstandingPaise() > 0L) {
                open.add(invoice);
            }
        }
        open.sort((left, right) -> {
            int byDue = compareDates(left.getDueOn(), right.getDueOn());
            return byDue != 0 ? byDue : Long.compare(id(left), id(right));
        });
        return open;
    }

    private static int compareDates(LocalDate left, LocalDate right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        return left.compareTo(right);
    }

    private static long id(Invoice invoice) {
        return invoice.getId() == null ? Long.MAX_VALUE : invoice.getId();
    }

    private List<PaymentDtos.PaymentView> hydrate(Long businessId, List<Payment> rows) {
        if (rows.isEmpty()) {
            return List.of();
        }
        List<Long> customerIds = new ArrayList<>(rows.size());
        for (Payment payment : rows) {
            customerIds.add(payment.getCustomerId());
        }
        Map<Long, String> names = new HashMap<>();
        for (Customer customer : customers.findByBusinessIdAndIdIn(businessId, customerIds)) {
            names.put(customer.getId(), customer.getName());
        }
        List<PaymentDtos.PaymentView> views = new ArrayList<>(rows.size());
        for (Payment payment : rows) {
            views.add(view(payment, names.get(payment.getCustomerId())));
        }
        return views;
    }

    private static PaymentDtos.PaymentView view(Payment payment, String customerName) {
        return new PaymentDtos.PaymentView(payment.getId(), payment.getCustomerId(),
                customerName == null ? "Customer #" + payment.getCustomerId() : customerName,
                payment.getInvoiceId(), payment.getAmountPaise(),
                payment.getMode() == null ? PaymentMode.CASH.name() : payment.getMode().name(),
                payment.getPaidOn(), payment.getReference());
    }

    private static String trim(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
