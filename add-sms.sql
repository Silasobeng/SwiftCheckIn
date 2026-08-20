-- SMS system migration
-- Run this in Supabase SQL editor

-- Per-org SMS settings and credit balance
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS sms_credits         INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_welcome_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_birthday_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_missed_enabled   BOOLEAN NOT NULL DEFAULT FALSE;

-- Per-person opt-out flag
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN NOT NULL DEFAULT FALSE;

-- Delivery log (mirrors email_logs)
CREATE TABLE IF NOT EXISTS sms_logs (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT now(),
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id        UUID        REFERENCES people(id) ON DELETE SET NULL,
  sms_type         TEXT        NOT NULL,
  recipient_phone  TEXT        NOT NULL,
  message          TEXT,
  status           TEXT        NOT NULL DEFAULT 'sent',
  arkesel_response JSONB
);

-- Topup ledger — UNIQUE on reference makes webhook retries idempotent
CREATE TABLE IF NOT EXISTS sms_topups (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at          TIMESTAMPTZ DEFAULT now(),
  org_id              UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  paystack_reference  TEXT        NOT NULL UNIQUE,
  amount_ghs          NUMERIC     NOT NULL,
  credits             INTEGER     NOT NULL,
  status              TEXT        NOT NULL DEFAULT 'success'
);

CREATE INDEX IF NOT EXISTS sms_logs_org_id_idx     ON sms_logs  (org_id);
CREATE INDEX IF NOT EXISTS sms_topups_org_id_idx   ON sms_topups (org_id);
