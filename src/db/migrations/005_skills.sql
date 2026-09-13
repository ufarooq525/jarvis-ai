-- Phase 8: Skill library (SHADOW candidates → verified)

CREATE TABLE IF NOT EXISTS skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  version TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_skills_status ON skills(status);
CREATE INDEX IF NOT EXISTS idx_skills_name ON skills(name);
