package com.routeledger.dsa;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Prefix trie written from scratch, indexing every token of a customer's name,
 * phone and address against the customer id.
 *
 * <p>A delivery agent standing at a gate types three characters and needs the
 * right household instantly. A SQL {@code LIKE '%abc%'} cannot use an index and
 * degrades linearly with tenant size; this trie answers in O(p + k) where p is
 * the prefix length and k the number of hits returned.</p>
 */
public class Trie {

    private static final class Node {
        private final Map<Character, Node> children = new HashMap<>(4);
        private Set<Long> payloads;
    }

    private final Node root = new Node();
    private int keyCount;

    /** Indexes a single token. Non-alphanumeric characters are ignored. */
    public void insert(String rawKey, long payloadId) {
        String key = normalise(rawKey);
        if (key.isEmpty()) {
            return;
        }
        Node node = root;
        for (int i = 0; i < key.length(); i++) {
            char ch = key.charAt(i);
            Node next = node.children.get(ch);
            if (next == null) {
                next = new Node();
                node.children.put(ch, next);
            }
            node = next;
        }
        if (node.payloads == null) {
            node.payloads = new LinkedHashSet<>(2);
        }
        if (node.payloads.add(payloadId)) {
            keyCount++;
        }
    }
    /**
     * Indexes each whitespace token plus the squashed phrase, so that both
     * "sharma" and "rahulsharma" resolve to "Rahul Sharma".
     */
    public void insertPhrase(String phrase, long payloadId) {
        if (phrase == null || phrase.isBlank()) {
            return;
        }
        for (String token : phrase.trim().split("\\s+")) {
            insert(token, payloadId);
        }
        insert(phrase, payloadId);
    }

    /** @return up to {@code limit} payload ids under the given prefix. */
    public List<Long> searchPrefix(String rawPrefix, int limit) {
        String prefix = normalise(rawPrefix);
        if (prefix.isEmpty() || limit <= 0) {
            return List.of();
        }
        Node start = descend(prefix);
        if (start == null) {
            return List.of();
        }
        Set<Long> collected = new LinkedHashSet<>();
        Deque<Node> stack = new ArrayDeque<>();
        stack.push(start);
        while (!stack.isEmpty() && collected.size() < limit) {
            Node node = stack.pop();
            if (node.payloads != null) {
                for (Long id : node.payloads) {
                    collected.add(id);
                    if (collected.size() >= limit) {
                        break;
                    }
                }
            }
            for (Node child : node.children.values()) {
                stack.push(child);
            }
        }
        return new ArrayList<>(collected);
    }
    public boolean containsPrefix(String rawPrefix) {
        String prefix = normalise(rawPrefix);
        return !prefix.isEmpty() && descend(prefix) != null;
    }

    /** Number of distinct (key, payload) pairs indexed. */
    public int size() {
        return keyCount;
    }

    private Node descend(String key) {
        Node node = root;
        for (int i = 0; i < key.length(); i++) {
            node = node.children.get(key.charAt(i));
            if (node == null) {
                return null;
            }
        }
        return node;
    }

    /** Lower-cases and strips every character that is not a letter or digit. */
    public static String normalise(String raw) {
        if (raw == null) {
            return "";
        }
        StringBuilder sb = new StringBuilder(raw.length());
        for (int i = 0; i < raw.length(); i++) {
            char ch = Character.toLowerCase(raw.charAt(i));
            if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) {
                sb.append(ch);
            }
        }
        return sb.toString();
    }
}
