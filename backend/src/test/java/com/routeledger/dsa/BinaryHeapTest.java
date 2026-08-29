package com.routeledger.dsa;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.NoSuchElementException;
import java.util.Random;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class BinaryHeapTest {

    @Test
    void minHeapDrainsInAscendingOrder() {
        BinaryHeap<Integer> heap = BinaryHeap.minHeap();
        Random random = new Random(7);
        List<Integer> expected = new ArrayList<>();
        for (int i = 0; i < 500; i++) {
            int value = random.nextInt(10_000);
            expected.add(value);
            heap.push(value);
        }
        expected.sort(Comparator.naturalOrder());
        assertEquals(500, heap.size());
        assertEquals(expected, heap.drain());
        assertTrue(heap.isEmpty());
    }

    @Test
    void maxHeapReturnsLargestFirst() {
        BinaryHeap<Integer> heap = BinaryHeap.maxHeap();
        heap.push(3);
        heap.push(91);
        heap.push(17);
        assertEquals(91, heap.peek().intValue());
        assertEquals(List.of(91, 17, 3), heap.drain());
    }

    @Test
    void popOnEmptyHeapFails() {
        BinaryHeap<Integer> heap = BinaryHeap.minHeap();
        assertThrows(NoSuchElementException.class, heap::pop);
        assertThrows(NoSuchElementException.class, heap::peek);
    }
}
