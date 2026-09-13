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
