package com.routeledger.security;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class RateLimiterTest {

    @Test
    @DisplayName("InMemoryRateLimiter: allows requests up to maxAttempts, then rejects")
    void inMemoryRateLimiter_AllowsThenRejects() {
        InMemoryRateLimiter limiter = new InMemoryRateLimiter();
        String key = "test-ip-127.0.0.1";

        // Consume 3 allowed attempts
        assertTrue(limiter.tryConsume(key, 3, 60));
        assertTrue(limiter.tryConsume(key, 3, 60));
        assertTrue(limiter.tryConsume(key, 3, 60));

        // 4th attempt should be blocked
        assertFalse(limiter.tryConsume(key, 3, 60));
    }

    @Test
    @DisplayName("InMemoryRateLimiter: separate keys have independent quotas")
    void inMemoryRateLimiter_DifferentKeysIndependent() {
        InMemoryRateLimiter limiter = new InMemoryRateLimiter();

        assertTrue(limiter.tryConsume("ip-1", 1, 60));
        assertFalse(limiter.tryConsume("ip-1", 1, 60));

        // ip-2 should still be allowed
        assertTrue(limiter.tryConsume("ip-2", 1, 60));
    }

    @Test
    @DisplayName("RedisRateLimiter: allows when Redis count <= maxAttempts, rejects when exceeded")
    void redisRateLimiter_EvaluatesRedisCount() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        RedisRateLimiter limiter = new RedisRateLimiter(redisTemplate);

        when(redisTemplate.execute(any(DefaultRedisScript.class), eq(List.of("rl:ratelimit:ip-3")), eq("60")))
                .thenReturn(2L);
        assertTrue(limiter.tryConsume("ip-3", 3, 60));

        when(redisTemplate.execute(any(DefaultRedisScript.class), eq(List.of("rl:ratelimit:ip-3")), eq("60")))
                .thenReturn(4L);
        assertFalse(limiter.tryConsume("ip-3", 3, 60));
    }

    @Test
    @DisplayName("RedisRateLimiter: fails open when Redis is unreachable")
    void redisRateLimiter_FailsOpenOnException() {
        StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
        RedisRateLimiter limiter = new RedisRateLimiter(redisTemplate);

        when(redisTemplate.execute(any(DefaultRedisScript.class), any(), any()))
                .thenThrow(new RuntimeException("Redis connection refused"));

        // Should return true (fail open) rather than taking down auth
        assertTrue(limiter.tryConsume("ip-failopen", 3, 60));
    }
}
