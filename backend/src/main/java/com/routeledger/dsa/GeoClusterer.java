package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Kruskal minimum-spanning-tree clustering, built from our own
 * {@link BinaryHeap} and {@link UnionFind}.
 *
 * <p>Two jobs in RouteLedger:</p>
 * <ol>
 *   <li>"Split my 240 customers into 3 balanced beats" — single-linkage
 *       clustering by cutting the k-1 longest MST edges.</li>
 *   <li>Guaranteeing the sparse road-approximation graph used by
 *       {@link RouteOptimizer} is connected, so Dijkstra never returns
 *       infinity.</li>
 * </ol>
 */
public final class GeoClusterer {

    private static final long MAX_PAIRS = 2_000_000L;

    private GeoClusterer() {
    }

    public record Cluster(List<Integer> memberIndexes, GeoPoint centroid, double radiusMetres) {
        public int size() {
            return memberIndexes.size();
        }
    }

    /** Ascending-weight MST edge list over the complete geodesic graph. */
    public static List<Graph.Edge> minimumSpanningTree(List<GeoPoint> points) {
        int n = points.size();
        if (n <= 1) {
            return List.of();
        }
        long pairs = (long) n * (n - 1) / 2;
        if (pairs > MAX_PAIRS) {
            throw new IllegalArgumentException("too many points for exact MST: " + n);
        }
        BinaryHeap<Graph.Edge> heap = new BinaryHeap<>(Comparator.comparingDouble(Graph.Edge::weight));
        for (int i = 0; i < n; i++) {
            for (int j = i + 1; j < n; j++) {
                heap.push(new Graph.Edge(i, j, points.get(i).distanceTo(points.get(j))));
            }
        }
        UnionFind unionFind = new UnionFind(n);
        List<Graph.Edge> mst = new ArrayList<>(n - 1);
        while (!heap.isEmpty() && mst.size() < n - 1) {
            Graph.Edge edge = heap.pop();
            if (unionFind.union(edge.from(), edge.to())) {
                mst.add(edge);
            }
        }
        return mst;
    }

    /**
     * Single-linkage clustering: keep merging along the shortest MST edges until
     * {@code desiredClusters} groups remain, never bridging a gap longer than
     * {@code maxLinkMetres}.
     */
    public static List<Cluster> cluster(List<GeoPoint> points, int desiredClusters, double maxLinkMetres) {
        int n = points.size();
        if (n == 0) {
            return List.of();
        }
        int target = Math.max(1, Math.min(desiredClusters, n));
        List<Graph.Edge> mst = minimumSpanningTree(points);
        UnionFind unionFind = new UnionFind(n);
        for (Graph.Edge edge : mst) {
            if (unionFind.componentCount() <= target) {
                break;
            }
            if (edge.weight() > maxLinkMetres) {
                break;
            }
            unionFind.union(edge.from(), edge.to());
        }
        Map<Integer, List<Integer>> grouped = new HashMap<>();
        for (int i = 0; i < n; i++) {
            grouped.computeIfAbsent(unionFind.find(i), key -> new ArrayList<>()).add(i);
        }
        List<Cluster> clusters = new ArrayList<>(grouped.size());
        for (List<Integer> members : grouped.values()) {
            clusters.add(describe(points, members));
        }
        clusters.sort(Comparator.comparingInt(Cluster::size).reversed());
        return clusters;
    }

    private static Cluster describe(List<GeoPoint> points, List<Integer> members) {
        double lat = 0;
        double lng = 0;
        for (int index : members) {
            lat += points.get(index).lat();
            lng += points.get(index).lng();
        }
        GeoPoint centroid = new GeoPoint(lat / members.size(), lng / members.size());
        double radius = 0;
        for (int index : members) {
            radius = Math.max(radius, centroid.distanceTo(points.get(index)));
        }
        return new Cluster(List.copyOf(members), centroid, radius);
    }
}
