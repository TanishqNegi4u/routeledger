package com.routeledger.security;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.stereotype.Component;

/**
 * Lightweight in-memory rate limiter for authentication endpoints.
 *
 * <p>Uses a fixed-window approach keyed by a compound string (email+IP or just IP).
 * The window resets after {@code windowSeconds}. No external infrastructure required.
 *
 * <p>Entries are lazily evicted when checked — stale windows are replaced on access,
 * so memory stays bounded to the number of active callers within the current window.
 */
@Component
public class RateLimiter {

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    /** Returns true if the request is allowed, false if the caller has exceeded the limit. */
    public boolean tryConsume(String key, int maxAttempts, int windowSeconds) {
        long now = Instant.now().getEpochSecond();
        Window window = windows.compute(key, (k, existing) -> {
            if (existing == null || existing.isExpired(now, windowSeconds)) {
                return new Window(now);
            }
            return existing;
        });
        return window.count.incrementAndGet() <= maxAttempts;
    }

    /** Periodically clean up stale entries. Called from a scheduled task or on demand. */
    public void evictStale(int windowSeconds) {
        long now = Instant.now().getEpochSecond();
        windows.entrySet().removeIf(entry -> entry.getValue().isExpired(now, windowSeconds));
    }

    private static class Window {
        final long startEpoch;
        final AtomicInteger count = new AtomicInteger(0);

        Window(long startEpoch) {
            this.startEpoch = startEpoch;
        }

        boolean isExpired(long now, int windowSeconds) {
            return now - startEpoch >= windowSeconds;
        }
    }
}
