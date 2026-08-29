package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * The heart of RouteLedger: turns an unordered bag of morning drops into the
 * cheapest closed tour from the depot and back.
 *
 * <p>Pipeline, all hand written:</p>
 * <ol>
 *   <li>{@link GeoPoint} haversine metric builds the cost space.</li>
 *   <li>{@link BinaryHeap} picks each node's k nearest neighbours, and
 *       {@link GeoClusterer}'s Kruskal MST ({@link UnionFind}) is unioned in so
 *       the sparse graph is guaranteed connected.</li>
 *   <li>{@link Dijkstra} turns that sparse graph into an all-pairs
 *       "along the lanes" cost matrix - far closer to reality than crow-flies.</li>
 *   <li>Nearest-neighbour construction gives a first tour, then 2-opt edge
 *       exchange removes the crossings greedy always leaves behind.</li>
 * </ol>
 */
public final class RouteOptimizer {

    public enum DistanceModel {
        GEODESIC,
        ROAD_APPROX
    }

    public record Stop(long id, GeoPoint location) {
    }

    public record Plan(List<Long> orderedStopIds,
                       List<Double> legMetres,
                       double optimisedMetres,
                       double greedyMetres,
                       double asEnteredMetres,
                       int twoOptSwaps,
                       DistanceModel model) {

        public double savedMetres() {
            return Math.max(0.0, asEnteredMetres - optimisedMetres);
        }

        public double savedPercent() {
            return asEnteredMetres <= 0.0 ? 0.0 : savedMetres() * 100.0 / asEnteredMetres;
        }
    }

    private static final int NEIGHBOURS = 6;
    private static final int MAX_PASSES = 80;
    private static final double EPSILON = 1e-7;

    private RouteOptimizer() {
    }
    public static Plan plan(GeoPoint depot, List<Stop> stops, DistanceModel model) {
        if (depot == null) {
            throw new IllegalArgumentException("depot required");
        }
        if (stops == null || stops.isEmpty()) {
            return new Plan(List.of(), List.of(), 0.0, 0.0, 0.0, 0, model);
        }
        int n = stops.size();
        List<GeoPoint> nodes = new ArrayList<>(n + 1);
        nodes.add(depot);
        for (Stop stop : stops) {
            nodes.add(stop.location());
        }
        DistanceModel effective = (model == DistanceModel.ROAD_APPROX && n >= 3)
                ? DistanceModel.ROAD_APPROX
                : DistanceModel.GEODESIC;
        double[][] cost = effective == DistanceModel.ROAD_APPROX
                ? roadApproxMatrix(nodes)
                : geodesicMatrix(nodes);

        int[] asEntered = new int[n + 1];
        for (int i = 0; i <= n; i++) {
            asEntered[i] = i;
        }
        double asEnteredMetres = tourLength(asEntered, cost);

        int[] tour = nearestNeighbour(cost);
        double greedyMetres = tourLength(tour, cost);
        int swaps = twoOpt(tour, cost);
        double optimisedMetres = tourLength(tour, cost);

        List<Long> orderedIds = new ArrayList<>(n);
        List<Double> legs = new ArrayList<>(n + 1);
        for (int pos = 1; pos <= n; pos++) {
            orderedIds.add(stops.get(tour[pos] - 1).id());
            legs.add(cost[tour[pos - 1]][tour[pos]]);
        }
        legs.add(cost[tour[n]][tour[0]]);
        return new Plan(List.copyOf(orderedIds), List.copyOf(legs),
                optimisedMetres, greedyMetres, asEnteredMetres, swaps, effective);
    }

    static double[][] geodesicMatrix(List<GeoPoint> nodes) {
        int m = nodes.size();
        double[][] cost = new double[m][m];
        for (int i = 0; i < m; i++) {
            for (int j = i + 1; j < m; j++) {
                double metres = nodes.get(i).distanceTo(nodes.get(j));
                cost[i][j] = metres;
                cost[j][i] = metres;
            }
        }
        return cost;
    }
    /** Sparse kNN graph + MST backbone, resolved to all-pairs costs by Dijkstra. */
    static double[][] roadApproxMatrix(List<GeoPoint> nodes) {
        int m = nodes.size();
        Graph graph = new Graph(m);
        boolean[][] linked = new boolean[m][m];
        int k = Math.min(NEIGHBOURS, m - 1);
        for (int i = 0; i < m; i++) {
            BinaryHeap<Graph.Edge> nearest =
                    new BinaryHeap<>(Comparator.comparingDouble(Graph.Edge::weight));
            for (int j = 0; j < m; j++) {
                if (i != j) {
                    nearest.push(new Graph.Edge(i, j, nodes.get(i).distanceTo(nodes.get(j))));
                }
            }
            for (int taken = 0; taken < k && !nearest.isEmpty(); taken++) {
                link(graph, linked, nearest.pop());
            }
        }
        for (Graph.Edge edge : GeoClusterer.minimumSpanningTree(nodes)) {
            link(graph, linked, edge);
        }
        double[][] cost = new double[m][m];
        for (int i = 0; i < m; i++) {
            Dijkstra.Result result = Dijkstra.shortestPaths(graph, i);
            for (int j = 0; j < m; j++) {
                double metres = result.distanceTo(j);
                cost[i][j] = Double.isInfinite(metres) ? nodes.get(i).distanceTo(nodes.get(j)) : metres;
            }
        }
        return cost;
    }

    private static void link(Graph graph, boolean[][] linked, Graph.Edge edge) {
        int a = edge.from();
        int b = edge.to();
        if (a == b || linked[a][b]) {
            return;
        }
        linked[a][b] = true;
        linked[b][a] = true;
        graph.addUndirectedEdge(a, b, edge.weight());
    }

    static int[] nearestNeighbour(double[][] cost) {
        int m = cost.length;
        int[] tour = new int[m];
        boolean[] visited = new boolean[m];
        visited[0] = true;
        int current = 0;
        for (int position = 1; position < m; position++) {
            int best = -1;
            double bestCost = Double.POSITIVE_INFINITY;
            for (int candidate = 1; candidate < m; candidate++) {
                if (!visited[candidate] && cost[current][candidate] < bestCost) {
                    bestCost = cost[current][candidate];
                    best = candidate;
                }
            }
            if (best < 0) {
                for (int candidate = 1; candidate < m; candidate++) {
                    if (!visited[candidate]) {
                        best = candidate;
                        break;
                    }
                }
            }
            tour[position] = best;
            visited[best] = true;
            current = best;
        }
        return tour;
    }
    /**
     * 2-opt: repeatedly reverse a segment when doing so shortens the closed tour.
     * Position 0 is pinned to the depot.
     *
     * @return number of improving exchanges applied
     */
    static int twoOpt(int[] tour, double[][] cost) {
        int length = tour.length;
        if (length < 4) {
            return 0;
        }
        int swaps = 0;
        boolean improved = true;
        int passes = 0;
        while (improved && passes < MAX_PASSES) {
            improved = false;
            passes++;
            for (int i = 1; i < length - 1; i++) {
                for (int j = i + 1; j < length; j++) {
                    int before = tour[i - 1];
                    int start = tour[i];
                    int end = tour[j];
                    int after = tour[(j + 1) % length];
                    double delta = (cost[before][end] + cost[start][after])
                            - (cost[before][start] + cost[end][after]);
                    if (delta < -EPSILON) {
                        reverse(tour, i, j);
                        swaps++;
                        improved = true;
                    }
                }
            }
        }
        return swaps;
    }

    static void reverse(int[] tour, int from, int to) {
        int left = from;
        int right = to;
        while (left < right) {
            int tmp = tour[left];
            tour[left] = tour[right];
            tour[right] = tmp;
            left++;
            right--;
        }
    }

    /** Closed-tour length: depot -> stops in order -> depot. */
    static double tourLength(int[] tour, double[][] cost) {
        double total = 0.0;
        int length = tour.length;
        for (int i = 0; i < length; i++) {
            total += cost[tour[i]][tour[(i + 1) % length]];
        }
        return total;
    }
}
