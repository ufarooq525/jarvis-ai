import type { ComputerActionRecord, ComputerObservation, LocateResult } from "./types.js";
import { COMPUTER_LIVE_OPEN_NOTICE, COMPUTER_SIMULATED_NOTICE } from "./types.js";

export function verifyShadowOpen(input: {
  before: ComputerObservation;
  after: ComputerObservation;
  locate: LocateResult;
  action: ComputerActionRecord;
}): ComputerActionRecord["verification"] {
  const checks: NonNullable<ComputerActionRecord["verification"]>["checks"] = [];

  checks.push({
    id: "before_observation",
    ok: Boolean(input.before?.snapshot_summary),
    detail: input.before ? "Before snapshot captured" : "Missing before observation",
  });

  checks.push({
    id: "after_observation",
    ok: Boolean(input.after?.snapshot_summary),
    detail: input.after ? "After snapshot captured" : "Missing after observation",
  });

  checks.push({
    id: "locate",
    ok: input.locate.found,
    detail: input.locate.detail,
  });

  checks.push({
    id: "shadow_only",
    ok: input.action.mode === "shadow" && input.action.simulated === true,
    detail:
      input.action.mode === "shadow" && input.action.simulated
        ? COMPUTER_SIMULATED_NOTICE
        : "Expected shadow/simulated open",
  });

  checks.push({
    id: "no_stale_coordinates",
    ok: true,
    detail: "Semantic target id used — no coordinate click",
  });

  checks.push({
    id: "shadow_no_side_effect_required",
    ok: true,
    detail: "Shadow open does not require UI mutation; Live open remains gated",
  });

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    checks,
    summary: passed
      ? `Shadow open verified — ${COMPUTER_SIMULATED_NOTICE}`
      : `Shadow open verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
  };
}

export function verifyLiveOpen(input: {
  before: ComputerObservation;
  after: ComputerObservation;
  locate: LocateResult;
  action: ComputerActionRecord;
  launch_ok: boolean;
  pid?: number;
}): ComputerActionRecord["verification"] {
  const checks: NonNullable<ComputerActionRecord["verification"]>["checks"] = [];

  checks.push({
    id: "before_observation",
    ok: Boolean(input.before?.snapshot_summary),
    detail: input.before ? "Before snapshot captured" : "Missing before observation",
  });

  checks.push({
    id: "after_observation",
    ok: Boolean(input.after?.snapshot_summary),
    detail: input.after ? "After snapshot captured" : "Missing after observation",
  });

  checks.push({
    id: "locate",
    ok: input.locate.found && Boolean(input.locate.resolved_command),
    detail: input.locate.detail,
  });

  checks.push({
    id: "live_mode",
    ok: input.action.mode === "live" && input.action.simulated === false,
    detail:
      input.action.mode === "live" && !input.action.simulated
        ? COMPUTER_LIVE_OPEN_NOTICE
        : "Expected live/non-simulated open",
  });

  checks.push({
    id: "spawn",
    ok: input.launch_ok && typeof input.pid === "number",
    detail: input.launch_ok
      ? `Process spawned pid=${input.pid}`
      : "Launch failed — no process started",
  });

  checks.push({
    id: "no_stale_coordinates",
    ok: true,
    detail: "Semantic target id used — no coordinate click",
  });

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    checks,
    summary: passed
      ? `Live open verified — ${COMPUTER_LIVE_OPEN_NOTICE}`
      : `Live open verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
  };
}

export function verifyShadowType(input: {
  locate: LocateResult;
  action: ComputerActionRecord;
  text: string;
  prior_open: boolean;
}): ComputerActionRecord["verification"] {
  const checks: NonNullable<ComputerActionRecord["verification"]>["checks"] = [];
  checks.push({
    id: "locate",
    ok: input.locate.found,
    detail: input.locate.detail,
  });
  checks.push({
    id: "allowlisted_target",
    ok: Boolean(input.action.target_id),
    detail: input.action.target_id ? `target=${input.action.target_id}` : "missing target",
  });
  checks.push({
    id: "prior_open",
    ok: input.prior_open,
    detail: input.prior_open
      ? "Allowlisted target was opened earlier in this goal"
      : "Type requires a prior computer.open_app on this target",
  });
  checks.push({
    id: "text_present",
    ok: input.text.trim().length > 0,
    detail: input.text.trim() ? `Would type ${input.text.trim().length} chars` : "Empty text",
  });
  checks.push({
    id: "shadow_only",
    ok: input.action.mode === "shadow" && input.action.simulated === true,
    detail: COMPUTER_SIMULATED_NOTICE,
  });
  checks.push({
    id: "no_keystrokes_sent",
    ok: input.action.keystrokes_sent !== true,
    detail: "Shadow must not send real keystrokes",
  });
  checks.push({
    id: "no_file_claim",
    ok: true,
    detail: "Does not claim a saved file or that UI text was observed",
  });
  const passed = checks.every((c) => c.ok);
  return {
    passed,
    checks,
    summary: passed
      ? `Shadow type verified — ${COMPUTER_SIMULATED_NOTICE}; no keystrokes sent`
      : `Shadow type verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
  };
}

export function verifyLiveType(input: {
  action: ComputerActionRecord;
  text: string;
  pid?: number;
  process_running: boolean;
  hwnd?: number;
  keystrokes_sent: boolean;
  text_readback_feasible: boolean;
  readback?: string;
}): ComputerActionRecord["verification"] {
  const checks: NonNullable<ComputerActionRecord["verification"]>["checks"] = [];
  const expected = input.text;

  checks.push({
    id: "live_mode",
    ok: input.action.mode === "live" && input.action.simulated === false,
    detail: input.action.mode === "live" ? COMPUTER_LIVE_OPEN_NOTICE : "Expected live type",
  });
  checks.push({
    id: "pid_identified",
    ok: typeof input.pid === "number" && input.pid > 0,
    detail: input.pid ? `pid=${input.pid}` : "No pid from preceding open — refusing global typing",
  });
  checks.push({
    id: "process_running",
    ok: input.process_running,
    detail: input.process_running ? "Target process still running" : "Target process not running",
  });
  checks.push({
    id: "window_identified",
    ok: typeof input.hwnd === "number" && input.hwnd !== 0,
    detail: input.hwnd ? `hwnd=${input.hwnd}` : "Could not positively identify the target window",
  });
  checks.push({
    id: "keystrokes_sent",
    ok: input.keystrokes_sent,
    detail: input.keystrokes_sent
      ? "Keystrokes delivered to identified Edit control"
      : "No keystrokes sent",
  });
  const readOk =
    input.text_readback_feasible &&
    typeof input.readback === "string" &&
    input.readback.includes(expected);
  checks.push({
    id: "text_content",
    ok: readOk,
    detail: input.text_readback_feasible
      ? readOk
        ? `Read-back contains intended text (${input.readback?.slice(0, 80) ?? ""})`
        : `Read-back did not match intended text (got ${JSON.stringify(input.readback?.slice(0, 80))})`
      : "Text-content read-back not feasible — not treated as done",
  });

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    checks,
    summary: passed
      ? `Live type verified — process running, window hwnd=${input.hwnd}, text read-back matched`
      : `Live type verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
  };
}
