-- Add email verification columns to users table
ALTER TABLE users
    ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT TRUE AFTER active,
    ADD COLUMN verification_token VARCHAR(64) NULL AFTER email_verified;

CREATE INDEX idx_users_verification_token ON users (verification_token);
