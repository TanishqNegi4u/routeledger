package com.routeledger.security;

/**
 * Contract for rate limiting auth endpoints. Implementations can be either
 * in-memory for single-node / local development, or distributed via Redis
 * when scaled to multiple replicas.
 */
public interface RateLimiter {

    /** Returns true if the request is allowed, false if the caller has exceeded the limit. */
    boolean tryConsume(String key, int maxAttempts, int windowSeconds);

    /** Clean up stale entries (if applicable for in-memory store). */
    default void evictStale(int windowSeconds) {}
}
