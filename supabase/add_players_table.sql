-- Run this in the Supabase SQL Editor AFTER create_scores_table.sql

-- Players table
CREATE TABLE players (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_login TIMESTAMPTZ,
  last_logout TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Link scores to players (optional)
ALTER TABLE scores ADD COLUMN user_id BIGINT REFERENCES players(id);

-- Enable RLS
ALTER TABLE players ENABLE ROW LEVEL SECURITY;

-- Policies for players (backend uses service key, but for anon key access)
CREATE POLICY "Anyone can insert players" ON players FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view players" ON players FOR SELECT USING (true);
CREATE POLICY "Anyone can update players" ON players FOR UPDATE USING (true);

-- Update scores policy to allow updates with user_id
CREATE POLICY "Anyone can update scores" ON scores FOR UPDATE USING (true);
