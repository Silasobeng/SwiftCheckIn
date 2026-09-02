-- Member and visitor profile photos
-- Safe to run once in the Supabase SQL Editor, including on an existing app.
ALTER TABLE people
  ADD COLUMN IF NOT EXISTS photo_url TEXT;
