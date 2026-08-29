package com.routeledger.controller;

import com.routeledger.dto.SubscriptionDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.SubscriptionService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Standing orders: "2 litres of toned milk, daily, from the 1st". */
@RestController
@RequestMapping("/api/subscriptions")
@Tag(name = "Subscriptions", description = "Recurring standing orders per customer")
public class SubscriptionController {

    private final SubscriptionService subscriptions;

    public SubscriptionController(SubscriptionService subscriptions) {
        this.subscriptions = subscriptions;
    }

    @GetMapping
    @Operation(summary = "Every standing order for one customer")
    public List<SubscriptionDtos.SubscriptionView> forCustomer(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam Long customerId) {
        return subscriptions.forCustomer(principal.businessId(), customerId);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Read one standing order")
    public SubscriptionDtos.SubscriptionView get(@AuthenticationPrincipal AuthPrincipal principal,
                                                @PathVariable Long id) {
        return subscriptions.get(principal.businessId(), id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Create a standing order")
    public ResponseEntity<SubscriptionDtos.SubscriptionView> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody SubscriptionDtos.SubscriptionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(subscriptions.create(principal.businessId(), request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Update a standing order")
    public SubscriptionDtos.SubscriptionView update(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable Long id,
            @Valid @RequestBody SubscriptionDtos.SubscriptionRequest request) {
        return subscriptions.update(principal.businessId(), id, request);
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Stop or restart a standing order")
    public SubscriptionDtos.SubscriptionView setActive(
            @AuthenticationPrincipal AuthPrincipal principal,
            @PathVariable Long id,
            @RequestParam boolean active) {
        return subscriptions.setActive(principal.businessId(), id, active);
    }
}
