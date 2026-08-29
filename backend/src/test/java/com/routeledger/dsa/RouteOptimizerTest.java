package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class RouteOptimizerTest {

    private static final GeoPoint DEPOT = new GeoPoint(12.9716, 77.5946);

    /** Eight drops on a ring, deliberately handed over in a criss-cross order. */
    private static List<RouteOptimizer.Stop> crossingRing() {
        int[] handoverOrder = {0, 4, 1, 5, 2, 6, 3, 7};
        List<RouteOptimizer.Stop> stops = new ArrayList<>();
        for (int slot : handoverOrder) {
            double angle = Math.toRadians(slot * 45.0);
            GeoPoint at = new GeoPoint(
                    DEPOT.lat() + 0.02 * Math.sin(angle),
                    DEPOT.lng() + 0.02 * Math.cos(angle));
            stops.add(new RouteOptimizer.Stop(100L + slot, at));
        }
        return stops;
    }

    @Test
    void haversineMatchesKnownGroundTruth() {
        double oneDegreeOfLatitude = new GeoPoint(0, 0).distanceTo(new GeoPoint(1, 0));
        assertTrue(Math.abs(oneDegreeOfLatitude - 111_195) < 600,
                "one degree of latitude was " + oneDegreeOfLatitude);
        assertEquals(0.0, DEPOT.distanceTo(DEPOT));
    }
    @Test
    void twoOptBeatsGreedyAndBeatsTheVendorsCurrentOrder() {
        RouteOptimizer.Plan plan =
                RouteOptimizer.plan(DEPOT, crossingRing(), RouteOptimizer.DistanceModel.GEODESIC);

        assertEquals(8, plan.orderedStopIds().size());
        assertEquals(9, plan.legMetres().size());
        assertTrue(plan.optimisedMetres() <= plan.greedyMetres() + 1e-6,
                "2-opt must never worsen the greedy tour");
        assertTrue(plan.optimisedMetres() < plan.asEnteredMetres() * 0.75,
                "expected a big win over the criss-cross order, got "
                        + plan.optimisedMetres() + " vs " + plan.asEnteredMetres());
        assertTrue(plan.twoOptSwaps() >= 0);
        assertTrue(plan.savedPercent() > 25.0);
        assertEquals(RouteOptimizer.DistanceModel.GEODESIC, plan.model());
    }

    @Test
    void twoOptUncrossesASquareTour() {
        double diagonal = Math.sqrt(2.0);
        double[][] cost = {
                {0, 1, diagonal, 1},
                {1, 0, 1, diagonal},
                {diagonal, 1, 0, 1},
                {1, diagonal, 1, 0}
        };
        int[] crossing = {0, 2, 1, 3};
        double before = RouteOptimizer.tourLength(crossing, cost);
        assertTrue(Math.abs(before - (2 * diagonal + 2)) < 1e-9);

        int swaps = RouteOptimizer.twoOpt(crossing, cost);
        double after = RouteOptimizer.tourLength(crossing, cost);

        assertTrue(swaps > 0, "a crossed tour must be improvable");
        assertTrue(Math.abs(after - 4.0) < 1e-9, "expected the 4-unit perimeter, got " + after);
        assertEquals(0, crossing[0], "depot must stay pinned at position 0");
    }

    @Test
    void everyStopIsVisitedExactlyOnce() {
        RouteOptimizer.Plan plan =
                RouteOptimizer.plan(DEPOT, crossingRing(), RouteOptimizer.DistanceModel.ROAD_APPROX);

        Set<Long> seen = new HashSet<>(plan.orderedStopIds());
        assertEquals(8, seen.size());
        for (long id = 100L; id < 108L; id++) {
            assertTrue(seen.contains(id), "missing stop " + id);
        }
        assertEquals(RouteOptimizer.DistanceModel.ROAD_APPROX, plan.model());
        for (double leg : plan.legMetres()) {
            assertTrue(Double.isFinite(leg) && leg >= 0.0, "leg must be finite");
        }
    }

    @Test
    void roadApproxIsNeverCheaperThanStraightLine() {
        List<GeoPoint> nodes = new ArrayList<>();
        nodes.add(DEPOT);
        for (RouteOptimizer.Stop stop : crossingRing()) {
            nodes.add(stop.location());
        }
        double[][] geodesic = RouteOptimizer.geodesicMatrix(nodes);
        double[][] road = RouteOptimizer.roadApproxMatrix(nodes);

        for (int i = 0; i < nodes.size(); i++) {
            for (int j = 0; j < nodes.size(); j++) {
                assertTrue(road[i][j] >= geodesic[i][j] - 1e-6,
                        "network distance must dominate crow-flies at " + i + "," + j);
                assertTrue(Double.isFinite(road[i][j]));
            }
        }
    }

    @Test
    void emptyAndSingleStopRoutesAreSafe() {
        RouteOptimizer.Plan empty =
                RouteOptimizer.plan(DEPOT, List.of(), RouteOptimizer.DistanceModel.ROAD_APPROX);
        assertEquals(List.of(), empty.orderedStopIds());
        assertEquals(0.0, empty.optimisedMetres());
        assertFalse(empty.savedPercent() > 0.0);

        RouteOptimizer.Plan single = RouteOptimizer.plan(DEPOT,
                List.of(new RouteOptimizer.Stop(1L, new GeoPoint(12.98, 77.60))),
                RouteOptimizer.DistanceModel.ROAD_APPROX);
        assertEquals(List.of(1L), single.orderedStopIds());
        assertEquals(2, single.legMetres().size());
        assertEquals(0, single.twoOptSwaps());
    }
}
