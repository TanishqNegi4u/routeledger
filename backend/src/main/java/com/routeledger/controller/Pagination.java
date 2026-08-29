package com.routeledger.controller;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;

/**
 * Page/size parsing in one place. Sorting is deliberately not accepted from the client: every
 * repository finder carries the ordering that makes sense for its screen, so a caller cannot ask
 * for an unindexed sort and quietly turn a fast list into a full table scan.
 */
final class Pagination {

    private static final int MAX_SIZE = 200;
    private static final int DEFAULT_SIZE = 20;

    private Pagination() {
    }

    static Pageable of(Integer page, Integer size) {
        int safePage = page == null || page < 0 ? 0 : page;
        int safeSize = size == null || size <= 0 ? DEFAULT_SIZE : Math.min(size, MAX_SIZE);
        return PageRequest.of(safePage, safeSize);
    }
}
