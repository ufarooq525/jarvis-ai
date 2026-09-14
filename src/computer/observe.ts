import os from "node:os";
import { quarantineAdapterText } from "../world-model/quarantine.js";
import { nowIso } from "../util/ids.js";

/** Observe plane — never click, type, or shell from this module. */

export interface ComputerSnapshot {
  at: string;
  plane: "observe" | "shadow";
  act_enabled: false;
  live_open_enabled: true;
  host: {
    hostname: string;
    platform: string;
    arch: string;
    release: string;
  };
  resources: {
    cpu_count: number;
    freemem_mb: number;
    totalmem_mb: number;
    uptime_hours: number;
  };
  process: {
    node: string;
    pid: number;
    cwd_preview: string;
  };
  capabilities: {
    observe: true;
    locate: true;
    shadow_open: true;
    click: false;
    type: false;
    scroll: false;
    focus_window: false;
    live_open: true;
  };
  note: string;
}

export function getComputerSnapshot(): ComputerSnapshot {
  const cwd = process.cwd();
  const cwdSafe = quarantineAdapterText({
    source: "adapter.computer.cwd",
    text: cwd,
  }).safe_summary;

  return {
    at: nowIso(),
    plane: "shadow",
    act_enabled: false,
    live_open_enabled: true,
    host: {
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
      release: os.release(),
    },
    resources: {
      cpu_count: os.cpus().length,
      freemem_mb: Math.round(os.freemem() / (1024 * 1024)),
      totalmem_mb: Math.round(os.totalmem() / (1024 * 1024)),
      uptime_hours: Math.round((os.uptime() / 3600) * 10) / 10,
    },
    process: {
      node: process.version,
      pid: process.pid,
      cwd_preview: cwdSafe,
    },
    capabilities: {
      observe: true,
      locate: true,
      shadow_open: true,
      click: false,
      type: false,
      scroll: false,
      focus_window: false,
      live_open: true,
    },
    note: "Observe + locate + SHADOW open/type + gated LIVE open/type (type OPEN into the launched pid). Click/scroll/focus_window remain blocked.",
  };
}

export function computerActBlocked(action: string): never {
  throw new Error(
    `Computer act plane blocked (${action}) — use POST /v1/computer/shadow-open or /v1/computer/live-open; click/type require further sandbox work`,
  );
}
