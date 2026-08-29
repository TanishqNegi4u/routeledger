package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class GeoClustererTest {

    private static List<GeoPoint> twoNeighbourhoods() {
        List<GeoPoint> points = new ArrayList<>();
        // Jayanagar cluster (5 households within ~200 m)
        points.add(new GeoPoint(12.9000, 77.5000));
        points.add(new GeoPoint(12.9005, 77.5003));
        points.add(new GeoPoint(12.9010, 77.4998));
        points.add(new GeoPoint(12.9002, 77.5008));
        points.add(new GeoPoint(12.8996, 77.5004));
        // Yelahanka cluster (4 households, ~48 km away)
        points.add(new GeoPoint(13.1000, 77.9000));
        points.add(new GeoPoint(13.1004, 77.9006));
        points.add(new GeoPoint(13.0996, 77.9003));
        points.add(new GeoPoint(13.1008, 77.8998));
        return points;
    }

    @Test
    void spanningTreeConnectsEveryPointOnce() {
        List<GeoPoint> points = twoNeighbourhoods();
        List<Graph.Edge> mst = GeoClusterer.minimumSpanningTree(points);

        assertEquals(points.size() - 1, mst.size());
        UnionFind unionFind = new UnionFind(points.size());
        for (Graph.Edge edge : mst) {
            unionFind.union(edge.from(), edge.to());
        }
        assertEquals(1, unionFind.componentCount());
        for (int i = 1; i < mst.size(); i++) {
            assertTrue(mst.get(i - 1).weight() <= mst.get(i).weight(), "MST edges must ascend");
        }
    }

    @Test
    void splitsDistantNeighbourhoodsIntoSeparateBeats() {
        List<GeoClusterer.Cluster> clusters =
                GeoClusterer.cluster(twoNeighbourhoods(), 2, 5_000);

        assertEquals(2, clusters.size());
        assertEquals(5, clusters.get(0).size());
        assertEquals(4, clusters.get(1).size());
        assertTrue(clusters.get(0).radiusMetres() < 500, "beat should be tight");
        assertEquals(9, clusters.get(0).size() + clusters.get(1).size());
    }

    @Test
    void handlesTrivialInputs() {
        assertEquals(List.of(), GeoClusterer.minimumSpanningTree(List.of()));
        assertEquals(List.of(), GeoClusterer.cluster(List.of(), 3, 1_000));
        assertEquals(1, GeoClusterer.cluster(List.of(new GeoPoint(12.9, 77.5)), 4, 1_000).size());
    }
}
