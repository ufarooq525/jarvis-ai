/** Runtime connection overrides (Settings UI) — SQLite settings + env fallback. */

import type { AdapterKind } from "./config.js";
import { resolveAdapterKind, resolveControlApiBase } from "./config.js";
import { getSetting, setSetting, type JarvisDb } from "./db/client.js";

let adapterOverride: AdapterKind | null = null;
let controlApiBaseOverride: string | null = null;
let osProjectIdOverride: string | null = null;
let settingsDb: JarvisDb | null = null;
let persistEnabled = false;

export function bindConnectionDb(db: JarvisDb, dbPath: string): void {
  settingsDb = db;
  persistEnabled = dbPath !== ":memory:";
  const adapter = getSetting(db, "connection.adapter");
  const base = getSetting(db, "connection.control_api_base");
  const project = getSetting(db, "connection.project_id");
  if (adapter === "mock" || adapter === "umer-read") adapterOverride = adapter;
  if (base) controlApiBaseOverride = base.replace(/\/$/, "");
  if (project) osProjectIdOverride = project;
}

function persistKey(key: string, value: string | null): void {
  if (!settingsDb || !persistEnabled) return;
  if (value === null || value === "") {
    settingsDb.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return;
  }
  setSetting(settingsDb, key, value);
}

export function getActiveAdapterKind(): AdapterKind {
  return adapterOverride ?? resolveAdapterKind();
}

export function getControlApiBase(): string {
  return (controlApiBaseOverride ?? resolveControlApiBase()).replace(/\/$/, "");
}

export function getOsProjectId(): string | null {
  const fromOverride = osProjectIdOverride?.trim();
  if (fromOverride) return fromOverride;
  const fromEnv = process.env.JARVIS_OS_PROJECT_ID?.trim();
  return fromEnv || null;
}

export function getConnectionConfig() {
  return {
    adapter: getActiveAdapterKind(),
    control_api_base: getControlApiBase(),
    project_id: getOsProjectId(),
  };
}

export function setConnectionOverrides(input: {
  adapter?: AdapterKind | null;
  control_api_base?: string | null;
  project_id?: string | null;
}): void {
  if (input.adapter !== undefined) {
    adapterOverride = input.adapter;
    persistKey("connection.adapter", input.adapter);
  }
  if (input.control_api_base !== undefined) {
    const v = input.control_api_base?.trim();
    controlApiBaseOverride = v ? v.replace(/\/$/, "") : null;
    persistKey("connection.control_api_base", controlApiBaseOverride);
  }
  if (input.project_id !== undefined) {
    const v = input.project_id?.trim();
    osProjectIdOverride = v || null;
    persistKey("connection.project_id", osProjectIdOverride);
  }
}

export function resetConnectionOverrides(): void {
  adapterOverride = null;
  controlApiBaseOverride = null;
  osProjectIdOverride = null;
  settingsDb = null;
  persistEnabled = false;
}
