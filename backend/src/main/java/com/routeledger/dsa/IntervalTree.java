package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.List;

/**
 * Augmented AVL interval tree (each node caches the maximum end in its subtree)
 * written from scratch.
 *
 * <p>RouteLedger stores every customer "pause" (vacation, hostel shut, festival
 * skip) as a closed interval of epoch-days. Before a morning delivery run is
 * generated we must answer, for thousands of subscriptions, "is this date
 * inside any pause window?" in O(log n) instead of scanning every pause row.
 * The same structure rejects overlapping pause windows at write time.</p>
 */
public class IntervalTree {

    public record Interval(long start, long end, long payloadId) {
        public Interval {
            if (end < start) {
                throw new IllegalArgumentException("interval end must be >= start");
            }
        }

        public boolean overlaps(long queryStart, long queryEnd) {
            return start <= queryEnd && queryStart <= end;
        }

        public boolean contains(long point) {
            return start <= point && point <= end;
        }
    }

    private static final class Node {
        private final Interval interval;
        private long maxEnd;
        private int height;
        private Node left;
        private Node right;

        private Node(Interval interval) {
            this.interval = interval;
            this.maxEnd = interval.end();
            this.height = 1;
        }
    }

    private Node root;
    private int size;
    public int size() {
        return size;
    }

    public boolean isEmpty() {
        return size == 0;
    }

    public int height() {
        return height(root);
    }

    public void insert(Interval interval) {
        root = insert(root, interval);
        size++;
    }

    public void insert(long start, long end, long payloadId) {
        insert(new Interval(start, end, payloadId));
    }

    /** First interval overlapping [queryStart, queryEnd], or null. O(log n). */
    public Interval firstOverlap(long queryStart, long queryEnd) {
        Node node = root;
        while (node != null) {
            if (node.interval.overlaps(queryStart, queryEnd)) {
                return node.interval;
            }
            if (node.left != null && node.left.maxEnd >= queryStart) {
                node = node.left;
            } else {
                node = node.right;
            }
        }
        return null;
    }

    public boolean overlaps(long queryStart, long queryEnd) {
        return firstOverlap(queryStart, queryEnd) != null;
    }

    public boolean covers(long point) {
        return overlaps(point, point);
    }

    /** All overlapping intervals ordered by start. O(log n + k) with pruning. */
    public List<Interval> findOverlaps(long queryStart, long queryEnd) {
        List<Interval> out = new ArrayList<>();
        collect(root, queryStart, queryEnd, out);
        return out;
    }
    private void collect(Node node, long queryStart, long queryEnd, List<Interval> out) {
        if (node == null || node.maxEnd < queryStart) {
            return;
        }
        collect(node.left, queryStart, queryEnd, out);
        if (node.interval.overlaps(queryStart, queryEnd)) {
            out.add(node.interval);
        }
        if (node.interval.start() <= queryEnd) {
            collect(node.right, queryStart, queryEnd, out);
        }
    }

    private Node insert(Node node, Interval interval) {
        if (node == null) {
            return new Node(interval);
        }
        if (compare(interval, node.interval) < 0) {
            node.left = insert(node.left, interval);
        } else {
            node.right = insert(node.right, interval);
        }
        refresh(node);
        return rebalance(node);
    }

    private static int compare(Interval a, Interval b) {
        if (a.start() != b.start()) {
            return Long.compare(a.start(), b.start());
        }
        if (a.end() != b.end()) {
            return Long.compare(a.end(), b.end());
        }
        return Long.compare(a.payloadId(), b.payloadId());
    }

    private static int height(Node node) {
        return node == null ? 0 : node.height;
    }

    private static int balanceFactor(Node node) {
        return height(node.left) - height(node.right);
    }

    private static void refresh(Node node) {
        node.height = 1 + Math.max(height(node.left), height(node.right));
        long max = node.interval.end();
        if (node.left != null) {
            max = Math.max(max, node.left.maxEnd);
        }
        if (node.right != null) {
            max = Math.max(max, node.right.maxEnd);
        }
        node.maxEnd = max;
    }
    private static Node rebalance(Node node) {
        int factor = balanceFactor(node);
        if (factor > 1) {
            if (balanceFactor(node.left) < 0) {
                node.left = rotateLeft(node.left);
            }
            return rotateRight(node);
        }
        if (factor < -1) {
            if (balanceFactor(node.right) > 0) {
                node.right = rotateRight(node.right);
            }
            return rotateLeft(node);
        }
        return node;
    }

    private static Node rotateRight(Node y) {
        Node x = y.left;
        y.left = x.right;
        x.right = y;
        refresh(y);
        refresh(x);
        return x;
    }

    private static Node rotateLeft(Node x) {
        Node y = x.right;
        x.right = y.left;
        y.left = x;
        refresh(x);
        refresh(y);
        return y;
    }
}
