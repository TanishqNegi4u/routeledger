package com.routeledger.controller;

import com.routeledger.dto.PageResponse;
import com.routeledger.dto.PaymentDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.PaymentService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Cash and UPI coming back in. Agents post here from the doorstep, so this is deliberately open to
 * every authenticated role - a payment can only ever be attached to a customer inside the caller's
 * own tenant, and a lump sum is allocated oldest-due-first rather than guessed at.
 */
@RestController
@RequestMapping("/api/payments")
@Tag(name = "Payments", description = "Cash and UPI collection")
public class PaymentController {

    private final PaymentService payments;

    public PaymentController(PaymentService payments) {
        this.payments = payments;
    }

    @PostMapping
    @Operation(summary = "Record a collection and get the customer's remaining balance back")
    public ResponseEntity<PaymentDtos.PaymentReceipt> record(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody PaymentDtos.PaymentRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(payments.record(principal.businessId(), request));
    }

    @GetMapping
    @Operation(summary = "Paged payment history, newest first")
    public PageResponse<PaymentDtos.PaymentView> page(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false) Long customerId,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return payments.page(principal.businessId(), customerId, Pagination.of(page, size));
    }

    @GetMapping("/by-customer/{customerId}")
    @Operation(summary = "Every payment made by one customer")
    public List<PaymentDtos.PaymentView> forCustomer(@AuthenticationPrincipal AuthPrincipal principal,
                                                    @PathVariable Long customerId) {
        return payments.forCustomer(principal.businessId(), customerId);
    }
}
