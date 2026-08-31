-- Run once in the Supabase SQL editor if this column is not already present.
-- A non-null timestamp means the address hard-bounced or generated a complaint
-- and must be excluded from future automated sends.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS email_invalid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_people_email_invalid_at
  ON people (org_id, email_invalid_at)
  WHERE email_invalid_at IS NULL;
