-- Removes the 16 duplicate policies left behind by the original schema's
-- abbreviated naming (orgs_ / settings_ / templates_ / logs_), which the
-- current schema replaced with full-table-name equivalents.
--
-- Safe: every policy dropped here is USING (false), and an identical
-- full-name policy already exists on each table. Nothing becomes readable
-- that wasn't before. Afterwards all 15 tables report exactly 4 policies.
--
-- Already folded into SCHEMA-COMPLETE.sql — this standalone copy just saves
-- re-running the whole schema.

DROP POLICY IF EXISTS "orgs_no_anon_select"      ON organizations;
DROP POLICY IF EXISTS "orgs_no_anon_insert"      ON organizations;
DROP POLICY IF EXISTS "orgs_no_anon_update"      ON organizations;
DROP POLICY IF EXISTS "orgs_no_anon_delete"      ON organizations;

DROP POLICY IF EXISTS "settings_no_anon_select"  ON app_settings;
DROP POLICY IF EXISTS "settings_no_anon_insert"  ON app_settings;
DROP POLICY IF EXISTS "settings_no_anon_update"  ON app_settings;
DROP POLICY IF EXISTS "settings_no_anon_delete"  ON app_settings;

DROP POLICY IF EXISTS "templates_no_anon_select" ON email_templates;
DROP POLICY IF EXISTS "templates_no_anon_insert" ON email_templates;
DROP POLICY IF EXISTS "templates_no_anon_update" ON email_templates;
DROP POLICY IF EXISTS "templates_no_anon_delete" ON email_templates;

DROP POLICY IF EXISTS "logs_no_anon_select"      ON email_logs;
DROP POLICY IF EXISTS "logs_no_anon_insert"      ON email_logs;
DROP POLICY IF EXISTS "logs_no_anon_update"      ON email_logs;
DROP POLICY IF EXISTS "logs_no_anon_delete"      ON email_logs;

-- Confirm: every row should now read 4.
SELECT tablename, COUNT(*) AS policies
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
