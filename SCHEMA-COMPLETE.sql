-- ==============================================================
-- WEMOTIPLY — COMPLETE SCHEMA (verify + patch)
-- ==============================================================
-- Run this once in the Supabase SQL Editor. It is SAFE to run on a database
-- that already has live data, and safe to run more than once.
--
-- It does NOT drop or recreate anything. Every statement is idempotent:
--   CREATE TABLE IF NOT EXISTS  — leaves an existing table alone
--   ADD COLUMN IF NOT EXISTS    — adds only what's missing
--   DROP POLICY / CREATE POLICY — resets policies to a known-good state
--
-- After it finishes, the verification query at the very bottom prints one row
-- per expected table so you can confirm nothing is missing.
-- ==============================================================


-- ==============================================================
-- 1. CORE TABLES
-- ==============================================================

CREATE TABLE IF NOT EXISTS organizations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at              TIMESTAMPTZ DEFAULT now(),
  updated_at              TIMESTAMPTZ DEFAULT now(),
  name                    TEXT NOT NULL,
  slug                    TEXT NOT NULL UNIQUE,
  tagline                 TEXT,
  host_names              TEXT,
  address                 TEXT,
  phone                   TEXT,
  email                   TEXT,
  logo_url                TEXT,
  cover_image_url         TEXT,
  brand_color             TEXT DEFAULT '#4f46e5',
  kiosk_welcome_heading   TEXT,
  kiosk_welcome_subtext   TEXT,
  admin_name              TEXT NOT NULL,
  admin_email             TEXT NOT NULL UNIQUE,
  admin_password_hash     TEXT NOT NULL,
  subscription_status     TEXT NOT NULL DEFAULT 'trial'
                            CHECK (subscription_status IN ('trial','active','expired','cancelled')),
  subscription_plan       TEXT DEFAULT 'monthly'
                            CHECK (subscription_plan IN ('monthly','annual')),
  subscription_start_date DATE DEFAULT CURRENT_DATE,
  subscription_end_date   DATE DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  timezone                TEXT DEFAULT 'Africa/Accra'
);

-- Columns added after the original schema. Listed here so an older database
-- gets them and a fresh one is complete in a single pass.
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT,
  -- Password reset (forgot-password flow). Without these, reset silently fails.
  ADD COLUMN IF NOT EXISTS password_reset_token   TEXT,
  ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ,
  -- SMS
  ADD COLUMN IF NOT EXISTS sms_credits            INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sms_welcome_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_birthday_enabled   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_missed_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS sms_sender_id          TEXT;


CREATE TABLE IF NOT EXISTS people (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  org_id                UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name             TEXT NOT NULL,
  phone                 TEXT NOT NULL,
  gender                TEXT CHECK (gender IN ('male','female')),
  email                 TEXT,
  date_of_birth         DATE,
  occupation            TEXT,
  company               TEXT,
  location              TEXT,
  how_found_us          TEXT,
  notes                 TEXT,
  role                  TEXT NOT NULL DEFAULT 'visitor'
                          CHECK (role IN ('visitor','member','leader')),
  first_attendance_date DATE,
  total_checkins        INTEGER NOT NULL DEFAULT 0,
  last_checkin_at       TIMESTAMPTZ,
  archived              BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (org_id, phone)
);

ALTER TABLE people
  ADD COLUMN IF NOT EXISTS sms_opted_out BOOLEAN NOT NULL DEFAULT FALSE;


CREATE TABLE IF NOT EXISTS services (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT now(),
  updated_at   TIMESTAMPTZ DEFAULT now(),
  org_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  service_date DATE NOT NULL,
  service_time TEXT,
  title        TEXT,
  theme        TEXT,
  scripture    TEXT,
  message      TEXT,
  is_active    BOOLEAN NOT NULL DEFAULT false
);


CREATE TABLE IF NOT EXISTS app_settings (
  org_id            UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  kiosk_open        BOOLEAN NOT NULL DEFAULT false,
  active_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  kiosk_access_code TEXT DEFAULT substring(md5(random()::text) from 1 for 6),
  updated_at        TIMESTAMPTZ DEFAULT now()
);


CREATE TABLE IF NOT EXISTS checkins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id     UUID NOT NULL REFERENCES people(id)        ON DELETE CASCADE,
  service_id    UUID NOT NULL REFERENCES services(id)      ON DELETE CASCADE,
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_first_time BOOLEAN NOT NULL DEFAULT false,
  synced        BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (org_id, person_id, service_id)
);


-- ==============================================================
-- 2. EMAIL
-- ==============================================================

CREATE TABLE IF NOT EXISTS email_templates (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL CHECK (template_type IN ('welcome','birthday','missed')),
  subject       TEXT NOT NULL,
  body          TEXT NOT NULL,
  UNIQUE (org_id, template_type)
);

CREATE TABLE IF NOT EXISTS email_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  org_id          UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id       UUID REFERENCES people(id) ON DELETE SET NULL,
  email_type      TEXT NOT NULL,
  subject         TEXT,
  recipient_email TEXT,
  status          TEXT DEFAULT 'sent' CHECK (status IN ('sent','failed'))
);


-- ==============================================================
-- 3. GIVING
-- ==============================================================

CREATE TABLE IF NOT EXISTS giving (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id            UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id         UUID REFERENCES people(id)   ON DELETE SET NULL,
  service_id        UUID REFERENCES services(id) ON DELETE SET NULL,
  giver_name        TEXT NOT NULL,
  giver_email       TEXT,
  amount            NUMERIC NOT NULL,
  currency          TEXT NOT NULL DEFAULT 'GHS',
  giving_type       TEXT NOT NULL CHECK (giving_type IN ('tithe','offering','seed','pledge','other')),
  giving_type_other TEXT,
  payment_method    TEXT NOT NULL DEFAULT 'cash'
                      CHECK (payment_method IN ('cash','mobile_money','bank_transfer','other')),
  notes             TEXT,
  status            TEXT NOT NULL DEFAULT 'recorded' CHECK (status IN ('recorded','sent')),
  receipt_sent_at   TIMESTAMPTZ
);


-- ==============================================================
-- 4. GROUPS (church-defined fields and choices)
-- ==============================================================

CREATE TABLE IF NOT EXISTS group_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  UNIQUE (org_id, name)
);

CREATE TABLE IF NOT EXISTS groups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id           UUID NOT NULL REFERENCES organizations(id)   ON DELETE CASCADE,
  category_id      UUID NOT NULL REFERENCES group_categories(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  leader_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  UNIQUE (category_id, name)
);

CREATE TABLE IF NOT EXISTS people_groups (
  person_id  UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, group_id)
);


-- ==============================================================
-- 5. BILLING
-- ==============================================================
-- UNIQUE on paystack_reference is the idempotency guard: Paystack retries
-- webhooks and a customer can reload the callback page, and neither may
-- extend a subscription twice.

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  paystack_reference TEXT NOT NULL UNIQUE,
  plan               TEXT NOT NULL CHECK (plan IN ('monthly','annual')),
  amount             NUMERIC NOT NULL,
  currency           TEXT NOT NULL DEFAULT 'GHS',
  status             TEXT NOT NULL CHECK (status IN ('success','failed')),
  raw_event          JSONB
);


-- ==============================================================
-- 6. SMS
-- ==============================================================

CREATE TABLE IF NOT EXISTS sms_logs (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id        UUID REFERENCES people(id) ON DELETE SET NULL,
  sms_type         TEXT NOT NULL,
  recipient_phone  TEXT NOT NULL,
  message          TEXT,
  status           TEXT NOT NULL DEFAULT 'sent',
  arkesel_response JSONB
);

CREATE TABLE IF NOT EXISTS sms_topups (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at         TIMESTAMPTZ DEFAULT now(),
  org_id             UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  paystack_reference TEXT NOT NULL UNIQUE,
  amount_ghs         NUMERIC NOT NULL,
  credits            INTEGER NOT NULL,
  status             TEXT NOT NULL DEFAULT 'success'
);

CREATE TABLE IF NOT EXISTS sms_broadcasts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       TIMESTAMPTZ DEFAULT now(),
  org_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  message          TEXT NOT NULL,
  sender_id        TEXT NOT NULL,
  recipient_filter TEXT NOT NULL DEFAULT 'all',
  recipient_count  INTEGER NOT NULL DEFAULT 0,
  credits_used     INTEGER NOT NULL DEFAULT 0,
  delivered_count  INTEGER NOT NULL DEFAULT 0,
  failed_count     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'sent'
);


-- ==============================================================
-- 7. INDEXES
-- ==============================================================

CREATE INDEX IF NOT EXISTS idx_organizations_slug         ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_admin_email  ON organizations(admin_email);
CREATE INDEX IF NOT EXISTS idx_organizations_subscription ON organizations(subscription_status, subscription_end_date);
CREATE INDEX IF NOT EXISTS idx_people_org_name            ON people(org_id, full_name);
CREATE INDEX IF NOT EXISTS idx_people_org_phone           ON people(org_id, phone);
CREATE INDEX IF NOT EXISTS idx_people_org_archived        ON people(org_id, archived);
CREATE INDEX IF NOT EXISTS idx_services_org_date          ON services(org_id, service_date DESC);
CREATE INDEX IF NOT EXISTS idx_services_org_active        ON services(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_checkins_org_service       ON checkins(org_id, service_id);
CREATE INDEX IF NOT EXISTS idx_checkins_person            ON checkins(person_id);
CREATE INDEX IF NOT EXISTS idx_giving_org                 ON giving(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_groups_org                 ON groups(org_id);
CREATE INDEX IF NOT EXISTS idx_groups_category            ON groups(category_id);
CREATE INDEX IF NOT EXISTS idx_group_categories_org       ON group_categories(org_id);
CREATE INDEX IF NOT EXISTS idx_people_groups_person       ON people_groups(person_id);
CREATE INDEX IF NOT EXISTS idx_people_groups_group        ON people_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_org               ON payments(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sms_logs_org_id_idx            ON sms_logs(org_id);
CREATE INDEX IF NOT EXISTS sms_topups_org_id_idx          ON sms_topups(org_id);
CREATE INDEX IF NOT EXISTS idx_sms_broadcasts_org         ON sms_broadcasts(org_id, created_at DESC);
-- Suppression-window lookups in the missed-service cron filter on these.
CREATE INDEX IF NOT EXISTS idx_email_logs_org_type_date   ON email_logs(org_id, email_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_org_type_date     ON sms_logs(org_id, sms_type, created_at DESC);


-- ==============================================================
-- 8. TRIGGERS
-- ==============================================================

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Keeps people.total_checkins / last_checkin_at / first_attendance_date in
-- sync automatically, so the app never has to recount attendance by hand.
CREATE OR REPLACE FUNCTION refresh_person_stats()
RETURNS TRIGGER AS $$
DECLARE
  target_person UUID;
BEGIN
  target_person := COALESCE(NEW.person_id, OLD.person_id);

  UPDATE people p
  SET total_checkins        = COALESCE(stats.total_count, 0),
      last_checkin_at       = stats.last_seen,
      first_attendance_date = COALESCE(p.first_attendance_date, stats.first_service_date),
      updated_at            = now()
  FROM (
    SELECT c.person_id,
           COUNT(*)::INTEGER  AS total_count,
           MAX(c.checked_in_at) AS last_seen,
           MIN(s.service_date)  AS first_service_date
    FROM checkins c
    JOIN services s ON s.id = c.service_id
    WHERE c.person_id = target_person
    GROUP BY c.person_id
  ) stats
  WHERE p.id = target_person;

  -- Every check-in deleted: zero the counters rather than leaving them stale.
  UPDATE people
  SET total_checkins = 0, last_checkin_at = NULL, updated_at = now()
  WHERE id = target_person
    AND NOT EXISTS (SELECT 1 FROM checkins WHERE person_id = target_person);

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON organizations;
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_people_updated_at ON people;
CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_services_updated_at ON services;
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_checkins_updated_at ON checkins;
CREATE TRIGGER trg_checkins_updated_at BEFORE UPDATE ON checkins FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_email_templates_updated_at ON email_templates;
CREATE TRIGGER trg_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_giving_updated_at ON giving;
CREATE TRIGGER trg_giving_updated_at BEFORE UPDATE ON giving FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_groups_updated_at ON groups;
CREATE TRIGGER trg_groups_updated_at BEFORE UPDATE ON groups FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_refresh_person_stats_insert ON checkins;
DROP TRIGGER IF EXISTS trg_refresh_person_stats_update ON checkins;
DROP TRIGGER IF EXISTS trg_refresh_person_stats_delete ON checkins;
CREATE TRIGGER trg_refresh_person_stats_insert AFTER INSERT ON checkins FOR EACH ROW EXECUTE FUNCTION refresh_person_stats();
CREATE TRIGGER trg_refresh_person_stats_update AFTER UPDATE ON checkins FOR EACH ROW EXECUTE FUNCTION refresh_person_stats();
CREATE TRIGGER trg_refresh_person_stats_delete AFTER DELETE ON checkins FOR EACH ROW EXECUTE FUNCTION refresh_person_stats();


-- ==============================================================
-- 9. ROW LEVEL SECURITY
-- ==============================================================
-- The app talks to the database exclusively through server API routes using
-- the SERVICE_ROLE key, which bypasses RLS. The ANON key is shipped to the
-- browser and must therefore be able to read nothing at all.
--
-- So every table gets RLS enabled plus four explicit deny policies. Enabling
-- RLS with no policies would already deny by default, but explicit policies
-- make the intent auditable — and mean a future "temporary" policy can't be
-- added without someone noticing what it sits next to.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "organizations_no_anon_select" ON organizations;
CREATE POLICY "organizations_no_anon_select" ON organizations FOR SELECT USING (false);
DROP POLICY IF EXISTS "organizations_no_anon_insert" ON organizations;
CREATE POLICY "organizations_no_anon_insert" ON organizations FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "organizations_no_anon_update" ON organizations;
CREATE POLICY "organizations_no_anon_update" ON organizations FOR UPDATE USING (false);
DROP POLICY IF EXISTS "organizations_no_anon_delete" ON organizations;
CREATE POLICY "organizations_no_anon_delete" ON organizations FOR DELETE USING (false);

ALTER TABLE people ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "people_no_anon_select" ON people;
CREATE POLICY "people_no_anon_select" ON people FOR SELECT USING (false);
DROP POLICY IF EXISTS "people_no_anon_insert" ON people;
CREATE POLICY "people_no_anon_insert" ON people FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "people_no_anon_update" ON people;
CREATE POLICY "people_no_anon_update" ON people FOR UPDATE USING (false);
DROP POLICY IF EXISTS "people_no_anon_delete" ON people;
CREATE POLICY "people_no_anon_delete" ON people FOR DELETE USING (false);

ALTER TABLE services ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "services_no_anon_select" ON services;
CREATE POLICY "services_no_anon_select" ON services FOR SELECT USING (false);
DROP POLICY IF EXISTS "services_no_anon_insert" ON services;
CREATE POLICY "services_no_anon_insert" ON services FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "services_no_anon_update" ON services;
CREATE POLICY "services_no_anon_update" ON services FOR UPDATE USING (false);
DROP POLICY IF EXISTS "services_no_anon_delete" ON services;
CREATE POLICY "services_no_anon_delete" ON services FOR DELETE USING (false);

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "app_settings_no_anon_select" ON app_settings;
CREATE POLICY "app_settings_no_anon_select" ON app_settings FOR SELECT USING (false);
DROP POLICY IF EXISTS "app_settings_no_anon_insert" ON app_settings;
CREATE POLICY "app_settings_no_anon_insert" ON app_settings FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "app_settings_no_anon_update" ON app_settings;
CREATE POLICY "app_settings_no_anon_update" ON app_settings FOR UPDATE USING (false);
DROP POLICY IF EXISTS "app_settings_no_anon_delete" ON app_settings;
CREATE POLICY "app_settings_no_anon_delete" ON app_settings FOR DELETE USING (false);

ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "checkins_no_anon_select" ON checkins;
CREATE POLICY "checkins_no_anon_select" ON checkins FOR SELECT USING (false);
DROP POLICY IF EXISTS "checkins_no_anon_insert" ON checkins;
CREATE POLICY "checkins_no_anon_insert" ON checkins FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "checkins_no_anon_update" ON checkins;
CREATE POLICY "checkins_no_anon_update" ON checkins FOR UPDATE USING (false);
DROP POLICY IF EXISTS "checkins_no_anon_delete" ON checkins;
CREATE POLICY "checkins_no_anon_delete" ON checkins FOR DELETE USING (false);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_templates_no_anon_select" ON email_templates;
CREATE POLICY "email_templates_no_anon_select" ON email_templates FOR SELECT USING (false);
DROP POLICY IF EXISTS "email_templates_no_anon_insert" ON email_templates;
CREATE POLICY "email_templates_no_anon_insert" ON email_templates FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "email_templates_no_anon_update" ON email_templates;
CREATE POLICY "email_templates_no_anon_update" ON email_templates FOR UPDATE USING (false);
DROP POLICY IF EXISTS "email_templates_no_anon_delete" ON email_templates;
CREATE POLICY "email_templates_no_anon_delete" ON email_templates FOR DELETE USING (false);

ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_logs_no_anon_select" ON email_logs;
CREATE POLICY "email_logs_no_anon_select" ON email_logs FOR SELECT USING (false);
DROP POLICY IF EXISTS "email_logs_no_anon_insert" ON email_logs;
CREATE POLICY "email_logs_no_anon_insert" ON email_logs FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "email_logs_no_anon_update" ON email_logs;
CREATE POLICY "email_logs_no_anon_update" ON email_logs FOR UPDATE USING (false);
DROP POLICY IF EXISTS "email_logs_no_anon_delete" ON email_logs;
CREATE POLICY "email_logs_no_anon_delete" ON email_logs FOR DELETE USING (false);

ALTER TABLE giving ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "giving_no_anon_select" ON giving;
CREATE POLICY "giving_no_anon_select" ON giving FOR SELECT USING (false);
DROP POLICY IF EXISTS "giving_no_anon_insert" ON giving;
CREATE POLICY "giving_no_anon_insert" ON giving FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "giving_no_anon_update" ON giving;
CREATE POLICY "giving_no_anon_update" ON giving FOR UPDATE USING (false);
DROP POLICY IF EXISTS "giving_no_anon_delete" ON giving;
CREATE POLICY "giving_no_anon_delete" ON giving FOR DELETE USING (false);

ALTER TABLE group_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "group_categories_no_anon_select" ON group_categories;
CREATE POLICY "group_categories_no_anon_select" ON group_categories FOR SELECT USING (false);
DROP POLICY IF EXISTS "group_categories_no_anon_insert" ON group_categories;
CREATE POLICY "group_categories_no_anon_insert" ON group_categories FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "group_categories_no_anon_update" ON group_categories;
CREATE POLICY "group_categories_no_anon_update" ON group_categories FOR UPDATE USING (false);
DROP POLICY IF EXISTS "group_categories_no_anon_delete" ON group_categories;
CREATE POLICY "group_categories_no_anon_delete" ON group_categories FOR DELETE USING (false);

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "groups_no_anon_select" ON groups;
CREATE POLICY "groups_no_anon_select" ON groups FOR SELECT USING (false);
DROP POLICY IF EXISTS "groups_no_anon_insert" ON groups;
CREATE POLICY "groups_no_anon_insert" ON groups FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "groups_no_anon_update" ON groups;
CREATE POLICY "groups_no_anon_update" ON groups FOR UPDATE USING (false);
DROP POLICY IF EXISTS "groups_no_anon_delete" ON groups;
CREATE POLICY "groups_no_anon_delete" ON groups FOR DELETE USING (false);

ALTER TABLE people_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "people_groups_no_anon_select" ON people_groups;
CREATE POLICY "people_groups_no_anon_select" ON people_groups FOR SELECT USING (false);
DROP POLICY IF EXISTS "people_groups_no_anon_insert" ON people_groups;
CREATE POLICY "people_groups_no_anon_insert" ON people_groups FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "people_groups_no_anon_update" ON people_groups;
CREATE POLICY "people_groups_no_anon_update" ON people_groups FOR UPDATE USING (false);
DROP POLICY IF EXISTS "people_groups_no_anon_delete" ON people_groups;
CREATE POLICY "people_groups_no_anon_delete" ON people_groups FOR DELETE USING (false);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "payments_no_anon_select" ON payments;
CREATE POLICY "payments_no_anon_select" ON payments FOR SELECT USING (false);
DROP POLICY IF EXISTS "payments_no_anon_insert" ON payments;
CREATE POLICY "payments_no_anon_insert" ON payments FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "payments_no_anon_update" ON payments;
CREATE POLICY "payments_no_anon_update" ON payments FOR UPDATE USING (false);
DROP POLICY IF EXISTS "payments_no_anon_delete" ON payments;
CREATE POLICY "payments_no_anon_delete" ON payments FOR DELETE USING (false);

ALTER TABLE sms_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_logs_no_anon_select" ON sms_logs;
CREATE POLICY "sms_logs_no_anon_select" ON sms_logs FOR SELECT USING (false);
DROP POLICY IF EXISTS "sms_logs_no_anon_insert" ON sms_logs;
CREATE POLICY "sms_logs_no_anon_insert" ON sms_logs FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "sms_logs_no_anon_update" ON sms_logs;
CREATE POLICY "sms_logs_no_anon_update" ON sms_logs FOR UPDATE USING (false);
DROP POLICY IF EXISTS "sms_logs_no_anon_delete" ON sms_logs;
CREATE POLICY "sms_logs_no_anon_delete" ON sms_logs FOR DELETE USING (false);

ALTER TABLE sms_topups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_topups_no_anon_select" ON sms_topups;
CREATE POLICY "sms_topups_no_anon_select" ON sms_topups FOR SELECT USING (false);
DROP POLICY IF EXISTS "sms_topups_no_anon_insert" ON sms_topups;
CREATE POLICY "sms_topups_no_anon_insert" ON sms_topups FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "sms_topups_no_anon_update" ON sms_topups;
CREATE POLICY "sms_topups_no_anon_update" ON sms_topups FOR UPDATE USING (false);
DROP POLICY IF EXISTS "sms_topups_no_anon_delete" ON sms_topups;
CREATE POLICY "sms_topups_no_anon_delete" ON sms_topups FOR DELETE USING (false);

ALTER TABLE sms_broadcasts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sms_broadcasts_no_anon_select" ON sms_broadcasts;
CREATE POLICY "sms_broadcasts_no_anon_select" ON sms_broadcasts FOR SELECT USING (false);
DROP POLICY IF EXISTS "sms_broadcasts_no_anon_insert" ON sms_broadcasts;
CREATE POLICY "sms_broadcasts_no_anon_insert" ON sms_broadcasts FOR INSERT WITH CHECK (false);
DROP POLICY IF EXISTS "sms_broadcasts_no_anon_update" ON sms_broadcasts;
CREATE POLICY "sms_broadcasts_no_anon_update" ON sms_broadcasts FOR UPDATE USING (false);
DROP POLICY IF EXISTS "sms_broadcasts_no_anon_delete" ON sms_broadcasts;
CREATE POLICY "sms_broadcasts_no_anon_delete" ON sms_broadcasts FOR DELETE USING (false);


-- --------------------------------------------------------------
-- Legacy policy cleanup.
--
-- The first version of this schema abbreviated four table names when
-- naming policies (orgs_, settings_, templates_, logs_). The DROP
-- statements above only match the current full-table-name convention, so
-- without this those old policies survive and those four tables end up
-- with eight policies instead of four.
--
-- Harmless either way — every one of them is USING (false), and Postgres
-- OR's permissive policies together, so false OR false still denies. This
-- is purely so the policy list stays readable and an auditor doesn't have
-- to work out which of two similarly-named policies is authoritative.
-- --------------------------------------------------------------

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


-- ==============================================================
-- 10. VERIFICATION
-- ==============================================================
-- Every row should read OK. Anything marked MISSING means that table did not
-- get created — re-run this script and check the output for errors.

SELECT
  expected.table_name,
  CASE WHEN t.tablename IS NULL THEN 'MISSING' ELSE 'OK' END        AS table_status,
  CASE WHEN c.relrowsecurity THEN 'ON' ELSE 'OFF — FIX' END          AS rls,
  COALESCE(p.policy_count, 0)                                        AS policies
FROM (VALUES
  ('organizations'),('people'),('services'),('app_settings'),('checkins'),
  ('email_templates'),('email_logs'),('giving'),
  ('group_categories'),('groups'),('people_groups'),
  ('payments'),('sms_logs'),('sms_topups'),('sms_broadcasts')
) AS expected(table_name)
LEFT JOIN pg_tables t
  ON t.tablename = expected.table_name AND t.schemaname = 'public'
LEFT JOIN pg_class c
  ON c.relname = expected.table_name AND c.relnamespace = 'public'::regnamespace
LEFT JOIN (
  SELECT tablename, COUNT(*) AS policy_count
  FROM pg_policies WHERE schemaname = 'public' GROUP BY tablename
) p ON p.tablename = expected.table_name
ORDER BY expected.table_name;
