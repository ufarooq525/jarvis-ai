import { spawn } from "node:child_process";

export type LaunchResult =
  | { ok: true; pid: number; command: string }
  | { ok: false; error: string };

/** Characters that imply shell/injection — never pass through. */
const UNSAFE = /[\r\n|&;<>^%$`!,?*[\]{}]/

const SAFE_ARG = /^--?[a-zA-Z0-9][a-zA-Z0-9-]*$/;

/**
 * Launch an allowlisted resolved command only (full path or PATH short name).
 * Never uses shell:true. Args must be an allowlisted flag list — never user text.
 */
export function launchAllowlisted(command: string, args: string[] = []): LaunchResult {
  const cmd = command.trim();
  if (!cmd || cmd.length > 512 || UNSAFE.test(cmd)) {
    return { ok: false, error: "Rejected unsafe or empty launch command" };
  }
  for (const a of args) {
    if (!a || a.length > 64 || UNSAFE.test(a) || !SAFE_ARG.test(a)) {
      return { ok: false, error: "Rejected unsafe launch argument" };
    }
  }

  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: false,
      shell: false,
    });
    child.unref();
    if (child.pid == null) {
      return { ok: false, error: "Spawn produced no pid" };
    }
    return { ok: true, pid: child.pid, command: cmd };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "spawn failed" };
  }
}

export type AppLauncher = (command: string, args?: string[]) => LaunchResult;
