package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;

/**
 * Array-backed binary heap written from scratch (no java.util.PriorityQueue).
 *
 * <p>Used by {@link Dijkstra} for shortest-path relaxation, by
 * {@link GeoClusterer} for Kruskal edge ordering and by the collection-risk
 * service to rank defaulters. Complexities: push/pop O(log n), peek O(1).</p>
 */
public class BinaryHeap<T> {

    private final List<T> heap = new ArrayList<>();
    private final Comparator<? super T> comparator;

    public BinaryHeap(Comparator<? super T> comparator) {
        if (comparator == null) {
            throw new IllegalArgumentException("comparator must not be null");
        }
        this.comparator = comparator;
    }

    public static <E extends Comparable<E>> BinaryHeap<E> minHeap() {
        return new BinaryHeap<>(Comparator.<E>naturalOrder());
    }

    public static <E extends Comparable<E>> BinaryHeap<E> maxHeap() {
        return new BinaryHeap<>(Comparator.<E>reverseOrder());
    }

    public int size() {
        return heap.size();
    }

    public boolean isEmpty() {
        return heap.isEmpty();
    }

    public void push(T value) {
        heap.add(value);
        siftUp(heap.size() - 1);
    }
    public T peek() {
        if (heap.isEmpty()) {
            throw new NoSuchElementException("heap is empty");
        }
        return heap.get(0);
    }

    public T pop() {
        if (heap.isEmpty()) {
            throw new NoSuchElementException("heap is empty");
        }
        T top = heap.get(0);
        T last = heap.remove(heap.size() - 1);
        if (!heap.isEmpty()) {
            heap.set(0, last);
            siftDown(0);
        }
        return top;
    }

    /** Pops every element, yielding a fully ordered list (heap-sort). */
    public List<T> drain() {
        List<T> out = new ArrayList<>(heap.size());
        while (!heap.isEmpty()) {
            out.add(pop());
        }
        return out;
    }

    private void siftUp(int index) {
        int child = index;
        while (child > 0) {
            int parent = (child - 1) >>> 1;
            if (comparator.compare(heap.get(child), heap.get(parent)) >= 0) {
                break;
            }
            swap(child, parent);
            child = parent;
        }
    }

    private void siftDown(int index) {
        int parent = index;
        int n = heap.size();
        while (true) {
            int left = (parent << 1) + 1;
            int right = left + 1;
            int best = parent;
            if (left < n && comparator.compare(heap.get(left), heap.get(best)) < 0) {
                best = left;
            }
            if (right < n && comparator.compare(heap.get(right), heap.get(best)) < 0) {
                best = right;
            }
            if (best == parent) {
                return;
            }
            swap(parent, best);
            parent = best;
        }
    }

    private void swap(int a, int b) {
        T tmp = heap.get(a);
        heap.set(a, heap.get(b));
        heap.set(b, tmp);
    }
}
