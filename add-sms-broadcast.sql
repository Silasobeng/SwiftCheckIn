-- SMS Broadcast / custom sender ID migration
-- Run in Supabase SQL Editor

-- Each church sets their own SMS sender name (max 11 chars, no spaces)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sms_sender_id TEXT;

-- One row per broadcast campaign
CREATE TABLE IF NOT EXISTS sms_broadcasts (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       TIMESTAMPTZ DEFAULT now(),
  org_id           UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message          TEXT        NOT NULL,
  sender_id        TEXT        NOT NULL,
  recipient_filter TEXT        NOT NULL DEFAULT 'all',
  recipient_count  INTEGER     NOT NULL DEFAULT 0,
  credits_used     INTEGER     NOT NULL DEFAULT 0,
  delivered_count  INTEGER     NOT NULL DEFAULT 0,
  failed_count     INTEGER     NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'sent'
);

CREATE INDEX IF NOT EXISTS idx_sms_broadcasts_org ON sms_broadcasts(org_id, created_at DESC);

ALTER TABLE sms_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_broadcasts_no_anon_select" ON sms_broadcasts FOR SELECT USING (false);
CREATE POLICY "sms_broadcasts_no_anon_insert" ON sms_broadcasts FOR INSERT WITH CHECK (false);
CREATE POLICY "sms_broadcasts_no_anon_update" ON sms_broadcasts FOR UPDATE USING (false);
CREATE POLICY "sms_broadcasts_no_anon_delete" ON sms_broadcasts FOR DELETE USING (false);
