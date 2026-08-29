package com.routeledger.service;

import com.routeledger.domain.Customer;
import com.routeledger.dsa.Trie;
import com.routeledger.repository.CustomerRepository;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Keeps one {@link Trie} per tenant so a delivery agent typing three characters gets matches
 * in O(prefix length) instead of forcing MySQL into a leading-wildcard table scan.
 *
 * <p>The index is lazily warmed on first search and updated in place on every write. If a
 * tenant has not been warmed yet the caller falls back to SQL, so results are never wrong —
 * only slower.
 */
@Service
public class CustomerSearchIndex {

    private static final int MIN_PHONE_SUFFIX = 4;

    private final CustomerRepository customers;
    private final Map<Long, Trie> tries = new ConcurrentHashMap<>();

    public CustomerSearchIndex(CustomerRepository customers) {
        this.customers = customers;
    }

    @Transactional(readOnly = true)
    public List<Long> search(Long businessId, String term, int limit) {
        if (term == null || Trie.normalise(term).isEmpty()) {
            return List.of();
        }
        Trie trie = tries.computeIfAbsent(businessId, this::build);
        List<Long> hits = trie.searchPrefix(term, limit);
        if (!hits.isEmpty()) {
            return hits;
        }
        // Prefixes missed: the agent probably typed something from the middle of a field.
        Set<Long> fallback = new LinkedHashSet<>();
        for (Customer customer : customers.fallbackSearch(businessId, term.trim())) {
            fallback.add(customer.getId());
            if (fallback.size() >= limit) {
                break;
            }
        }
        return new ArrayList<>(fallback);
    }

    /** Called after any customer insert/update so the agent never searches a stale book. */
    public void index(Customer customer) {
        Trie trie = tries.get(customer.getBusinessId());
        if (trie != null) {
            add(trie, customer);
        }
    }

    /** Called after a delete or a bulk change; the next search rebuilds from MySQL. */
    public void evict(Long businessId) {
        tries.remove(businessId);
    }

    public int indexedTenants() {
        return tries.size();
    }

    private Trie build(Long businessId) {
        Trie trie = new Trie();
        for (Customer customer : customers.findByBusinessIdAndActiveTrue(businessId)) {
            add(trie, customer);
        }
        return trie;
    }

    private void add(Trie trie, Customer customer) {
        long id = customer.getId();
        trie.insertPhrase(customer.getName(), id);
        String phone = customer.getPhone();
        if (phone != null) {
            String digits = Trie.normalise(phone);
            trie.insert(digits, id);
            for (int start = 1; start + MIN_PHONE_SUFFIX <= digits.length(); start++) {
                trie.insert(digits.substring(start), id);
            }
        }
        if (customer.getAddress() != null) {
            trie.insertPhrase(customer.getAddress(), id);
        }
        if (customer.getLandmark() != null) {
            trie.insertPhrase(customer.getLandmark(), id);
        }
    }
}
