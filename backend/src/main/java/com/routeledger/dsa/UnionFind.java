package com.routeledger.dsa;

/**
 * Disjoint-set union with union-by-size and full path compression.
 * Amortised near-O(1) per operation; drives Kruskal in {@link GeoClusterer}.
 */
public class UnionFind {

    private final int[] parent;
    private final int[] size;
    private int components;

    public UnionFind(int n) {
        if (n < 0) {
            throw new IllegalArgumentException("n must be >= 0");
        }
        parent = new int[n];
        size = new int[n];
        for (int i = 0; i < n; i++) {
            parent[i] = i;
            size[i] = 1;
        }
        components = n;
    }

    public int find(int x) {
        int root = x;
        while (parent[root] != root) {
            root = parent[root];
        }
        while (parent[x] != root) {
            int next = parent[x];
            parent[x] = root;
            x = next;
        }
        return root;
    }

    /** @return true when two distinct sets were merged. */
    public boolean union(int a, int b) {
        int ra = find(a);
        int rb = find(b);
        if (ra == rb) {
            return false;
        }
        if (size[ra] < size[rb]) {
            int tmp = ra;
            ra = rb;
            rb = tmp;
        }
        parent[rb] = ra;
        size[ra] += size[rb];
        components--;
        return true;
    }

    public boolean connected(int a, int b) {
        return find(a) == find(b);
    }

    public int componentCount() {
        return components;
    }

    public int componentSize(int x) {
        return size[find(x)];
    }
}
