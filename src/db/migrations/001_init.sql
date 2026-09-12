-- Phase C: durable JARVIS sidecar (goals, runs, evidence, journal)

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS objectives (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idempotency (
  key TEXT PRIMARY KEY,
  run_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS os_run_map (
  os_run_id TEXT PRIMARY KEY,
  jarvis_run_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_nodes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  goal_id TEXT NOT NULL,
  json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence_heads (
  goal_id TEXT PRIMARY KEY,
  tip_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS decision_records (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  goal_id TEXT,
  json TEXT NOT NULL
);
