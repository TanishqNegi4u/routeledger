package com.routeledger.security;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

/**
 * Distributed rate limiter backed by Redis.
 *
 * <p>Uses an atomic Lua script executing INCR + EXPIRE on the first touch so that rate
 * limits are accurately enforced across multiple backend pods / horizontally scaled instances.
 * Falls back to allowing the request if Redis is temporarily unreachable to avoid taking down auth.
 */
@Component
@ConditionalOnProperty(name = "routeledger.rate-limit.type", havingValue = "redis")
public class RedisRateLimiter implements RateLimiter {

    private static final Logger log = LoggerFactory.getLogger(RedisRateLimiter.class);

    private static final String LUA_SCRIPT =
            "local current = redis.call('INCR', KEYS[1])\n" +
            "if current == 1 then\n" +
            "    redis.call('EXPIRE', KEYS[1], ARGV[1])\n" +
            "end\n" +
            "return current";

    private final StringRedisTemplate redisTemplate;
    private final DefaultRedisScript<Long> script;

    public RedisRateLimiter(StringRedisTemplate redisTemplate) {
        this.redisTemplate = redisTemplate;
        this.script = new DefaultRedisScript<>(LUA_SCRIPT, Long.class);
    }

    @Override
    public boolean tryConsume(String key, int maxAttempts, int windowSeconds) {
        try {
            String redisKey = "rl:ratelimit:" + key;
            List<String> keys = Collections.singletonList(redisKey);
            Long count = redisTemplate.execute(script, keys, String.valueOf(windowSeconds));
            return count != null && count <= maxAttempts;
        } catch (Exception ex) {
            log.warn("Redis rate limiter failed for key '{}': {}. Allowing request as fail-open.", key, ex.getMessage());
            return true;
        }
    }
}
