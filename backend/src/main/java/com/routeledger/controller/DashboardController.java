package com.routeledger.controller;

import com.routeledger.dto.DashboardDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.DashboardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** One aggregated read for the whole owner dashboard: counters, two chart series and today's runs. */
@RestController
@RequestMapping("/api/dashboard")
@Tag(name = "Dashboard", description = "Everything the home screen needs in one round trip")
public class DashboardController {

    private final DashboardService dashboard;

    public DashboardController(DashboardService dashboard) {
        this.dashboard = dashboard;
    }

    @GetMapping
    @Operation(summary = "Counters, revenue and collection series, today's runs and the top dues")
    public DashboardDtos.DashboardView overview(
            @AuthenticationPrincipal AuthPrincipal principal,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return dashboard.overview(principal.businessId(), from, to);
    }
}
