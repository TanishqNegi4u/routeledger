package com.routeledger.controller;

import com.routeledger.dto.PageResponse;
import com.routeledger.dto.RunDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.RunService;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * The morning round. Generation is where the hand-written optimiser earns its keep: due lines are
 * resolved against the pause interval tree, then the stops are sequenced with kNN + MST + Dijkstra
 * + nearest-neighbour + 2-opt and the saving against the as-entered order is stored on the run.
 */
@RestController
@RequestMapping("/api/runs")
@Tag(name = "Runs", description = "Daily delivery rounds and doorstep updates")
public class RunController {

    private final RunService runs;

    public RunController(RunService runs) {
        this.runs = runs;
    }

    @PostMapping("/generate")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Build and sequence runs for one or more days")
    public ResponseEntity<RunDtos.GenerateRunResponse> generate(
            @AuthenticationPrincipal AuthPrincipal principal,
            @Valid @RequestBody RunDtos.GenerateRunRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(runs.generate(principal.businessId(), request));
    }

    @GetMapping
    @Operation(summary = "Paged run history, newest first")
    public PageResponse<RunDtos.RunView> page(@AuthenticationPrincipal AuthPrincipal principal,
                                            @RequestParam(required = false) Integer page,
                                            @RequestParam(required = false) Integer size) {
        return runs.page(principal.businessId(), Pagination.of(page, size));
    }

    @GetMapping("/by-date")
    @Operation(summary = "Every run on one date")
    public List<RunDtos.RunView> byDate(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return runs.forDate(principal.businessId(), date == null ? LocalDate.now() : date);
    }

    @GetMapping("/mine")
    @Operation(summary = "The signed-in agent's runs for a date")
    public List<RunDtos.RunView> mine(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return runs.forAgent(principal.businessId(), principal.userId(),
                date == null ? LocalDate.now() : date);
    }

    @GetMapping("/{id}")
    @Operation(summary = "One run with its ordered stops and line items")
    public RunDtos.RunDetailView detail(@AuthenticationPrincipal AuthPrincipal principal,
                                       @PathVariable Long id) {
        return runs.detail(principal.businessId(), id);
    }

    @PatchMapping("/stops/{stopId}")
    @Operation(summary = "Mark a stop delivered, skipped or absent, with optional quantity overrides")
    public RunDtos.StopView updateStop(@AuthenticationPrincipal AuthPrincipal principal,
                                      @PathVariable Long stopId,
                                      @Valid @RequestBody RunDtos.StopUpdateRequest request) {
        return runs.updateStop(principal.businessId(), stopId, request);
    }
}
