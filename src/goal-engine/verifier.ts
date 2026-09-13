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
