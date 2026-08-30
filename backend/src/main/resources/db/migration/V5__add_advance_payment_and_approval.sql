-- V5: Add advance payment, approval status, and skip credit support

ALTER TABLE subscriptions
    ADD COLUMN approval_status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
    ADD COLUMN advance_paid_paise BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN approved_at TIMESTAMP NULL;

ALTER TABLE customers
    ADD COLUMN advance_credit_paise BIGINT NOT NULL DEFAULT 0;

CREATE INDEX idx_subscriptions_approval
    ON subscriptions (business_id, approval_status, active);
