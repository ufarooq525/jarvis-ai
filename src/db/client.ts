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
}

/** Wipe all domain tables (tests / reset). Keeps schema. */
export function clearJarvisDb(db: JarvisDb): void {
  db.exec(`
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
