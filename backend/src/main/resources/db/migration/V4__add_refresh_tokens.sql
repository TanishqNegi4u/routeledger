-- ============================================================================
-- V4: Rotating refresh tokens table for short-lived access token architecture
-- ============================================================================

CREATE TABLE IF NOT EXISTS refresh_tokens (
    id                BIGINT AUTO_INCREMENT PRIMARY KEY,
    business_id       BIGINT NOT NULL,
    user_id           BIGINT NOT NULL,
    token_hash        VARCHAR(64) NOT NULL,
    family_id         VARCHAR(36) NOT NULL,
    revoked           BOOLEAN NOT NULL DEFAULT FALSE,
    revocation_reason VARCHAR(64) NULL,
    expires_at        TIMESTAMP NOT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    INDEX idx_refresh_tokens_token_hash (token_hash),
    INDEX idx_refresh_tokens_user_id (user_id),
    INDEX idx_refresh_tokens_family_id (family_id),
    CONSTRAINT fk_refresh_tokens_business FOREIGN KEY (business_id) REFERENCES businesses(id) ON DELETE CASCADE,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
