import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

type DatabaseSyncCtor = typeof import("node:sqlite").DatabaseSync;
type DatabaseSyncInstance = InstanceType<DatabaseSyncCtor>;

export type JarvisDb = DatabaseSyncInstance;

function DatabaseSync(): DatabaseSyncCtor {
  const builtins = process as NodeJS.Process & {
    getBuiltinModule?: (id: string) => { DatabaseSync: DatabaseSyncCtor };
  };
  if (typeof builtins.getBuiltinModule !== "function") {
    throw new Error("node:sqlite requires Node.js 22.5+ (process.getBuiltinModule)");
  }
  const mod = builtins.getBuiltinModule("node:sqlite") ?? builtins.getBuiltinModule("sqlite");
  if (!mod?.DatabaseSync) {
    throw new Error("node:sqlite DatabaseSync unavailable — upgrade Node.js");
  }
  return mod.DatabaseSync;
}

/** Resolve DB path: env override, :memory: under Vitest, else data/jarvis.sqlite. */
export function resolveJarvisDbPath(): string {
  if (process.env.JARVIS_DB_PATH) return process.env.JARVIS_DB_PATH;
  if (process.env.VITEST) return ":memory:";
  return join(process.cwd(), "data", "jarvis.sqlite");
}

export function openJarvisDb(path = resolveJarvisDbPath()): JarvisDb {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new (DatabaseSync())(path);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  migrate(db);
  return db;
}

function migrate(db: JarvisDb): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_migrations").get() as
    | { v: number | null }
    | undefined;
  const current = row?.v ?? 0;

  if (current < 1) {
    const sql = readFileSync(join(HERE, "migrations", "001_init.sql"), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      1,
      new Date().toISOString(),
    );
  }
  if (current < 2) {
    const sql = readFileSync(join(HERE, "migrations", "002_settings.sql"), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      2,
      new Date().toISOString(),
    );
  }
  if (current < 3) {
    const sql = readFileSync(join(HERE, "migrations", "003_escalations.sql"), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      3,
      new Date().toISOString(),
    );
  }
  if (current < 4) {
    const sql = readFileSync(join(HERE, "migrations", "004_world_model.sql"), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      4,
      new Date().toISOString(),
    );
  }
  if (current < 5) {
    const sql = readFileSync(join(HERE, "migrations", "005_skills.sql"), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      5,
      new Date().toISOString(),
    );
  }
  if (current < 6) {
    const sql = readFileSync(join(HERE, "migrations", "006_ops.sql"), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      6,
      new Date().toISOString(),
    );
  }
}

export function getSetting(db: JarvisDb, key: string): string | null {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

export function setSetting(db: JarvisDb, key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

/** Wipe all domain tables (tests / reset). Keeps schema + settings. */
export function clearJarvisDb(db: JarvisDb): void {
  db.exec(`
    DELETE FROM opportunities;
    DELETE FROM skills;
    DELETE FROM wm_links;
    DELETE FROM wm_facts;
    DELETE FROM escalations;
    DELETE FROM decision_records;
    DELETE FROM evidence_heads;
    DELETE FROM evidence_nodes;
    DELETE FROM os_run_map;
    DELETE FROM idempotency;
    DELETE FROM runs;
    DELETE FROM tasks;
    DELETE FROM objectives;
    DELETE FROM goals;
  `);
}
