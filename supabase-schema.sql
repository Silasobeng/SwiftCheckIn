-- =====================================================
-- SWIFTCHECKIN MULTI-TENANT SAAS - HARDENED V2
-- Complete Database Schema with Real RLS
-- =====================================================

-- Drop existing tables (clean slate)
DROP TABLE IF EXISTS email_logs CASCADE;
DROP TABLE IF EXISTS email_templates CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS checkins CASCADE;
DROP TABLE IF EXISTS services CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- =====================================================
-- ORGANIZATIONS (Multi-tenant core)
-- =====================================================
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Church info
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  tagline TEXT,
  host_names TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  logo_url TEXT,
  cover_image_url TEXT,
  brand_color TEXT DEFAULT '#4f46e5',
  kiosk_welcome_heading TEXT,
  kiosk_welcome_subtext TEXT,
  
  -- Admin credentials
  admin_name TEXT NOT NULL,
  admin_email TEXT NOT NULL UNIQUE,
  admin_password_hash TEXT NOT NULL,
  
  -- Subscription
  subscription_status TEXT NOT NULL DEFAULT 'trial' CHECK (subscription_status IN ('trial', 'active', 'expired', 'cancelled')),
  subscription_plan TEXT DEFAULT 'monthly' CHECK (subscription_plan IN ('monthly', 'annual')),
  subscription_start_date DATE DEFAULT CURRENT_DATE,
  subscription_end_date DATE DEFAULT (CURRENT_DATE + INTERVAL '14 days'),
  
  -- Settings
  timezone TEXT DEFAULT 'Africa/Accra'
);

-- =====================================================
-- PEOPLE (Members/Visitors per org)
-- =====================================================
CREATE TABLE people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Basic info
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('male', 'female')),
  email TEXT,
  photo_url TEXT,
  date_of_birth DATE,
  
  -- Additional info
  occupation TEXT,
  company TEXT,
  location TEXT,
  how_found_us TEXT,
  notes TEXT,
  
  -- Status
  role TEXT NOT NULL DEFAULT 'visitor' CHECK (role IN ('visitor', 'member', 'leader')),
  first_attendance_date DATE,
  total_checkins INTEGER NOT NULL DEFAULT 0,
  last_checkin_at TIMESTAMPTZ,
  archived BOOLEAN NOT NULL DEFAULT false,
  
  -- Unique phone per org
  UNIQUE (org_id, phone)
);

-- =====================================================
-- SERVICES (Events/Gatherings per org)
-- =====================================================
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  -- Service details
  service_date DATE NOT NULL,
  service_time TEXT,
  title TEXT,
  theme TEXT,
  scripture TEXT,
  message TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT false
);

-- =====================================================
-- APP SETTINGS (Per org kiosk control)
-- =====================================================
CREATE TABLE app_settings (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  kiosk_open BOOLEAN NOT NULL DEFAULT false,
  active_service_id UUID REFERENCES services(id) ON DELETE SET NULL,
  kiosk_access_code TEXT DEFAULT substring(md5(random()::text) from 1 for 6),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =====================================================
-- CHECKINS (Attendance records)
-- =====================================================
CREATE TABLE checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  
  -- Check-in details
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_first_time BOOLEAN NOT NULL DEFAULT false,
  synced BOOLEAN NOT NULL DEFAULT true,
  
  -- One check-in per person per service
  UNIQUE (org_id, person_id, service_id)
);

-- =====================================================
-- EMAIL TEMPLATES (Per org)
-- =====================================================
CREATE TABLE email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  
  template_type TEXT NOT NULL CHECK (template_type IN ('welcome', 'birthday', 'missed')),
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  
  UNIQUE (org_id, template_type)
);

-- =====================================================
-- EMAIL LOGS (Audit trail)
-- =====================================================
CREATE TABLE email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  
  email_type TEXT NOT NULL,
  subject TEXT,
  recipient_email TEXT,
  status TEXT DEFAULT 'sent' CHECK (status IN ('sent', 'failed'))
);

-- =====================================================
-- INDEXES (Performance)
-- =====================================================
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_admin_email ON organizations(admin_email);
CREATE INDEX idx_organizations_subscription ON organizations(subscription_status, subscription_end_date);
CREATE INDEX idx_people_org_name ON people(org_id, full_name);
CREATE INDEX idx_people_org_phone ON people(org_id, phone);
CREATE INDEX idx_people_org_archived ON people(org_id, archived);
CREATE INDEX idx_services_org_date ON services(org_id, service_date DESC);
CREATE INDEX idx_services_org_active ON services(org_id, is_active);
CREATE INDEX idx_checkins_org_service ON checkins(org_id, service_id);
CREATE INDEX idx_checkins_person ON checkins(person_id);

-- =====================================================
-- TRIGGERS (Auto-update timestamps & stats)
-- =====================================================
CREATE OR REPLACE FUNCTION touch_updated_at() 
RETURNS TRIGGER AS $$ 
BEGIN 
  NEW.updated_at = now(); 
  RETURN NEW; 
END; 
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION refresh_person_stats() 
RETURNS TRIGGER AS $$
DECLARE 
  target_person UUID;
BEGIN
  target_person := COALESCE(NEW.person_id, OLD.person_id);
  
  UPDATE people p 
  SET 
    total_checkins = COALESCE(stats.total_count, 0), 
    last_checkin_at = stats.last_seen, 
    first_attendance_date = COALESCE(p.first_attendance_date, stats.first_service_date), 
    updated_at = now()
  FROM (
    SELECT 
      c.person_id, 
      COUNT(*)::INTEGER AS total_count, 
      MAX(c.checked_in_at) AS last_seen, 
      MIN(s.service_date) AS first_service_date
    FROM checkins c 
    JOIN services s ON s.id = c.service_id 
    WHERE c.person_id = target_person 
    GROUP BY c.person_id
  ) stats 
  WHERE p.id = target_person;
  
  -- Handle case where all checkins deleted
  UPDATE people 
  SET total_checkins = 0, last_checkin_at = NULL, updated_at = now() 
  WHERE id = target_person 
    AND NOT EXISTS (SELECT 1 FROM checkins WHERE person_id = target_person);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_people_updated_at BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON services FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_checkins_updated_at BEFORE UPDATE ON checkins FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_email_templates_updated_at BEFORE UPDATE ON email_templates FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_refresh_person_stats_insert AFTER INSERT ON checkins FOR EACH ROW EXECUTE FUNCTION refresh_person_stats();
CREATE TRIGGER trg_refresh_person_stats_update AFTER UPDATE ON checkins FOR EACH ROW EXECUTE FUNCTION refresh_person_stats();
CREATE TRIGGER trg_refresh_person_stats_delete AFTER DELETE ON checkins FOR EACH ROW EXECUTE FUNCTION refresh_person_stats();

-- =====================================================
-- ROW LEVEL SECURITY - HARDENED
-- =====================================================
-- NOTE: We use service_role key on server, so RLS is bypassed there.
-- These policies protect against direct database access with anon key.
-- The anon key is locked down. Kiosk access should go through your server APIs.

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE services ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- ORGANIZATIONS: No direct anon access. All org lookups must go through server APIs.
CREATE POLICY "orgs_no_anon_select" ON organizations 
  FOR SELECT USING (false);
CREATE POLICY "orgs_no_anon_insert" ON organizations 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "orgs_no_anon_update" ON organizations 
  FOR UPDATE USING (false);
CREATE POLICY "orgs_no_anon_delete" ON organizations 
  FOR DELETE USING (false);  -- No deletes via anon

-- PEOPLE: No direct access via anon key
CREATE POLICY "people_no_anon_select" ON people 
  FOR SELECT USING (false);
CREATE POLICY "people_no_anon_insert" ON people 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "people_no_anon_update" ON people 
  FOR UPDATE USING (false);
CREATE POLICY "people_no_anon_delete" ON people 
  FOR DELETE USING (false);

-- SERVICES: No direct access via anon key
CREATE POLICY "services_no_anon_select" ON services 
  FOR SELECT USING (false);
CREATE POLICY "services_no_anon_insert" ON services 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "services_no_anon_update" ON services 
  FOR UPDATE USING (false);
CREATE POLICY "services_no_anon_delete" ON services 
  FOR DELETE USING (false);

-- APP_SETTINGS: No direct access via anon key
CREATE POLICY "settings_no_anon_select" ON app_settings 
  FOR SELECT USING (false);
CREATE POLICY "settings_no_anon_insert" ON app_settings 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "settings_no_anon_update" ON app_settings 
  FOR UPDATE USING (false);
CREATE POLICY "settings_no_anon_delete" ON app_settings 
  FOR DELETE USING (false);

-- CHECKINS: No direct access via anon key
CREATE POLICY "checkins_no_anon_select" ON checkins 
  FOR SELECT USING (false);
CREATE POLICY "checkins_no_anon_insert" ON checkins 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "checkins_no_anon_update" ON checkins 
  FOR UPDATE USING (false);
CREATE POLICY "checkins_no_anon_delete" ON checkins 
  FOR DELETE USING (false);

-- EMAIL_TEMPLATES: No direct access via anon key
CREATE POLICY "templates_no_anon_select" ON email_templates 
  FOR SELECT USING (false);
CREATE POLICY "templates_no_anon_insert" ON email_templates 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "templates_no_anon_update" ON email_templates 
  FOR UPDATE USING (false);
CREATE POLICY "templates_no_anon_delete" ON email_templates 
  FOR DELETE USING (false);

-- EMAIL_LOGS: No direct access via anon key
CREATE POLICY "logs_no_anon_select" ON email_logs 
  FOR SELECT USING (false);
CREATE POLICY "logs_no_anon_insert" ON email_logs 
  FOR INSERT WITH CHECK (false);
CREATE POLICY "logs_no_anon_update" ON email_logs 
  FOR UPDATE USING (false);
CREATE POLICY "logs_no_anon_delete" ON email_logs 
  FOR DELETE USING (false);

-- =====================================================
-- IMPORTANT: Server must use SUPABASE_SERVICE_ROLE_KEY
-- The anon key is now locked down. All data access
-- must go through server APIs with service_role.
-- =====================================================
