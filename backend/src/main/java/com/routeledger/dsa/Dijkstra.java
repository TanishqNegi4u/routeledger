package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/**
 * Dijkstra's single-source shortest path, implemented on top of our own
 * {@link BinaryHeap} with lazy deletion. O((V + E) log V).
 *
 * <p>RouteLedger uses it when a business supplies a real street graph for a
 * locality (one-ways, blocked lanes); otherwise the optimiser falls back to
 * geodesic distances.</p>
 */
public final class Dijkstra {

    private Dijkstra() {
    }

    private record Entry(int vertex, double distance) {
    }

    public record Result(int source, double[] distances, int[] previous) {

        public double distanceTo(int target) {
            return distances[target];
        }

        public boolean reachable(int target) {
            return distances[target] < Double.POSITIVE_INFINITY;
        }

        /** Reconstructed vertex path from source to target, empty when unreachable. */
        public List<Integer> pathTo(int target) {
            if (!reachable(target)) {
                return List.of();
            }
            List<Integer> path = new ArrayList<>();
            for (int at = target; at != -1; at = previous[at]) {
                path.add(at);
                if (at == source) {
                    break;
                }
            }
            Collections.reverse(path);
            return path;
        }
    }
    public static Result shortestPaths(Graph graph, int source) {
        int n = graph.vertexCount();
        if (source < 0 || source >= n) {
            throw new IndexOutOfBoundsException("source outside graph");
        }
        double[] dist = new double[n];
        int[] prev = new int[n];
        boolean[] settled = new boolean[n];
        Arrays.fill(dist, Double.POSITIVE_INFINITY);
        Arrays.fill(prev, -1);
        dist[source] = 0.0;

        BinaryHeap<Entry> frontier = new BinaryHeap<>(Comparator.comparingDouble(Entry::distance));
        frontier.push(new Entry(source, 0.0));

        while (!frontier.isEmpty()) {
            Entry current = frontier.pop();
            int u = current.vertex();
            if (settled[u]) {
                continue;
            }
            settled[u] = true;
            for (Graph.Edge edge : graph.neighbours(u)) {
                int v = edge.to();
                double candidate = dist[u] + edge.weight();
                if (candidate < dist[v]) {
                    dist[v] = candidate;
                    prev[v] = u;
                    frontier.push(new Entry(v, candidate));
                }
            }
        }
        return new Result(source, dist, prev);
    }
}
