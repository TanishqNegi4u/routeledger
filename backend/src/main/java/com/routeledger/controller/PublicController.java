package com.routeledger.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The only unauthenticated read in the API. It exposes nothing about any tenant - just enough for
 * the landing page to show that the backend is reachable and which build it is talking to.
 */
@RestController
@RequestMapping("/api/public")
@Tag(name = "Public", description = "Unauthenticated service metadata")
public class PublicController {

    private final String version;

    public PublicController(@Value("${routeledger.version:1.0.0}") String version) {
        this.version = version;
    }

    @GetMapping("/ping")
    @Operation(summary = "Liveness ping for the marketing page")
    public Map<String, Object> ping() {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("service", "routeledger-api");
        body.put("version", version);
        body.put("status", "UP");
        body.put("time", Instant.now().toString());
        return body;
    }
}
