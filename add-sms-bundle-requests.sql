-- Special SMS bundle requests. Run this once in the Supabase SQL editor.
CREATE TABLE IF NOT EXISTS sms_bundle_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  requested_credits INTEGER NOT NULL CHECK (requested_credits >= 1),
  budget_ghs NUMERIC,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'payment_sent', 'paid', 'cancelled')),
  quoted_amount_ghs NUMERIC,
  quoted_credits INTEGER,
  paystack_reference TEXT UNIQUE,
  quoted_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS sms_bundle_requests_org_id_idx ON sms_bundle_requests(org_id);
ALTER TABLE sms_bundle_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_bundle_requests_no_anon_select" ON sms_bundle_requests;
CREATE POLICY "sms_bundle_requests_no_anon_select" ON sms_bundle_requests FOR SELECT USING (false);
DROP POLICY IF EXISTS "sms_bundle_requests_no_anon_insert" ON sms_bundle_requests;
CREATE POLICY "sms_bundle_requests_no_anon_insert" ON sms_bundle_requests FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "sms_bundle_requests_no_anon_update" ON sms_bundle_requests;
CREATE POLICY "sms_bundle_requests_no_anon_update" ON sms_bundle_requests FOR UPDATE USING (false);
DROP POLICY IF EXISTS "sms_bundle_requests_no_anon_delete" ON sms_bundle_requests;
CREATE POLICY "sms_bundle_requests_no_anon_delete" ON sms_bundle_requests FOR DELETE USING (false);
