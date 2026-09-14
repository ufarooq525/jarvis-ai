import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface TypeIntoResult {
  ok: boolean;
  pid: number;
  hwnd?: number;
  process_running: boolean;
  window_title?: string;
  keystrokes_sent: boolean;
  text_readback_feasible: boolean;
  readback?: string;
  error?: string;
}

export type TypeIntoWindow = (
  pid: number,
  text: string,
  opts?: { launched_at?: string; process_names?: string[]; exclude_hwnds?: number[] },
) => TypeIntoResult;

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "scripts", "type-into-window.ps1");

function parseJson(stdout: string): Record<string, unknown> | null {
  const start = stdout.lastIndexOf("{");
  const end = stdout.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(stdout.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runScript(args: string[]): string {
  return execFileSync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", SCRIPT, ...args],
    {
      encoding: "utf8",
      timeout: 35_000,
      windowsHide: true,
    },
  );
}

/** Visible hwnds for allowlisted process names — used to detect a new Cursor window. */
export function listVisibleHwnds(processNames: string[]): number[] {
  if (process.platform !== "win32" || processNames.length === 0) return [];
  const names = processNames
    .map((n) => n.replace(/[^A-Za-z0-9]/g, ""))
    .filter((n) => n.length > 0);
  if (names.length === 0) return [];
  try {
    const stdout = runScript(["-ListHwndsOnly", "-ProcessNames", names.join(",")]);
    const parsed = parseJson(stdout);
    const hwnds = parsed?.hwnds;
    if (!Array.isArray(hwnds)) return [];
    return hwnds.map((h) => Number(h)).filter((h) => Number.isFinite(h) && h !== 0);
  } catch {
    return [];
  }
}

/** Live-only: type into the window of this pid or its successor allowlisted process. */
export function typeIntoWindowByPid(
  pid: number,
  text: string,
  opts?: { launched_at?: string; process_names?: string[]; exclude_hwnds?: number[] },
): TypeIntoResult {
  if (process.platform !== "win32") {
    return {
      ok: false,
      pid,
      process_running: false,
      keystrokes_sent: false,
      text_readback_feasible: false,
      error: "Live type_text is Windows-only",
    };
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    return {
      ok: false,
      pid,
      process_running: false,
      keystrokes_sent: false,
      text_readback_feasible: false,
      error: "Invalid pid — window cannot be identified",
    };
  }

  const dir = mkdtempSync(join(tmpdir(), "jarvis-type-"));
  const textFile = join(dir, "payload.txt");
  try {
    writeFileSync(textFile, text, "utf8");
    const extra: string[] = [];
    if (opts?.launched_at) extra.push("-LaunchedAt", opts.launched_at);
    if (opts?.process_names?.length) extra.push("-ProcessNames", opts.process_names.join(","));
    if (opts?.exclude_hwnds?.length) extra.push("-ExcludeHwnds", opts.exclude_hwnds.join(","));
    const stdout = runScript([
      "-TargetPid",
      String(pid),
      "-TextFile",
      textFile,
      ...extra,
    ]);
    const parsed = parseJson(stdout) as TypeIntoResult | null;
    if (!parsed) {
      return {
        ok: false,
        pid,
        process_running: false,
        keystrokes_sent: false,
        text_readback_feasible: false,
        error: "Unreadable type-into result",
      };
    }
    return {
      ...parsed,
      pid: parsed.pid ?? pid,
      keystrokes_sent: Boolean(parsed.ok && parsed.keystrokes_sent),
      process_running: Boolean(parsed.process_running),
      text_readback_feasible: Boolean(parsed.text_readback_feasible),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const parsed = parseJson(msg) as TypeIntoResult | null;
    if (parsed) return parsed;
    return {
      ok: false,
      pid,
      process_running: false,
      keystrokes_sent: false,
      text_readback_feasible: false,
      error: msg.slice(0, 240),
    };
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
