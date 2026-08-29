package com.routeledger.dsa;

import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class IntervalTreeTest {

    private static long day(String iso) {
        return LocalDate.parse(iso).toEpochDay();
    }

    @Test
    void detectsPauseCoveringADeliveryDate() {
        IntervalTree tree = new IntervalTree();
        tree.insert(day("2026-01-10"), day("2026-01-20"), 101L);
        tree.insert(day("2026-02-01"), day("2026-02-05"), 102L);
        tree.insert(day("2026-03-15"), day("2026-03-15"), 103L);

        assertTrue(tree.covers(day("2026-01-15")));
        assertTrue(tree.covers(day("2026-01-10")));
        assertTrue(tree.covers(day("2026-01-20")));
        assertFalse(tree.covers(day("2026-01-21")));
        assertTrue(tree.covers(day("2026-03-15")));
        assertEquals(3, tree.size());

        IntervalTree.Interval hit = tree.firstOverlap(day("2026-02-03"), day("2026-02-03"));
        assertNotNull(hit);
        assertEquals(102L, hit.payloadId());
        assertNull(tree.firstOverlap(day("2026-04-01"), day("2026-04-10")));
    }
    @Test
    void returnsEveryOverlapOrderedByStart() {
        IntervalTree tree = new IntervalTree();
        tree.insert(day("2026-01-01"), day("2026-01-31"), 1L);
        tree.insert(day("2026-01-25"), day("2026-02-10"), 2L);
        tree.insert(day("2026-02-20"), day("2026-02-25"), 3L);

        List<IntervalTree.Interval> hits =
                tree.findOverlaps(day("2026-01-28"), day("2026-02-21"));

        assertEquals(3, hits.size());
        assertEquals(List.of(1L, 2L, 3L),
                hits.stream().map(IntervalTree.Interval::payloadId).toList());
        assertEquals(0, tree.findOverlaps(day("2025-12-01"), day("2025-12-31")).size());
    }

    @Test
    void staysBalancedUnderSortedInserts() {
        IntervalTree tree = new IntervalTree();
        for (int i = 0; i < 1_000; i++) {
            tree.insert(i * 10L, i * 10L + 3L, i);
        }
        assertEquals(1_000, tree.size());
        // An unbalanced BST would be 1000 deep; AVL must stay under ~1.44*log2(n).
        assertTrue(tree.height() <= 20, "height was " + tree.height());
        assertTrue(tree.covers(5_003L));
        assertFalse(tree.covers(5_005L));
    }

    @Test
    void rejectsInvertedInterval() {
        assertThrows(IllegalArgumentException.class,
                () -> new IntervalTree.Interval(day("2026-05-10"), day("2026-05-01"), 9L));
    }
}
