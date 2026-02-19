-- Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New Query)

CREATE TABLE scores (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  player_name TEXT NOT NULL DEFAULT 'Anonymous',
  score INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for leaderboard queries (top scores)
CREATE INDEX idx_scores_score_desc ON scores (score DESC);

-- Enable Row Level Security (required by Supabase)
ALTER TABLE scores ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT and SELECT (public leaderboard)
CREATE POLICY "Anyone can insert scores" ON scores FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can view scores" ON scores FOR SELECT USING (true);
