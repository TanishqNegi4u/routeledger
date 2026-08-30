package com.routeledger.controller;

import com.routeledger.dto.MarketplaceDtos;
import com.routeledger.service.MarketplaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Consumer & Multi-Vendor Marketplace endpoints for end-user customers.
 * Open to consumer clients for searching vendors, subscribing to meals with advance UPI,
 * checking approval status, and 1-tap tomorrow skipping.
 */
@RestController
@RequestMapping("/api/marketplace")
@Tag(name = "Marketplace", description = "Consumer multi-vendor discovery and subscription")
public class MarketplaceController {

    private final MarketplaceService marketplace;

    public MarketplaceController(MarketplaceService marketplace) {
        this.marketplace = marketplace;
    }

    @GetMapping("/vendors")
    @Operation(summary = "Discover all active kitchens, dairies, and vendors with meal plans")
    public List<MarketplaceDtos.VendorView> listVendors() {
        return marketplace.listVendors();
    }

    @PostMapping("/subscribe")
    @Operation(summary = "Customer subscribes to a vendor's meal plan with advance payment")
    public ResponseEntity<MarketplaceDtos.CustomerSubscriptionView> subscribe(
            @Valid @RequestBody MarketplaceDtos.CustomerSubscriptionRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(marketplace.subscribe(request));
    }

    @GetMapping("/my-subscriptions")
    @Operation(summary = "Customer dashboard: view all subscriptions and pauses by mobile phone")
    public MarketplaceDtos.CustomerDashboardResponse getDashboard(@RequestParam String phone) {
        return marketplace.getDashboard(phone);
    }

    @PostMapping("/quick-skip-tomorrow")
    @Operation(summary = "1-Tap Skip Tomorrow: stops delivery tomorrow and adjusts balance forward")
    public ResponseEntity<Void> quickSkipTomorrow(
            @RequestParam String phone,
            @RequestParam Long subscriptionId) {
        marketplace.quickSkipTomorrow(phone, subscriptionId);
        return ResponseEntity.ok().build();
    }
}
