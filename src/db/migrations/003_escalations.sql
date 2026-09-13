-- Phase 2: durable approval / escalation queue

CREATE TABLE IF NOT EXISTS escalations (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  status TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_escalations_status ON escalations (status);
