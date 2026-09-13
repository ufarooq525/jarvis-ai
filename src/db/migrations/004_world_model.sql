-- Phase 7: World Model facts + entity links (durable memory)

CREATE TABLE IF NOT EXISTS wm_facts (
  id TEXT PRIMARY KEY,
  claim TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  confidence REAL NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT,
  fetched_at TEXT,
  verified_at TEXT,
  stale_after TEXT,
  goal_id TEXT,
  task_id TEXT,
  dedupe_key TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wm_facts_goal ON wm_facts(goal_id);
CREATE INDEX IF NOT EXISTS idx_wm_facts_status ON wm_facts(status);
CREATE INDEX IF NOT EXISTS idx_wm_facts_dedupe ON wm_facts(dedupe_key);

CREATE TABLE IF NOT EXISTS wm_links (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  rel TEXT NOT NULL,
  confidence REAL NOT NULL,
  provenance TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wm_links_from ON wm_links(from_id);
CREATE INDEX IF NOT EXISTS idx_wm_links_to ON wm_links(to_id);
