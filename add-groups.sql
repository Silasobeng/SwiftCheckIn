-- =============================================================
-- CELL GROUPS / FELLOWSHIPS
-- =============================================================
-- Run once in the Supabase SQL Editor. Adds a structured group a person can
-- belong to, so attendance and absence can be reported per group instead of
-- as one flat church-wide list.
--
-- Deliberately a fixed table with one label field, not a user-defined form
-- builder: anything meant to be counted or filtered on has to be structured,
-- and a free-text field would let "Bethel", "bethel" and "Bethel Cell" split
-- one real group into three. group_label lets each church call the concept
-- what it actually calls it (Cell Group, Fellowship, Zone, Bacenta...)
-- without touching the data model underneath.

CREATE TABLE IF NOT EXISTS groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Optional — a group doesn't need a named leader to exist, but naming one
  -- is what turns "6 people absent" into "6 people for Kofi to call".
  leader_person_id UUID REFERENCES people(id) ON DELETE SET NULL,
  UNIQUE (org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_groups_org ON groups(org_id);

ALTER TABLE people ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES groups(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_people_group ON people(group_id);

-- What this church calls the concept — shown as the field label and the
-- Settings section heading everywhere in the app instead of a hardcoded
-- "Cell Group".
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS group_label TEXT NOT NULL DEFAULT 'Cell Group';

ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
-- No public policies — only the service-role key (used server-side) can read
-- or write this table, same as every other table in this schema. The anon
-- key, exposed in the browser, gets nothing.
CREATE POLICY "groups_no_anon_select" ON groups
  FOR SELECT USING (false);
CREATE POLICY "groups_no_anon_insert" ON groups
  FOR INSERT WITH CHECK (false);
CREATE POLICY "groups_no_anon_update" ON groups
  FOR UPDATE USING (false);
CREATE POLICY "groups_no_anon_delete" ON groups
  FOR DELETE USING (false);
