package com.routeledger.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Route (beat) payloads. The depot is the point every optimised tour starts and ends at. */
public final class RouteDtos {

    private RouteDtos() {
    }

    public record RouteRequest(
            @NotBlank @Size(max = 120) String name,
            Long agentId,
            @Size(max = 160) String depotLabel,
            @NotNull @DecimalMin(value = "-90.0") @DecimalMax(value = "90.0") Double depotLat,
            @NotNull @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0") Double depotLng,
            Boolean active) {
    }

    public record RouteView(Long id,
                            String name,
                            Long agentId,
                            String agentName,
                            String depotLabel,
                            double depotLat,
                            double depotLng,
                            boolean active,
                            long customerCount) {
    }
}
