package com.routeledger.dsa;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class UnionFindTest {

    @Test
    void mergesAndTracksComponents() {
        UnionFind unionFind = new UnionFind(8);
        assertEquals(8, unionFind.componentCount());

        assertTrue(unionFind.union(0, 1));
        assertTrue(unionFind.union(1, 2));
        assertFalse(unionFind.union(0, 2));

        assertEquals(6, unionFind.componentCount());
        assertTrue(unionFind.connected(0, 2));
        assertFalse(unionFind.connected(0, 3));
        assertEquals(3, unionFind.componentSize(2));
    }

    @Test
    void deepChainStaysFlatAfterCompression() {
        int n = 1_000;
        UnionFind unionFind = new UnionFind(n);
        for (int i = 1; i < n; i++) {
            unionFind.union(i - 1, i);
        }
        assertEquals(1, unionFind.componentCount());
        assertEquals(n, unionFind.componentSize(0));
        int root = unionFind.find(n - 1);
        for (int i : List.of(0, 17, 512, n - 1)) {
            assertEquals(root, unionFind.find(i));
        }
    }
}
