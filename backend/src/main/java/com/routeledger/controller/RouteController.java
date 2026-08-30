package com.routeledger.controller;

import com.routeledger.dto.AuthDtos;
import com.routeledger.dto.RouteDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.RouteService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Beats/rounds. Agents may read the routes they work; only owners and managers may change them. */
@RestController
@RequestMapping("/api/routes")
@Tag(name = "Routes", description = "Delivery beats and their depot")
public class RouteController {

    private final RouteService routes;

    public RouteController(RouteService routes) {
        this.routes = routes;
    }

    @GetMapping
    @Operation(summary = "List routes")
    public List<RouteDtos.RouteView> list(@AuthenticationPrincipal AuthPrincipal principal,
                                         @RequestParam(defaultValue = "false") boolean activeOnly) {
        return routes.list(principal.businessId(), activeOnly);
    }

    @GetMapping("/staff")
    @Operation(summary = "List everyone on the payroll, for assigning a beat to an agent")
    public List<AuthDtos.UserView> staff(@AuthenticationPrincipal AuthPrincipal principal) {
        return routes.staff(principal.businessId());
    }

    @PostMapping("/staff")
    @PreAuthorize("hasRole('OWNER')")
    @Operation(summary = "Create an agent or manager user account for the business")
    public ResponseEntity<AuthDtos.UserView> createStaff(@AuthenticationPrincipal AuthPrincipal principal,
                                                         @Valid @RequestBody AuthDtos.CreateStaffRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(routes.createStaff(principal.businessId(), request));
    }

    @DeleteMapping("/staff/{id}")
    @PreAuthorize("hasRole('OWNER')")
    @Operation(summary = "Delete an agent or manager user account from the business")
    public ResponseEntity<Void> deleteStaff(@AuthenticationPrincipal AuthPrincipal principal,
                                            @PathVariable Long id) {
        routes.deleteStaff(principal.businessId(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Read one route")
    public RouteDtos.RouteView get(@AuthenticationPrincipal AuthPrincipal principal,
                                  @PathVariable Long id) {
        return routes.get(principal.businessId(), id);
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Create a route")
    public ResponseEntity<RouteDtos.RouteView> create(@AuthenticationPrincipal AuthPrincipal principal,
                                                     @Valid @RequestBody RouteDtos.RouteRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(routes.create(principal.businessId(), request));
    }

    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Update a route")
    public RouteDtos.RouteView update(@AuthenticationPrincipal AuthPrincipal principal,
                                     @PathVariable Long id,
                                     @Valid @RequestBody RouteDtos.RouteRequest request) {
        return routes.update(principal.businessId(), id, request);
    }

    @PatchMapping("/{id}/active")
    @PreAuthorize("hasAnyRole('OWNER','MANAGER')")
    @Operation(summary = "Activate or retire a route")
    public RouteDtos.RouteView setActive(@AuthenticationPrincipal AuthPrincipal principal,
                                        @PathVariable Long id,
                                        @RequestParam boolean active) {
        return routes.setActive(principal.businessId(), id, active);
    }
}
