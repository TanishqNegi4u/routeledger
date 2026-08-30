package com.routeledger.controller;

import com.routeledger.dto.PauseDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.PauseService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.time.LocalDate;
import java.util.List;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Vacation and skip windows. Creating one runs an interval-tree overlap check, so a customer can
 * never end up with two contradictory pauses covering the same morning.
 */
@RestController
@RequestMapping("/api/pauses")
@Tag(name = "Pauses", description = "Vacation and skip windows")
public class PauseController {

    private final PauseService pauses;

    public PauseController(PauseService pauses) {
        this.pauses = pauses;
    }

    @GetMapping
    @Operation(summary = "Every pause for one customer")
    public List<PauseDtos.PauseView> forCustomer(@AuthenticationPrincipal AuthPrincipal principal,
                                                @RequestParam Long customerId) {
        return pauses.forCustomer(principal.businessId(), customerId);
    }

    @GetMapping("/calendar")
    @Operation(summary = "Every pause overlapping a date window")
    public List<PauseDtos.PauseView> calendar(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return pauses.calendar(principal.businessId(), from, to);
    }

    @PostMapping
    @Operation(summary = "Pause deliveries for a date range")
    public ResponseEntity<PauseDtos.PauseView> create(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody PauseDtos.PauseRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(pauses.create(principal.businessId(), request));
    }

    @PostMapping("/quick-skip-tomorrow")
    @Operation(summary = "1-Tap Skip Tomorrow: stops delivery tomorrow and adjusts balance forward")
    public ResponseEntity<PauseDtos.PauseView> quickSkipTomorrow(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam Long customerId,
            @RequestParam(required = false) String reason) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(pauses.quickSkipTomorrow(principal.businessId(), customerId, reason));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Cancel a pause")
    public ResponseEntity<Void> delete(@AuthenticationPrincipal AuthPrincipal principal,
                                      @PathVariable Long id) {
        pauses.delete(principal.businessId(), id);
        return ResponseEntity.noContent().build();
    }
}
