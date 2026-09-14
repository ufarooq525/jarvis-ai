import type { AgentRun, EvidenceNode, Goal, Task } from "../types/model.js";

export const SHADOW_SIMULATED_NOTICE = "SIMULATED / No external action was performed";

export interface VerificationResult {
  passed: boolean;
  summary: string;
  checks: Array<{ id: string; ok: boolean; detail: string }>;
  simulated_notice: typeof SHADOW_SIMULATED_NOTICE;
}

/**
 * Independent Shadow-loop verifier — separate from dispatch/planning.
 * Confirms the lifecycle produced attributable evidence without Live side effects.
 */
export function verifyShadowLoop(input: {
  goal: Goal;
  tasks: Task[];
  runs: AgentRun[];
  evidence: EvidenceNode[];
}): VerificationResult {
  const checks: VerificationResult["checks"] = [];

  const hasStimulus = input.evidence.some((e) => e.kind === "stimulus");
  checks.push({
    id: "stimulus",
    ok: hasStimulus,
    detail: hasStimulus ? "User outcome recorded" : "Missing stimulus evidence",
  });

  const hasDecision = input.evidence.some((e) => e.kind === "decision");
  checks.push({
    id: "decision",
    ok: hasDecision,
    detail: hasDecision ? "Decision recorded" : "Missing decision evidence",
  });

  const hasPolicy = input.evidence.some((e) => e.kind === "policy_verdict");
  checks.push({
    id: "policy",
    ok: hasPolicy,
    detail: hasPolicy ? "Policy verdict(s) recorded" : "Missing policy verdict evidence",
  });

  const hasTasks = input.tasks.length > 0;
  checks.push({
    id: "tasks",
    ok: hasTasks,
    detail: hasTasks ? `${input.tasks.length} task(s)` : "No tasks decomposed",
  });

  const allShadow =
    input.runs.length === 0 || input.runs.every((r) => r.mode === "shadow");
  checks.push({
    id: "shadow_mode",
    ok: allShadow && input.goal.mode === "shadow",
    detail:
      allShadow && input.goal.mode === "shadow"
        ? "Goal and runs remain in shadow"
        : "Non-shadow mode detected in Shadow loop",
  });

  // Evaluate final task outcomes — prior failed attempts are OK if the task later succeeded.
  const openOrFailed = input.tasks.filter(
    (t) => t.status !== "done" && t.status !== "cancelled",
  );
  const anyFailed = input.tasks.some((t) => t.status === "failed");
  const allDone = input.tasks.length > 0 && input.tasks.every((t) => t.status === "done");
  const hasSimulatedWork = input.runs.some(
    (r) => r.status === "simulated" || r.status === "succeeded",
  );
  checks.push({
    id: "runs",
    ok: allDone && hasSimulatedWork && !anyFailed && openOrFailed.length === 0,
    detail: allDone && hasSimulatedWork
      ? `${input.tasks.length} task(s) done; ${input.runs.length} run attempt(s)`
      : anyFailed
        ? "One or more tasks remain failed"
        : "Expected all tasks done with at least one successful shadow/simulated run",
  });

  const hasSimEvidence = input.evidence.some(
    (e) => e.kind === "simulation" || e.kind === "tool_invocation",
  );
  checks.push({
    id: "simulation_evidence",
    ok: hasSimEvidence,
    detail: hasSimEvidence
      ? "Simulation / tool invocation evidence present"
      : "Missing simulation evidence",
  });

  const evidenceKr = input.goal.key_results.find((kr) => kr.metric_ref === "evidence.chain.length");
  const evidenceOk =
    evidenceKr != null &&
    typeof evidenceKr.current === "number" &&
    typeof evidenceKr.target === "number" &&
    evidenceKr.current >= evidenceKr.target;
  checks.push({
    id: "kr_evidence",
    ok: evidenceOk,
    detail: evidenceOk
      ? `Evidence KR met (${evidenceKr!.current}/${evidenceKr!.target})`
      : "Evidence key result not met",
  });

  for (const kr of input.goal.key_results) {
    if (kr.metric_ref === "evidence.chain.length") continue;
    const current = typeof kr.current === "number" ? kr.current : Number(kr.current ?? 0);
    const target = typeof kr.target === "number" ? kr.target : Number(kr.target);
    const ok = Number.isFinite(current) && Number.isFinite(target) && current >= target;
    checks.push({
      id: `kr_outcome:${kr.metric_ref}`,
      ok,
      detail: ok
        ? `Outcome KR ${kr.metric_ref} met (${current}/${target})`
        : `Outcome KR ${kr.metric_ref} unmet (${current}/${target}) — lifecycle is not outcome fulfillment`,
    });
  }

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    summary: passed
      ? `Shadow lifecycle verified — ${SHADOW_SIMULATED_NOTICE}`
      : `Shadow lifecycle verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
    checks,
    simulated_notice: SHADOW_SIMULATED_NOTICE,
  };
}

export function verifyLiveRun(input: {
  os_status: string | undefined;
  timed_out: boolean;
}): VerificationResult {
  const checks: VerificationResult["checks"] = [];
  const terminalSuccess =
    input.os_status === "succeeded" ||
    input.os_status === "simulated" ||
    input.os_status === "noop_shadow";
  const terminalFail = input.os_status === "failed" || input.os_status === "cancelled";

  checks.push({
    id: "not_plan_accept_only",
    ok: !input.timed_out && Boolean(input.os_status) && input.os_status !== "proposed",
    detail: input.timed_out
      ? "Poll timed out — plan accepted is not run completion"
      : `OS status=${input.os_status ?? "missing"}`,
  });
  checks.push({
    id: "terminal_success",
    ok: terminalSuccess && !input.timed_out,
    detail: terminalSuccess
      ? `Run reached terminal success (${input.os_status})`
      : terminalFail
        ? `Run terminal failure (${input.os_status})`
        : "Run not in a terminal success state",
  });

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    summary: passed
      ? `Live run completed (${input.os_status}) — this is run completion, not a business-outcome KR`
      : `Live outcome not verified: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
    checks,
    simulated_notice: SHADOW_SIMULATED_NOTICE,
  };
}

/**
 * Computer open → type_text: done only if window/process (Live) or simulated-no-keys (Shadow)
 * verification passed. Never treat dispatch confirmation as fulfillment.
 */
export function verifyComputerTypeLoop(input: {
  goal: Goal;
  tasks: Task[];
  runs: AgentRun[];
  evidence: EvidenceNode[];
  mode: "shadow" | "live";
  keystrokes_sent: boolean;
  open?: {
    ok?: boolean;
    pid?: number;
    target_id?: string;
  };
  typed?: {
    ok?: boolean;
    pid?: number;
    hwnd?: number;
    intended_text?: string;
    readback?: string;
    text_readback_feasible?: boolean;
    keystrokes_sent?: boolean;
    verification_passed?: boolean;
    verification_summary?: string;
  };
}): VerificationResult {
  const checks: VerificationResult["checks"] = [];
  const hasOpen = input.tasks.some((t) => t.tool_ids.includes("computer.open_app"));
  const hasType = input.tasks.some((t) => t.tool_ids.includes("computer.type_text"));
  const hasOsDispatch = input.tasks.some((t) => t.tool_ids.includes("os.runtime.start_run"));

  checks.push({
    id: "computer_template",
    ok: hasOpen && hasType && !hasOsDispatch,
    detail: hasOsDispatch
      ? "Wrong plan shape — os.runtime.start_run is not this computer slice"
      : hasOpen && hasType
        ? "Two-step computer.open_app → computer.type_text"
        : "Missing computer.open_app and/or computer.type_text",
  });

  const openDone = input.tasks
    .filter((t) => t.tool_ids.includes("computer.open_app"))
    .every((t) => t.status === "done");
  const typeTask = input.tasks.find((t) => t.tool_ids.includes("computer.type_text"));
  const typeDone = typeTask?.status === "done";

  checks.push({
    id: "open_app",
    ok: openDone && input.open?.ok !== false,
    detail: openDone
      ? `Opened ${input.open?.target_id ?? "target"}${input.mode === "live" && input.open?.pid ? ` pid=${input.open.pid}` : ""}`
      : "Open step not verified",
  });

  checks.push({
    id: "type_text",
    ok: Boolean(typeDone && input.typed?.verification_passed),
    detail: input.typed?.verification_summary
      ?? (typeDone ? "Type task done without a verification record" : "Type step not verified"),
  });

  if (input.mode === "shadow") {
    checks.push({
      id: "no_keystrokes_sent",
      ok: !input.keystrokes_sent && input.typed?.keystrokes_sent !== true,
      detail: input.keystrokes_sent
        ? "Shadow sent real keystrokes — fail closed"
        : "Shadow sent no keystrokes",
    });
  } else {
    checks.push({
      id: "process_window",
      ok: Boolean(input.typed?.pid && input.typed.hwnd),
      detail:
        input.typed?.pid && input.typed.hwnd
          ? `process pid=${input.typed.pid} window hwnd=${input.typed.hwnd}`
          : "Target process/window not identified after type",
    });
    checks.push({
      id: "text_content",
      ok: Boolean(
        input.typed?.text_readback_feasible &&
          input.typed.intended_text &&
          input.typed.readback?.includes(input.typed.intended_text),
      ),
      detail: input.typed?.text_readback_feasible
        ? input.typed.readback?.includes(input.typed.intended_text ?? "")
          ? `Read-back matched ${JSON.stringify(input.typed.intended_text)}`
          : `Read-back did not match intended text (got ${JSON.stringify(input.typed.readback?.slice(0, 80))})`
        : "Text-content read-back not feasible — not treated as done",
    });
  }

  const typeKr = input.goal.key_results.find((k) => k.metric_ref === "computer.type_verified");
  const krOk =
    typeKr != null &&
    Number(typeKr.current ?? 0) >= Number(typeKr.target);
  checks.push({
    id: "kr_computer_type",
    ok: krOk,
    detail: typeKr
      ? `computer.type_verified ${typeKr.current ?? 0}/${typeKr.target}`
      : "Missing computer.type_verified KR",
  });

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    summary: passed
      ? input.mode === "shadow"
        ? `Computer type Shadow verified — ${SHADOW_SIMULATED_NOTICE}; no keystrokes sent`
        : `Computer type Live verified — opened ${input.open?.target_id ?? "app"}, typed ${JSON.stringify(input.typed?.intended_text ?? "")}, observed pid=${input.typed?.pid} hwnd=${input.typed?.hwnd} read-back=${JSON.stringify(input.typed?.readback ?? "")}`
      : `Computer type verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
    checks,
    simulated_notice: SHADOW_SIMULATED_NOTICE,
  };
}
