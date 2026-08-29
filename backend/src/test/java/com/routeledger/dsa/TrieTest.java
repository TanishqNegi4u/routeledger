package com.routeledger.dsa;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrieTest {

    private Trie sampleIndex() {
        Trie trie = new Trie();
        trie.insertPhrase("Rahul Sharma", 1L);
        trie.insertPhrase("Ramesh Kumar", 2L);
        trie.insertPhrase("Anjali Sharma", 3L);
        trie.insert("9845012345", 1L);
        trie.insert("9812345678", 2L);
        return trie;
    }

    @Test
    void findsCustomersByAnyNameToken() {
        Trie trie = sampleIndex();
        assertEquals(List.of(1L), trie.searchPrefix("rahul", 10));
        assertTrue(trie.searchPrefix("sharma", 10).containsAll(List.of(1L, 3L)));
        assertEquals(2, trie.searchPrefix("sharma", 10).size());
        assertTrue(trie.searchPrefix("ra", 10).containsAll(List.of(1L, 2L)));
        assertEquals(List.of(1L), trie.searchPrefix("rahulsharma", 10));
    }

    @Test
    void findsCustomersByPhonePrefix() {
        Trie trie = sampleIndex();
        assertEquals(List.of(1L), trie.searchPrefix("98450", 10));
        assertEquals(2, trie.searchPrefix("98", 10).size());
        assertTrue(trie.containsPrefix("981"));
        assertFalse(trie.containsPrefix("977"));
    }

    @Test
    void honoursLimitAndRejectsEmptyQueries() {
        Trie trie = new Trie();
        for (long id = 1; id <= 10; id++) {
            trie.insert("amit" + id, id);
        }
        assertEquals(3, trie.searchPrefix("amit", 3).size());
        assertEquals(10, trie.searchPrefix("amit", 50).size());
        assertEquals(List.of(), trie.searchPrefix("", 10));
        assertEquals(List.of(), trie.searchPrefix("zzz", 10));
        assertEquals(List.of(), trie.searchPrefix("amit", 0));
    }

    @Test
    void normalisationStripsPunctuationAndCase() {
        assertEquals("flat12mgroad", Trie.normalise("Flat-12, M.G. Road"));
        assertEquals("", Trie.normalise("--- ???"));
        assertEquals("", Trie.normalise(null));
    }
}
