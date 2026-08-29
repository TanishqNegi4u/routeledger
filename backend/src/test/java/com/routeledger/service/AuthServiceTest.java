package com.routeledger.service;

import com.routeledger.domain.Business;
import com.routeledger.domain.Plan;
import com.routeledger.domain.RefreshToken;
import com.routeledger.domain.Role;
import com.routeledger.domain.User;
import com.routeledger.dto.AuthDtos;
import com.routeledger.exception.ApiException;
import com.routeledger.exception.RateLimitException;
import com.routeledger.repository.BusinessRepository;
import com.routeledger.repository.RefreshTokenRepository;
import com.routeledger.repository.UserRepository;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.security.JwtService;
import com.routeledger.security.RateLimiter;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private BusinessRepository businesses;
    @Mock
    private UserRepository users;
    @Mock
    private RefreshTokenRepository refreshTokens;
    @Mock
    private PasswordEncoder passwordEncoder;
    @Mock
    private JwtService jwtService;
    @Mock
    private RateLimiter rateLimiter;

    private AuthService authService;

    private User testUser;
    private Business testBusiness;

    @BeforeEach
    void setUp() {
        authService = new AuthService(businesses, users, refreshTokens, passwordEncoder, jwtService, rateLimiter);

        testBusiness = new Business();
        testBusiness.setId(1L);
        testBusiness.setName("Test Dairy");
        testBusiness.setOwnerName("Ravi");
        testBusiness.setPlan(Plan.GROWTH);
        testBusiness.setCurrency("INR");

        testUser = new User();
        testUser.setId(10L);
        testUser.setBusinessId(1L);
        testUser.setName("Ravi");
        testUser.setEmail("ravi@testdairy.in");
        testUser.setPasswordHash("hashed_password");
        testUser.setRole(Role.OWNER);
        testUser.setActive(true);
        testUser.setEmailVerified(true);
    }

    @Test
    @DisplayName("Login issues short-lived access token and rotating refresh token")
    void login_Success() {
        when(rateLimiter.tryConsume(anyString(), anyInt(), anyInt())).thenReturn(true);
        when(users.findByEmailIgnoreCase("ravi@testdairy.in")).thenReturn(Optional.of(testUser));
        when(passwordEncoder.matches("password123", "hashed_password")).thenReturn(true);
        when(businesses.findById(1L)).thenReturn(Optional.of(testBusiness));
        when(jwtService.issue(testUser)).thenReturn("jwt.access.token");
        when(jwtService.ttlSeconds()).thenReturn(900L);

        AuthDtos.LoginRequest request = new AuthDtos.LoginRequest("ravi@testdairy.in", "password123");
        AuthDtos.AuthResponse response = authService.login(request, "127.0.0.1");

        assertThat(response.token()).isEqualTo("jwt.access.token");
        assertThat(response.refreshToken()).isNotBlank();
        assertThat(response.expiresInSeconds()).isEqualTo(900L);
        assertThat(response.user().email()).isEqualTo("ravi@testdairy.in");

        ArgumentCaptor<RefreshToken> tokenCaptor = ArgumentCaptor.forClass(RefreshToken.class);
        verify(refreshTokens).save(tokenCaptor.capture());
        RefreshToken savedToken = tokenCaptor.getValue();
        assertThat(savedToken.getUserId()).isEqualTo(10L);
        assertThat(savedToken.getBusinessId()).isEqualTo(1L);
        assertThat(savedToken.getTokenHash()).isNotBlank();
        assertThat(savedToken.getFamilyId()).isNotBlank();
        assertThat(savedToken.isRevoked()).isFalse();
    }

    @Test
    @DisplayName("Refresh token rotation issues new access & refresh token in the same family")
    void refresh_Success_RotatesToken() {
        when(rateLimiter.tryConsume(anyString(), anyInt(), anyInt())).thenReturn(true);

        RefreshToken existingToken = new RefreshToken();
        existingToken.setId(100L);
        existingToken.setBusinessId(1L);
        existingToken.setUserId(10L);
        existingToken.setFamilyId("family-uuid-123");
        existingToken.setTokenHash("somehash");
        existingToken.setRevoked(false);
        existingToken.setExpiresAt(Instant.now().plus(7, ChronoUnit.DAYS));

        when(refreshTokens.findByTokenHash(anyString())).thenReturn(Optional.of(existingToken));
        when(users.findByIdAndBusinessId(10L, 1L)).thenReturn(Optional.of(testUser));
        when(businesses.findById(1L)).thenReturn(Optional.of(testBusiness));
        when(jwtService.issue(testUser)).thenReturn("jwt.new.access.token");
        when(jwtService.ttlSeconds()).thenReturn(900L);

        AuthDtos.RefreshRequest request = new AuthDtos.RefreshRequest("raw-refresh-token-12345");
        AuthDtos.AuthResponse response = authService.refresh(request, "127.0.0.1");

        assertThat(response.token()).isEqualTo("jwt.new.access.token");
        assertThat(response.refreshToken()).isNotBlank();
        assertThat(response.refreshToken()).isNotEqualTo("raw-refresh-token-12345");

        // Old token should be marked revoked with reason ROTATED
        assertThat(existingToken.isRevoked()).isTrue();
        assertThat(existingToken.getRevocationReason()).isEqualTo("ROTATED");
    }

    @Test
    @DisplayName("Replaying a revoked refresh token revokes the entire token family")
    void refresh_ReplayAttack_RevokesFamily() {
        when(rateLimiter.tryConsume(anyString(), anyInt(), anyInt())).thenReturn(true);

        RefreshToken replayedToken = new RefreshToken();
        replayedToken.setId(100L);
        replayedToken.setBusinessId(1L);
        replayedToken.setUserId(10L);
        replayedToken.setFamilyId("family-uuid-replay");
        replayedToken.setTokenHash("somehash");
        replayedToken.setRevoked(true);
        replayedToken.setRevocationReason("ROTATED");
        replayedToken.setExpiresAt(Instant.now().plus(7, ChronoUnit.DAYS));

        when(refreshTokens.findByTokenHash(anyString())).thenReturn(Optional.of(replayedToken));

        AuthDtos.RefreshRequest request = new AuthDtos.RefreshRequest("already-rotated-token");

        assertThatThrownBy(() -> authService.refresh(request, "127.0.0.1"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.UNAUTHORIZED)
                .hasMessageContaining("Refresh token has been revoked");

        // Assert entire family was revoked with REPLAY_ATTACK
        verify(refreshTokens).revokeFamily(eq("family-uuid-replay"), eq("REPLAY_ATTACK"));
    }

    @Test
    @DisplayName("Expired refresh token is rejected")
    void refresh_Expired_ReturnsUnauthorized() {
        when(rateLimiter.tryConsume(anyString(), anyInt(), anyInt())).thenReturn(true);

        RefreshToken expiredToken = new RefreshToken();
        expiredToken.setId(100L);
        expiredToken.setBusinessId(1L);
        expiredToken.setUserId(10L);
        expiredToken.setFamilyId("family-uuid-expired");
        expiredToken.setTokenHash("somehash");
        expiredToken.setRevoked(false);
        expiredToken.setExpiresAt(Instant.now().minus(1, ChronoUnit.DAYS));

        when(refreshTokens.findByTokenHash(anyString())).thenReturn(Optional.of(expiredToken));

        AuthDtos.RefreshRequest request = new AuthDtos.RefreshRequest("expired-token");

        assertThatThrownBy(() -> authService.refresh(request, "127.0.0.1"))
                .isInstanceOf(ApiException.class)
                .hasFieldOrPropertyWithValue("status", HttpStatus.UNAUTHORIZED)
                .hasMessageContaining("Refresh token has expired");
    }

    @Test
    @DisplayName("Logout revokes refresh token family server-side")
    void logout_RevokesTokenFamily() {
        RefreshToken token = new RefreshToken();
        token.setFamilyId("logout-family-uuid");

        when(refreshTokens.findByTokenHash(anyString())).thenReturn(Optional.of(token));

        AuthDtos.LogoutRequest request = new AuthDtos.LogoutRequest("valid-refresh-token");
        AuthPrincipal principal = new AuthPrincipal(10L, 1L, "ravi@testdairy.in", "Ravi", Role.OWNER);

        authService.logout(request, principal);

        verify(refreshTokens).revokeFamily(eq("logout-family-uuid"), eq("LOGOUT"));
        verify(refreshTokens).revokeAllForUser(eq(10L), eq("USER_LOGOUT"));
    }
}
