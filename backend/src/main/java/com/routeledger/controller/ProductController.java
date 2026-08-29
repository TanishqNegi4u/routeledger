package com.routeledger.controller;

import com.routeledger.dto.PageResponse;
import com.routeledger.dto.ProductDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.ProductService;
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

/** The price list. Everything billed downstream is priced from here. */
@RestController
@RequestMapping("/api/products")
@Tag(name = "Products", description = "Catalogue and unit prices")
public class ProductController {

    private final ProductService products;

    public ProductController(ProductService products) {
        this.products = products;
    }

    @GetMapping
    @Operation(summary = "Paged catalogue")
    public PageResponse<ProductDtos.ProductView> page(@AuthenticationPrincipal AuthPrincipal principal,
                                                     @RequestParam(required = false) Integer page,
                                                     @RequestParam(required = false) Integer size) {
        return products.page(principal.businessId(), Pagination.of(page, size));
    }

    @GetMapping("/active")
    @Operation(summary = "Every sellable product, for pickers")
    public List<ProductDtos.ProductView> active(@AuthenticationPrincipal AuthPrincipal principal) {
        return products.active(principal.businessId());
    }

    @GetMapping("/{id}")
    @Operation(summary = "Read one product")
    public ProductDtos.ProductView get(@AuthenticationPrincipal AuthPrincipal principal,
                                      @PathVariable Long id) {
        return products.get(principal.businessId(), id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Add a product")
    public ResponseEntity<ProductDtos.ProductView> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody ProductDtos.ProductRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(products.create(principal.businessId(), request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Update a product")
    public ProductDtos.ProductView update(@AuthenticationPrincipal AuthPrincipal principal,
                                         @PathVariable Long id,
                                         @Valid @RequestBody ProductDtos.ProductRequest request) {
        return products.update(principal.businessId(), id, request);
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Stock or de-list a product")
    public ProductDtos.ProductView setActive(@AuthenticationPrincipal AuthPrincipal principal,
                                            @PathVariable Long id,
                                            @RequestParam boolean active) {
        return products.setActive(principal.businessId(), id, active);
    }
}
