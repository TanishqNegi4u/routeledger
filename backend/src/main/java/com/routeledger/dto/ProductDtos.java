package com.routeledger.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Catalogue payloads. Prices are always integer paise. */
public final class ProductDtos {

    private ProductDtos() {
    }

    public record ProductRequest(
            @NotBlank @Size(max = 140) String name,
            @NotBlank @Size(max = 32) String unitLabel,
            @Size(max = 60) String category,
            @NotNull @Min(0) @Max(10_000_000L) Long pricePaise,
            Boolean active) {
    }

    public record ProductView(Long id,
                              String name,
                              String unitLabel,
                              String category,
                              long pricePaise,
                              boolean active,
                              int activeSubscriptions) {
    }
}
