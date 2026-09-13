import os from "node:os";
import { nowIso } from "../util/ids.js";

export interface BrowserSnapshot {
  at: string;
  plane: "shadow";
  act_enabled: false;
  fetch_enabled: true;
  host: {
    hostname: string;
    platform: string;
  };
  capabilities: {
    observe: true;
    allowlist: true;
    shadow_fetch: true;
    shadow_extract: true;
    shadow_research: true;
    click: false;
    type: false;
    scroll: false;
    publish: false;
    live_navigate: false;
  };
  note: string;
}

export function getBrowserSnapshot(): BrowserSnapshot {
  return {
    at: nowIso(),
    plane: "shadow",
    act_enabled: false,
    fetch_enabled: true,
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
    },
    capabilities: {
      observe: true,
      allowlist: true,
      shadow_fetch: true,
      shadow_extract: true,
      shadow_research: true,
      click: false,
      type: false,
      scroll: false,
      publish: false,
      live_navigate: false,
    },
    note: "Phase 6: SHADOW read-only allowlisted fetch + extract. Click/type/publish/scroll remain blocked.",
  };
}

export function browserActBlocked(action: string): never {
  throw new Error(
    `Browser act plane blocked (${action}) — use POST /v1/browser/shadow-research for read-only fetch; click/type/publish require later Live trust`,
  );
}
