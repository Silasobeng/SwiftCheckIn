-- Fix: Enable RLS on sms_logs and sms_topups (missed in add-sms.sql)
-- Also add explicit deny-all policies to payments (RLS was enabled but no policies added)
-- Run once in Supabase SQL Editor

ALTER TABLE sms_logs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_topups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sms_logs_no_anon_select"   ON sms_logs  FOR SELECT USING (false);
CREATE POLICY "sms_logs_no_anon_insert"   ON sms_logs  FOR INSERT WITH CHECK (false);
CREATE POLICY "sms_logs_no_anon_update"   ON sms_logs  FOR UPDATE USING (false);
CREATE POLICY "sms_logs_no_anon_delete"   ON sms_logs  FOR DELETE USING (false);

CREATE POLICY "sms_topups_no_anon_select" ON sms_topups FOR SELECT USING (false);
CREATE POLICY "sms_topups_no_anon_insert" ON sms_topups FOR INSERT WITH CHECK (false);
CREATE POLICY "sms_topups_no_anon_update" ON sms_topups FOR UPDATE USING (false);
CREATE POLICY "sms_topups_no_anon_delete" ON sms_topups FOR DELETE USING (false);

CREATE POLICY "payments_no_anon_select"   ON payments   FOR SELECT USING (false);
CREATE POLICY "payments_no_anon_insert"   ON payments   FOR INSERT WITH CHECK (false);
CREATE POLICY "payments_no_anon_update"   ON payments   FOR UPDATE USING (false);
CREATE POLICY "payments_no_anon_delete"   ON payments   FOR DELETE USING (false);
