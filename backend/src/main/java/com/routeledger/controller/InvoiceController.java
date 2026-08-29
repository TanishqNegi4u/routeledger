package com.routeledger.controller;

import com.routeledger.dto.InvoiceDtos;
import com.routeledger.dto.PageResponse;
import com.routeledger.dto.PaymentDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.InvoiceService;
import com.routeledger.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Month-end bills. Nothing here is guessed from the subscription: an invoice is assembled from the
 * stop items that were actually marked DELIVERED, which is why the bill and the round sheet always
 * agree at the doorstep.
 */
@RestController
@RequestMapping("/api/invoices")
@Tag(name = "Invoices", description = "Billing built from what was actually delivered")
public class InvoiceController {

    private final InvoiceService invoices;
    private final PaymentService payments;

    public InvoiceController(InvoiceService invoices, PaymentService payments) {
        this.invoices = invoices;
        this.payments = payments;
    }

    @PostMapping("/generate")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Bill a period for some or all customers")
    public ResponseEntity<InvoiceDtos.GenerateInvoiceResponse> generate(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody InvoiceDtos.GenerateInvoiceRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(invoices.generate(principal.businessId(), request));
    }

    @GetMapping
    @Operation(summary = "Paged invoices, filtered by status or customer")
    public PageResponse<InvoiceDtos.InvoiceView> page(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false) String status,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return invoices.page(principal.businessId(), status, customerId, Pagination.of(page, size));
    }

    @GetMapping("/by-customer/{customerId}")
    @Operation(summary = "Every invoice for one customer")
    public List<InvoiceDtos.InvoiceView> forCustomer(@AuthenticationPrincipal AuthPrincipal principal,
                                                    @PathVariable Long customerId) {
        return invoices.forCustomer(principal.businessId(), customerId);
    }

    @GetMapping("/{id}")
    @Operation(summary = "One invoice with its line items")
    public InvoiceDtos.InvoiceView get(@AuthenticationPrincipal AuthPrincipal principal,
                                     @PathVariable Long id) {
        return invoices.get(principal.businessId(), id);
    }

    @GetMapping("/{id}/payments")
    @Operation(summary = "Money received against one invoice")
    public List<PaymentDtos.PaymentView> paymentsFor(@AuthenticationPrincipal AuthPrincipal principal,
                                                    @PathVariable Long id) {
        return payments.forInvoice(principal.businessId(), id);
    }

    @PatchMapping("/{id}/adjust")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Apply a waiver, spoilage credit or goodwill adjustment")
    public InvoiceDtos.InvoiceView adjust(@AuthenticationPrincipal AuthPrincipal principal,
                                        @PathVariable Long id,
                                        @Valid @RequestBody InvoiceDtos.AdjustRequest request) {
        return invoices.adjust(principal.businessId(), id, request);
    }

    @PatchMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Void an invoice that has no money against it")
    public InvoiceDtos.InvoiceView cancel(@AuthenticationPrincipal AuthPrincipal principal,
                                        @PathVariable Long id) {
        return invoices.cancel(principal.businessId(), id);
    }
}
