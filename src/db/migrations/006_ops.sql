-- Phase 9: Business opportunities (SHADOW drafts)

CREATE TABLE IF NOT EXISTS opportunities (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opportunities_status ON opportunities(status);
