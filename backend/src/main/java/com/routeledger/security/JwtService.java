package com.routeledger.security;

import com.routeledger.domain.Role;
import com.routeledger.domain.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Date;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Issues and verifies HS256 tokens. Every claim is written as a string so that JSON number
 * widening can never change the meaning of a tenant id.
 */
@Service
public class JwtService {

    private final SecretKey key;
    private final long ttlSeconds;
    private final String issuer;

    public JwtService(@Value("${routeledger.jwt.secret}") String secret,
                      @Value("${routeledger.jwt.ttl-seconds:86400}") long ttlSeconds,
                      @Value("${routeledger.jwt.issuer:routeledger}") String issuer) {
        byte[] raw = secret.getBytes(StandardCharsets.UTF_8);
        if (raw.length < 32) {
            throw new IllegalStateException(
                    "routeledger.jwt.secret must be at least 32 characters long (got " + raw.length + ")");
        }
        this.key = Keys.hmacShaKeyFor(raw);
        this.ttlSeconds = ttlSeconds;
        this.issuer = issuer;
    }

    public long ttlSeconds() {
        return ttlSeconds;
    }

    public String issue(User user) {
        Instant now = Instant.now();
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .issuer(issuer)
                .claim("bid", String.valueOf(user.getBusinessId()))
                .claim("role", user.getRole().name())
                .claim("name", user.getName())
                .claim("email", user.getEmail())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plusSeconds(ttlSeconds)))
                .signWith(key)
                .compact();
    }

    /** Throws any {@code JwtException} subclass when the token is absent, forged or expired. */
    public AuthPrincipal parse(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(issuer)
                .build()
                .parseSignedClaims(token)
                .getPayload();
        Long userId = Long.valueOf(claims.getSubject());
        Long businessId = Long.valueOf(String.valueOf(claims.get("bid")));
        Role role = Role.valueOf(String.valueOf(claims.get("role")));
        String name = String.valueOf(claims.get("name"));
        String email = String.valueOf(claims.get("email"));
        return new AuthPrincipal(userId, businessId, email, name, role);
    }
}
