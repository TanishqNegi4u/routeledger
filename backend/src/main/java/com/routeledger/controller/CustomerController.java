package com.routeledger.controller;

import com.routeledger.dto.CustomerDtos;
import com.routeledger.dto.PageResponse;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.CustomerService;
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

/**
 * The customer book. {@code /search} answers from the from-scratch trie index, and {@code /beats}
 * exposes the MST single-linkage clusterer so an owner can split a bloated round into walkable
 * groups without drawing boxes on a map.
 */
@RestController
@RequestMapping("/api/customers")
@Tag(name = "Customers", description = "Households and shops on the round")
public class CustomerController {

    private final CustomerService customers;

    public CustomerController(CustomerService customers) {
        this.customers = customers;
    }

    @GetMapping
    @Operation(summary = "Paged customer book, optionally filtered to one route")
    public PageResponse<CustomerDtos.CustomerView> page(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false) Long routeId,
            @RequestParam(defaultValue = "false") boolean activeOnly,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer size) {
        return customers.page(principal.businessId(), routeId, activeOnly, Pagination.of(page, size));
    }

    @GetMapping("/search")
    @Operation(summary = "Prefix search over name, phone and address (trie-backed)")
    public List<CustomerDtos.CustomerHit> search(@AuthenticationPrincipal AuthPrincipal principal,
                                               @RequestParam String q,
                                               @RequestParam(defaultValue = "10") int limit) {
        return customers.search(principal.businessId(), q, limit);
    }

    @GetMapping("/beats")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Split a route into walkable clusters (Kruskal MST, single linkage)")
    public CustomerDtos.BeatPlanResponse beats(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false) Long routeId,
            @RequestParam(defaultValue = "3") int clusters,
            @RequestParam(defaultValue = "1200") double maxLinkMetres) {
        return customers.planBeats(principal.businessId(), routeId, clusters, maxLinkMetres);
    }

    @GetMapping("/{id}")
    @Operation(summary = "Read one customer with dues and standing-order value")
    public CustomerDtos.CustomerView get(@AuthenticationPrincipal AuthPrincipal principal,
                                        @PathVariable Long id) {
        return customers.get(principal.businessId(), id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Add a customer")
    public ResponseEntity<CustomerDtos.CustomerView> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody CustomerDtos.CustomerRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(customers.create(principal.businessId(), request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Update a customer")
    public CustomerDtos.CustomerView update(@AuthenticationPrincipal AuthPrincipal principal,
                                           @PathVariable Long id,
                                           @Valid @RequestBody CustomerDtos.CustomerRequest request) {
        return customers.update(principal.businessId(), id, request);
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Resume or stop a customer's deliveries")
    public CustomerDtos.CustomerView setActive(@AuthenticationPrincipal AuthPrincipal principal,
                                              @PathVariable Long id,
                                              @RequestParam boolean active) {
        return customers.setActive(principal.businessId(), id, active);
    }
}
