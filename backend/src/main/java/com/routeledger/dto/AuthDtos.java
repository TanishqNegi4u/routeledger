package com.routeledger.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Registration / login / session payloads. */
public final class AuthDtos {

    private AuthDtos() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 160) String businessName,
            @NotBlank @Size(max = 120) String ownerName,
            @Size(max = 80) String city,
            @NotBlank @Pattern(regexp = "^[0-9+][0-9 \\-]{7,19}$",
                    message = "phone must be 8-20 characters of digits, spaces or dashes") String phone,
            @NotBlank @Email @Size(max = 190) String email,
            @NotBlank @Size(min = 8, max = 72, message = "password must be 8-72 characters") String password) {
    }

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password) {
    }

    public record UserView(Long id, String name, String email, String phone, String role, boolean emailVerified) {
    }

    public record BusinessView(Long id, String name, String ownerName, String city,
                               String plan, String currency) {
    }

    public record AuthResponse(String token, String refreshToken, String tokenType, long expiresInSeconds,
                               UserView user, BusinessView business) {
    }

    public record RefreshRequest(
            @NotBlank(message = "refreshToken is required") String refreshToken) {
    }

    public record LogoutRequest(
            String refreshToken) {
    }

    /** Returned by GET /api/auth/me so a refreshed browser tab can rebuild its state. */
    public record SessionView(UserView user, BusinessView business) {
    }

    public record VerifyEmailResponse(boolean verified, String email, String message) {
    }

    public record ChangePasswordRequest(
            @NotBlank String currentPassword,
            @NotBlank @Size(min = 8, max = 72) String newPassword) {
    }
}
