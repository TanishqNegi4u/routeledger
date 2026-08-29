package com.routeledger.dsa;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DijkstraTest {

    @Test
    void findsShortestPathThroughCheaperDetour() {
        Graph graph = new Graph(5);
        graph.addDirectedEdge(0, 1, 4);
        graph.addDirectedEdge(0, 2, 1);
        graph.addDirectedEdge(2, 1, 2);
        graph.addDirectedEdge(1, 3, 5);
        graph.addDirectedEdge(2, 3, 8);

        Dijkstra.Result result = Dijkstra.shortestPaths(graph, 0);

        assertEquals(0.0, result.distanceTo(0));
        assertEquals(1.0, result.distanceTo(2));
        assertEquals(3.0, result.distanceTo(1));
        assertEquals(8.0, result.distanceTo(3));
        assertEquals(List.of(0, 2, 1, 3), result.pathTo(3));
    }

    @Test
    void unreachableVerticesReportInfinity() {
        Graph graph = new Graph(3);
        graph.addUndirectedEdge(0, 1, 2.5);

        Dijkstra.Result result = Dijkstra.shortestPaths(graph, 0);

        assertTrue(result.reachable(1));
        assertFalse(result.reachable(2));
        assertEquals(Double.POSITIVE_INFINITY, result.distanceTo(2));
        assertEquals(List.of(), result.pathTo(2));
        assertEquals(2.5, result.distanceTo(1));
    }
}
