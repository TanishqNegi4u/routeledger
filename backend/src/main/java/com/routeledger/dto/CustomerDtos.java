package com.routeledger.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.time.LocalDate;

/** Customer book payloads. */
public final class CustomerDtos {

    private CustomerDtos() {
    }

    public record CustomerRequest(
            Long routeId,
            @NotBlank @Size(max = 140) String name,
            @NotBlank @Pattern(regexp = "^[0-9+][0-9 \\-]{7,19}$",
                    message = "phone must be 8-20 characters of digits, spaces or dashes") String phone,
            @Size(max = 400) String address,
            @Size(max = 160) String landmark,
            @DecimalMin(value = "-90.0") @DecimalMax(value = "90.0") Double lat,
            @DecimalMin(value = "-180.0") @DecimalMax(value = "180.0") Double lng,
            @Size(max = 400) String notes,
            Boolean active,
            LocalDate joinedOn) {
    }

    public record CustomerView(Long id,
                               Long routeId,
                               String routeName,
                               String name,
                               String phone,
                               String address,
                               String landmark,
                               Double lat,
                               Double lng,
                               String notes,
                               boolean active,
                               LocalDate joinedOn,
                               int activeSubscriptions,
                               long monthlyValuePaise,
                               long outstandingPaise) {
    }

    /** Lightweight row returned by the trie-backed instant search. */
    public record CustomerHit(Long id, String name, String phone, String address, String routeName) {
    }

    /** One geo cluster produced by the Kruskal/union-find beat planner. */
    public record BeatCluster(int index,
                              int size,
                              double centroidLat,
                              double centroidLng,
                              double radiusMetres,
                              java.util.List<CustomerHit> customers) {
    }

    public record BeatPlanResponse(Long routeId,
                                   String routeName,
                                   int requestedClusters,
                                   double maxLinkMetres,
                                   int unplaced,
                                   java.util.List<BeatCluster> clusters) {
    }
}
