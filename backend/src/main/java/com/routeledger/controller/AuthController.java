package com.routeledger.controller;

import com.routeledger.dto.AuthDtos;
import com.routeledger.security.AuthPrincipal;
import com.routeledger.service.AuthService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** Registration, sign-in and session rehydration. The only unauthenticated endpoints. */
@RestController
@RequestMapping("/api/auth")
@Tag(name = "Auth", description = "Register a business, sign in, inspect the current session")
public class AuthController {

    private final AuthService auth;

    public AuthController(AuthService auth) {
        this.auth = auth;
    }

    @PostMapping("/register")
    @Operation(summary = "Create a business and its owner account")
    public ResponseEntity<AuthDtos.AuthResponse> register(
            @Valid @RequestBody AuthDtos.RegisterRequest request,
            HttpServletRequest httpRequest) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(auth.register(request, clientIp(httpRequest)));
    }

    @PostMapping("/login")
    @Operation(summary = "Exchange email and password for a bearer token")
    public AuthDtos.AuthResponse login(@Valid @RequestBody AuthDtos.LoginRequest request,
                                       HttpServletRequest httpRequest) {
        return auth.login(request, clientIp(httpRequest));
    }

    @GetMapping("/verify")
    @Operation(summary = "Verify account email with a verification token")
    public AuthDtos.VerifyEmailResponse verify(@RequestParam String token) {
        return auth.verifyEmail(token);
    }

    @GetMapping("/me")
    @Operation(summary = "The signed-in user and their business")
    public AuthDtos.SessionView me(@AuthenticationPrincipal AuthPrincipal principal) {
        return auth.session(principal);
    }

    @PostMapping("/change-password")
    @Operation(summary = "Rotate the signed-in user's password")
    public ResponseEntity<Void> changePassword(@AuthenticationPrincipal AuthPrincipal principal,
                                              @Valid @RequestBody AuthDtos.ChangePasswordRequest request) {
        auth.changePassword(principal, request);
        return ResponseEntity.noContent().build();
    }

    /** Extracts the real client IP, respecting X-Forwarded-For for proxied setups. */
    private static String clientIp(HttpServletRequest request) {
        String forwarded = request.getHeader("X-Forwarded-For");
        if (forwarded != null && !forwarded.isBlank()) {
            // Take the first IP in the chain (original client)
            return forwarded.split(",")[0].trim();
        }
        return request.getRemoteAddr();
    }
}
