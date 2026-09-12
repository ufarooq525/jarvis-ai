import os from "node:os";
import { quarantineAdapterText } from "../world-model/quarantine.js";
import { nowIso } from "../util/ids.js";

/** Observe plane only — never click, type, or shell. */

export interface ComputerSnapshot {
  at: string;
  plane: "observe";
  act_enabled: false;
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
    plane: "observe",
    act_enabled: false,
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
    note: "Observe-only. Click/type/shell act plane is disabled until sandbox + Approve.",
  };
}

export function computerActBlocked(action: string): never {
  throw new Error(
    `Computer act plane blocked (${action}) — Phase H is observe-only; sandbox + Approve required`,
  );
}
