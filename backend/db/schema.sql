-- Notes app database schema.
-- Safe to run more than once: every statement only creates what is missing.
-- Run with: npm run migrate

-- Subscription status of a user
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'plan_status') THEN
        CREATE TYPE plan_status AS ENUM ('free', 'expired', 'active');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email VARCHAR NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    plan plan_status DEFAULT 'free',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    plan_expires_on TIMESTAMP
);

-- deleted_at IS NULL  -> note is active
-- deleted_at NOT NULL -> note is in the trash
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    body TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    deleted_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- One row per checkout attempt (successful or declined)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    gateway_ref TEXT NOT NULL,           -- payment id returned by the payment gateway
    plan_id TEXT NOT NULL,               -- e.g. 'pro_monthly'
    amount_cents INT NOT NULL,
    currency TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('succeeded', 'declined')),
    card_brand TEXT,
    card_last4 TEXT,                     -- only the last 4 digits are ever stored
    decline_code TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_user_deleted ON notes (user_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_attachments_note ON attachments (note_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_created ON payments (user_id, created_at DESC);
