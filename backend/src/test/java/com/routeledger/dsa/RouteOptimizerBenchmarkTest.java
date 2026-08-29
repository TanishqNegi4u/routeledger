package com.routeledger.dsa;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RouteOptimizerBenchmarkTest {

    private static final GeoPoint DEPOT = new GeoPoint(18.5204, 73.8567); // Pune center

    private List<RouteOptimizer.Stop> generateRandomStops(int count, long seed) {
        Random random = new Random(seed);
        List<RouteOptimizer.Stop> stops = new ArrayList<>(count);
        for (int i = 1; i <= count; i++) {
            // Spread within ~10km radius
            double lat = DEPOT.lat() + (random.nextDouble() - 0.5) * 0.18;
            double lng = DEPOT.lng() + (random.nextDouble() - 0.5) * 0.18;
            stops.add(new RouteOptimizer.Stop(i, new GeoPoint(lat, lng)));
        }
        return stops;
    }

    @Test
    @DisplayName("RouteOptimizer benchmark at n=50 stops")
    void benchmark_50Stops_CompletesUnder100ms() {
        List<RouteOptimizer.Stop> stops = generateRandomStops(50, 42L);

        long start = System.currentTimeMillis();
        RouteOptimizer.Plan plan = RouteOptimizer.plan(DEPOT, stops, RouteOptimizer.DistanceModel.GEODESIC);
        long elapsed = System.currentTimeMillis() - start;

        assertEquals(50, plan.orderedStopIds().size());
        assertTrue(plan.optimisedMetres() <= plan.asEnteredMetres(), "Optimised tour must be shorter or equal to input");
        assertTrue(elapsed < 200, "50 stops should plan in <200ms, took " + elapsed + "ms");
    }

    @Test
    @DisplayName("RouteOptimizer benchmark at n=200 stops")
    void benchmark_200Stops_CompletesUnder500ms() {
        List<RouteOptimizer.Stop> stops = generateRandomStops(200, 42L);

        long start = System.currentTimeMillis();
        RouteOptimizer.Plan plan = RouteOptimizer.plan(DEPOT, stops, RouteOptimizer.DistanceModel.GEODESIC);
        long elapsed = System.currentTimeMillis() - start;

        assertEquals(200, plan.orderedStopIds().size());
        assertTrue(plan.optimisedMetres() <= plan.asEnteredMetres(), "Optimised tour must be shorter or equal to input");
        assertTrue(elapsed < 600, "200 stops should plan in <600ms, took " + elapsed + "ms");
    }

    @Test
    @DisplayName("RouteOptimizer benchmark at n=500 stops")
    void benchmark_500Stops_CompletesUnder2000ms() {
        List<RouteOptimizer.Stop> stops = generateRandomStops(500, 42L);

        long start = System.currentTimeMillis();
        RouteOptimizer.Plan plan = RouteOptimizer.plan(DEPOT, stops, RouteOptimizer.DistanceModel.GEODESIC);
        long elapsed = System.currentTimeMillis() - start;

        assertEquals(500, plan.orderedStopIds().size());
        assertTrue(plan.optimisedMetres() <= plan.asEnteredMetres(), "Optimised tour must be shorter or equal to input");
        assertTrue(elapsed < 2500, "500 stops should plan in <2500ms, took " + elapsed + "ms");
    }
}
