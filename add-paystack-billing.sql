-- =============================================================
-- PAYSTACK BILLING
-- =============================================================
-- Run once in the Supabase SQL Editor. Adds what's needed to accept real
-- subscription payments via Paystack (GHS, Mobile Money, card).

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;

-- One row per successful payment. UNIQUE on paystack_reference is the
-- idempotency guard: Paystack retries webhooks, and a customer can reload
-- the callback page after paying. Both must be safe to process more than
-- once without extending a subscription twice.
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  paystack_reference TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL CHECK (plan IN ('monthly','annual')),
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'GHS',
  status TEXT NOT NULL CHECK (status IN ('success','failed')),
  raw_event JSONB
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(org_id, created_at DESC);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
-- No public policies — only the service-role key (used server-side) can read
-- or write this table, same as every other table in this schema. The anon
-- key, exposed in the browser, gets nothing.
