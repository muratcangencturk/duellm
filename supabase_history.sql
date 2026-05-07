-- duellm History Sync SQL
-- Run this in Supabase Dashboard: https://snsyrkukdmjpovxrsrcw.supabase.co → SQL Editor
CREATE TABLE IF NOT EXISTS history (
  id TEXT NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  topic TEXT,
  modelL TEXT,
  modelR TEXT,
  sysL TEXT,
  sysR TEXT,
  msgs JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
CREATE INDEX IF NOT EXISTS idx_history_user_created ON history(user_id, created_at DESC);
ALTER TABLE history ENABLE ROW LEVEL SECURITY;
