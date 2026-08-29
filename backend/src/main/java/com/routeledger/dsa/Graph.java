package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Weighted adjacency-list graph built from scratch. Vertices are dense integer
 * indices 0..n-1 so the shortest-path arrays stay cache friendly.
 */
public class Graph {

    public record Edge(int from, int to, double weight) {
    }

    private final List<List<Edge>> adjacency;
    private int edgeCount;

    public Graph(int vertexCount) {
        if (vertexCount < 0) {
            throw new IllegalArgumentException("vertexCount must be >= 0");
        }
        this.adjacency = new ArrayList<>(vertexCount);
        for (int i = 0; i < vertexCount; i++) {
            this.adjacency.add(new ArrayList<>());
        }
    }

    public int vertexCount() {
        return adjacency.size();
    }

    public int edgeCount() {
        return edgeCount;
    }

    public void addDirectedEdge(int from, int to, double weight) {
        validate(from);
        validate(to);
        if (weight < 0) {
            throw new IllegalArgumentException("Dijkstra requires non-negative weights");
        }
        adjacency.get(from).add(new Edge(from, to, weight));
        edgeCount++;
    }

    public void addUndirectedEdge(int a, int b, double weight) {
        addDirectedEdge(a, b, weight);
        addDirectedEdge(b, a, weight);
    }

    public List<Edge> neighbours(int vertex) {
        validate(vertex);
        return Collections.unmodifiableList(adjacency.get(vertex));
    }

    private void validate(int vertex) {
        if (vertex < 0 || vertex >= adjacency.size()) {
            throw new IndexOutOfBoundsException("vertex " + vertex + " outside 0.." + (adjacency.size() - 1));
        }
    }
}
