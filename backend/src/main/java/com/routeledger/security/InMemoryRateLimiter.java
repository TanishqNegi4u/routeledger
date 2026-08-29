package com.routeledger.security;

import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * Lightweight in-memory rate limiter for authentication endpoints in single-node / dev environments.
 * Uses a fixed-window approach keyed by a compound string (email+IP or just IP).
 */
@Component
@ConditionalOnProperty(name = "routeledger.rate-limit.type", havingValue = "in-memory", matchIfMissing = true)
public class InMemoryRateLimiter implements RateLimiter {

    private final ConcurrentHashMap<String, Window> windows = new ConcurrentHashMap<>();

    @Override
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

    @Override
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
