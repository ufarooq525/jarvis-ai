import { accessSync, constants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import type { AppTarget, ComputerTargetId, LocateResult } from "./types.js";

export const APP_TARGETS: AppTarget[] = [
  {
    id: "vscode",
    display_name: "VS Code",
    aliases: ["code", "visual studio code", "vscode"],
    windows_commands: [
      "code",
      path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
      path.join(process.env.ProgramFiles ?? "", "Microsoft VS Code", "Code.exe"),
    ],
  },
  {
    id: "browser",
    display_name: "Browser (Edge/Chrome)",
    aliases: ["edge", "chrome", "browser", "msedge"],
    windows_commands: [
      "msedge",
      "chrome",
      path.join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft", "Edge", "Application", "msedge.exe"),
      path.join(process.env.ProgramFiles ?? "", "Google", "Chrome", "Application", "chrome.exe"),
    ],
  },
  {
    id: "terminal",
    display_name: "Terminal",
    aliases: ["wt", "windows terminal", "cmd", "powershell"],
    windows_commands: ["wt", "powershell", "cmd"],
  },
  {
    id: "file_manager",
    display_name: "File manager",
    aliases: ["explorer", "files", "file manager"],
    windows_commands: ["explorer"],
  },
  {
    id: "notepad",
    display_name: "Notepad",
    aliases: ["notepad"],
    windows_commands: ["notepad"],
  },
];

function pathExists(p: string): boolean {
  if (!p || p.includes("\0")) return false;
  try {
    accessSync(p, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function whichCommand(cmd: string): string | undefined {
  if (!cmd || cmd.includes("\\") || cmd.includes("/")) return undefined;
  try {
    const out = execFileSync("where.exe", [cmd], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 3_000,
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find(Boolean);
    return out && pathExists(out) ? out : out;
  } catch {
    return undefined;
  }
}

/** Read-only locate — does not launch anything. */
export function locateTarget(target_id: ComputerTargetId): LocateResult {
  const target = APP_TARGETS.find((t) => t.id === target_id);
  if (!target) {
    return {
      target_id,
      found: false,
      method: "not_found",
      detail: `Unknown target ${target_id}`,
    };
  }

  if (target_id === "file_manager" || target_id === "notepad" || target_id === "terminal") {
    const builtin = target.windows_commands[0]!;
    const resolved = whichCommand(builtin) ?? builtin;
    return {
      target_id,
      found: true,
      resolved_command: resolved,
      method: target_id === "file_manager" || target_id === "notepad" ? "builtin" : "which",
      detail: `Resolved ${target.display_name} → ${resolved}`,
    };
  }

  for (const candidate of target.windows_commands) {
    if (candidate.includes("\\") || candidate.includes("/")) {
      if (pathExists(candidate)) {
        return {
          target_id,
          found: true,
          resolved_command: candidate,
          method: "path_probe",
          detail: `Found ${target.display_name} at ${candidate}`,
        };
      }
    } else {
      const resolved = whichCommand(candidate);
      if (resolved) {
        return {
          target_id,
          found: true,
          resolved_command: resolved,
          method: "which",
          detail: `Found ${target.display_name} via PATH (${candidate})`,
        };
      }
    }
  }

  return {
    target_id,
    found: false,
    method: "not_found",
    detail: `${target.display_name} not found on this host (observe-only locate)`,
  };
}

export function listTargets(): Array<AppTarget & { locate: LocateResult }> {
  return APP_TARGETS.map((t) => ({ ...t, locate: locateTarget(t.id) }));
}

export function resolveTargetId(input: string): ComputerTargetId | undefined {
  const needle = input.trim().toLowerCase();
  for (const t of APP_TARGETS) {
    if (t.id === needle || t.aliases.some((a) => a === needle || needle.includes(a))) {
      return t.id;
    }
  }
  return undefined;
}
