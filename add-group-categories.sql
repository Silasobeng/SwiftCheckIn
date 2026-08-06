-- =============================================================
-- GROUP CATEGORIES
-- =============================================================
-- Run once in the Supabase SQL Editor, AFTER add-groups.sql.
--
-- add-groups.sql assumed every church has exactly one kind of grouping
-- ("Cell Group", relabelled). That's wrong — a church might want Cell Groups
-- AND Departments (Choir, Ushering, Media...) at the same time, and a person
-- can belong to one of each simultaneously. This migration introduces
-- group_categories (the church creates as many as it needs), makes every
-- group belong to one, and replaces the one-group-per-person column with a
-- proper many-to-many table so a person can hold one membership per
-- category without the categories colliding.
--
-- Existing data is preserved, not discarded: whatever groups and person
-- assignments already exist are moved under a single backfilled category
-- (named from the old group_label) rather than dropped.

-- ---------------------------------------------------------------
-- 1. Categories themselves.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS group_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  UNIQUE (org_id, name)
);
CREATE INDEX IF NOT EXISTS idx_group_categories_org ON group_categories(org_id);

-- ---------------------------------------------------------------
-- 2. Every existing group gets a category. One is backfilled per org that
--    already has groups, named from that org's old group_label (defaulting
--    to "Cell Group" if it was never set) so nothing that was already typed
--    in gets lost.
-- ---------------------------------------------------------------
INSERT INTO group_categories (org_id, name)
SELECT DISTINCT g.org_id, COALESCE(NULLIF(o.group_label, ''), 'Cell Group')
FROM groups g
JOIN organizations o ON o.id = g.org_id
ON CONFLICT (org_id, name) DO NOTHING;

ALTER TABLE groups ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES group_categories(id) ON DELETE CASCADE;

UPDATE groups g
SET category_id = gc.id
FROM organizations o, group_categories gc
WHERE g.category_id IS NULL
  AND o.id = g.org_id
  AND gc.org_id = g.org_id
  AND gc.name = COALESCE(NULLIF(o.group_label, ''), 'Cell Group');

ALTER TABLE groups ALTER COLUMN category_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_groups_category ON groups(category_id);

-- A group's name only has to be unique within its own category now — two
-- different categories are allowed to each have a group called the same
-- thing (unlikely, but there's no reason to forbid it once they're separate
-- buckets). The old org-wide uniqueness is dropped in favour of this.
ALTER TABLE groups DROP CONSTRAINT IF EXISTS groups_org_id_name_key;
ALTER TABLE groups ADD CONSTRAINT groups_category_id_name_key UNIQUE (category_id, name);

-- ---------------------------------------------------------------
-- 3. Many-to-many membership, replacing the single group_id column. A
--    person can now hold more than one membership at once (one Cell Group,
--    one Department) — something a single foreign key on people could
--    never represent.
-- ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS people_groups (
  person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (person_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_people_groups_person ON people_groups(person_id);
CREATE INDEX IF NOT EXISTS idx_people_groups_group ON people_groups(group_id);

INSERT INTO people_groups (person_id, group_id)
SELECT id, group_id FROM people WHERE group_id IS NOT NULL
ON CONFLICT DO NOTHING;

ALTER TABLE people DROP COLUMN IF EXISTS group_id;
ALTER TABLE organizations DROP COLUMN IF EXISTS group_label;

-- ---------------------------------------------------------------
-- 4. RLS — same no-public-access pattern as every other table here. Only
--    the service-role key (used server-side) can read or write.
-- ---------------------------------------------------------------
ALTER TABLE group_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "group_categories_no_anon_select" ON group_categories FOR SELECT USING (false);
CREATE POLICY "group_categories_no_anon_insert" ON group_categories FOR INSERT WITH CHECK (false);
CREATE POLICY "group_categories_no_anon_update" ON group_categories FOR UPDATE USING (false);
CREATE POLICY "group_categories_no_anon_delete" ON group_categories FOR DELETE USING (false);

ALTER TABLE people_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "people_groups_no_anon_select" ON people_groups FOR SELECT USING (false);
CREATE POLICY "people_groups_no_anon_insert" ON people_groups FOR INSERT WITH CHECK (false);
CREATE POLICY "people_groups_no_anon_update" ON people_groups FOR UPDATE USING (false);
CREATE POLICY "people_groups_no_anon_delete" ON people_groups FOR DELETE USING (false);
