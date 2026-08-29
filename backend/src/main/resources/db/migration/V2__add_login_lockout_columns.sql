-- Add account-lockout columns to users table for brute-force protection.
ALTER TABLE users
    ADD COLUMN failed_login_attempts INT NOT NULL DEFAULT 0 AFTER active,
    ADD COLUMN failed_login_window_start DATETIME(6) NULL AFTER failed_login_attempts,
    ADD COLUMN locked_until DATETIME(6) NULL AFTER failed_login_window_start;
