-- Run once in Supabase SQL editor. This controls SMS credit sales for every church.
CREATE TABLE IF NOT EXISTS platform_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  sms_sales_available BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO platform_settings (id, sms_sales_available) VALUES (TRUE, TRUE) ON CONFLICT (id) DO NOTHING;
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_settings_no_anon_select" ON platform_settings;
CREATE POLICY "platform_settings_no_anon_select" ON platform_settings FOR SELECT USING (false);
DROP POLICY IF EXISTS "platform_settings_no_anon_insert" ON platform_settings;
CREATE POLICY "platform_settings_no_anon_insert" ON platform_settings FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "platform_settings_no_anon_update" ON platform_settings;
CREATE POLICY "platform_settings_no_anon_update" ON platform_settings FOR UPDATE USING (false);
