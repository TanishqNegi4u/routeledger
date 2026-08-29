package com.routeledger.service;

import com.routeledger.domain.Business;
import com.routeledger.domain.Plan;
import com.routeledger.domain.Role;
import com.routeledger.domain.User;
import com.routeledger.dto.AuthDtos;
import com.routeledger.exception.ApiException;
import com.routeledger.exception.BadRequestException;
import com.routeledger.exception.ConflictException;
import com.routeledger.exception.NotFoundException;
import com.routeledger.exception.RateLimitException;
import com.routeledger.repository.BusinessRepository;
import com.routeledger.repository.UserRepository;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.security.JwtService;
import com.routeledger.security.RateLimiter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/** Registration, sign-in and session rehydration. One registration creates one tenant. */
@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    /** Per-IP rate limit: max requests in the window for login and register. */
    private static final int IP_MAX_ATTEMPTS = 5;
    private static final int IP_WINDOW_SECONDS = 60;

    /** Account-level lockout: failures within LOCKOUT_WINDOW trigger a LOCKOUT_DURATION lock. */
    private static final int ACCOUNT_MAX_FAILURES = 10;
    private static final Duration LOCKOUT_WINDOW = Duration.ofMinutes(15);
    private static final Duration LOCKOUT_DURATION = Duration.ofMinutes(15);

    private final BusinessRepository businesses;
    private final UserRepository users;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final RateLimiter rateLimiter;

    public AuthService(BusinessRepository businesses, UserRepository users,
                       PasswordEncoder passwordEncoder, JwtService jwtService,
                       RateLimiter rateLimiter) {
        this.businesses = businesses;
        this.users = users;
        this.passwordEncoder = passwordEncoder;
        this.jwtService = jwtService;
        this.rateLimiter = rateLimiter;
    }

    @Transactional
    public AuthDtos.AuthResponse register(AuthDtos.RegisterRequest request, String clientIp) {
        enforceIpLimit(clientIp, "register");

        String email = request.email().trim().toLowerCase();
        if (users.existsByEmailIgnoreCase(email)) {
            throw new ConflictException("An account already exists for " + email);
        }
        Business business = new Business();
        business.setName(request.businessName().trim());
        business.setOwnerName(request.ownerName().trim());
        business.setPhone(request.phone().trim());
        business.setCity(request.city() == null || request.city().isBlank()
                ? "Unspecified" : request.city().trim());
        business.setPlan(Plan.TRIAL);
        business.setCurrency("INR");
        businesses.save(business);

        String verificationToken = UUID.randomUUID().toString().replace("-", "");

        User user = new User();
        user.setBusinessId(business.getId());
        user.setName(request.ownerName().trim());
        user.setEmail(email);
        user.setPhone(request.phone().trim());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(Role.OWNER);
        user.setActive(true);
        user.setEmailVerified(false);
        user.setVerificationToken(verificationToken);
        users.save(user);

        log.info("Email verification token generated for {}: token={}. Verification URL: /api/auth/verify?token={}",
                email, verificationToken, verificationToken);

        return response(user, business);
    }

    @Transactional
    public AuthDtos.AuthResponse login(AuthDtos.LoginRequest request, String clientIp) {
        String email = request.email().trim().toLowerCase();

        // 1. Per-IP rate limit (email+IP composite key)
        enforceLoginIpLimit(email, clientIp);

        // 2. Find user
        User user = users.findByEmailIgnoreCase(email)
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED,
                        "Email or password is incorrect."));

        // 3. Account-level lockout check
        if (user.getLockedUntil() != null && Instant.now().isBefore(user.getLockedUntil())) {
            long minutes = Duration.between(Instant.now(), user.getLockedUntil()).toMinutes() + 1;
            log.warn("Login blocked for locked account {} from IP {}", email, clientIp);
            throw new RateLimitException(
                    "This account is temporarily locked due to too many failed attempts. Try again in " + minutes + " minute(s).");
        }

        // 4. Password check
        if (!user.isActive() || !passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            recordFailedAttempt(user);
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }

        // 5. Successful login — reset failure counters
        if (user.getFailedLoginAttempts() > 0) {
            user.setFailedLoginAttempts(0);
            user.setFailedLoginWindowStart(null);
            user.setLockedUntil(null);
            users.save(user);
        }

        Business business = businesses.findById(user.getBusinessId())
                .orElseThrow(() -> NotFoundException.of("Business", user.getBusinessId()));
        return response(user, business);
    }

    @Transactional(readOnly = true)
    public AuthDtos.SessionView session(AuthPrincipal principal) {
        User user = users.findByIdAndBusinessId(principal.userId(), principal.businessId())
                .orElseThrow(() -> NotFoundException.of("User", principal.userId()));
        Business business = businesses.findById(principal.businessId())
                .orElseThrow(() -> NotFoundException.of("Business", principal.businessId()));
        return new AuthDtos.SessionView(userView(user), businessView(business));
    }

    @Transactional
    public void changePassword(AuthPrincipal principal, AuthDtos.ChangePasswordRequest request) {
        User user = users.findByIdAndBusinessId(principal.userId(), principal.businessId())
                .orElseThrow(() -> NotFoundException.of("User", principal.userId()));
        if (!passwordEncoder.matches(request.currentPassword(), user.getPasswordHash())) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "Your current password is incorrect.");
        }
        user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
        users.save(user);
    }

    @Transactional
    public AuthDtos.VerifyEmailResponse verifyEmail(String token) {
        if (token == null || token.isBlank()) {
            throw new BadRequestException("Verification token is required.");
        }
        User user = users.findByVerificationToken(token.trim())
                .orElseThrow(() -> new BadRequestException("Invalid or expired verification token."));
        user.setEmailVerified(true);
        user.setVerificationToken(null);
        users.save(user);
        log.info("Email verified successfully for user: {}", user.getEmail());
        return new AuthDtos.VerifyEmailResponse(true, user.getEmail(),
                "Your email has been successfully verified.");
    }

    // ---- rate limiting helpers ----

    private void enforceIpLimit(String clientIp, String action) {
        String key = action + ":" + clientIp;
        if (!rateLimiter.tryConsume(key, IP_MAX_ATTEMPTS, IP_WINDOW_SECONDS)) {
            log.warn("IP rate limit exceeded for {} on {}", clientIp, action);
            throw new RateLimitException("Too many requests. Please wait a moment before trying again.");
        }
    }

    private void enforceLoginIpLimit(String email, String clientIp) {
        String key = "login:" + email.toLowerCase() + ":" + clientIp;
        if (!rateLimiter.tryConsume(key, IP_MAX_ATTEMPTS, IP_WINDOW_SECONDS)) {
            log.warn("Login IP rate limit exceeded for {} from {}", email, clientIp);
            throw new RateLimitException("Too many login attempts. Please wait a moment before trying again.");
        }
    }

    private void recordFailedAttempt(User user) {
        Instant now = Instant.now();
        Instant windowStart = user.getFailedLoginWindowStart();

        // If no window or window has expired, start fresh
        if (windowStart == null || Duration.between(windowStart, now).compareTo(LOCKOUT_WINDOW) > 0) {
            user.setFailedLoginAttempts(1);
            user.setFailedLoginWindowStart(now);
        } else {
            user.setFailedLoginAttempts(user.getFailedLoginAttempts() + 1);
        }

        // Lock if threshold exceeded
        if (user.getFailedLoginAttempts() >= ACCOUNT_MAX_FAILURES) {
            user.setLockedUntil(now.plus(LOCKOUT_DURATION));
            log.warn("Account {} locked until {} after {} failed attempts",
                    user.getEmail(), user.getLockedUntil(), user.getFailedLoginAttempts());
        }

        users.save(user);
    }

    // ---- response helpers ----

    private AuthDtos.AuthResponse response(User user, Business business) {
        return new AuthDtos.AuthResponse(jwtService.issue(user), "Bearer", jwtService.ttlSeconds(),
                userView(user), businessView(business));
    }

    private AuthDtos.UserView userView(User user) {
        return new AuthDtos.UserView(user.getId(), user.getName(), user.getEmail(),
                user.getPhone(), user.getRole().name(), user.isEmailVerified());
    }

    private AuthDtos.BusinessView businessView(Business business) {
        return new AuthDtos.BusinessView(business.getId(), business.getName(), business.getOwnerName(),
                business.getCity(), business.getPlan().name(), business.getCurrency());
    }
}
