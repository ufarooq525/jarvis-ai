import { classifyProposal } from "../policy/classify.js";
import { getEscalationStore } from "./store.js";
import { HUMAN_PRINCIPAL, JARVIS_PRINCIPAL, buildDelegationChain } from "../trust/principals.js";
import { newId, nowIso } from "../util/ids.js";
import type { GoalEngine } from "../goal-engine/engine.js";
import type { AgentRun, Goal, Task } from "../types/model.js";

/**
 * Demo Live-shaped start_run proposal without calling Umer OS.
 * Returns a pending escalation when policy requires approval / strong confirm / reject.
 */
export function createLiveApprovalDemo(engine: GoalEngine, input?: { title?: string; outcome?: string }) {
  const now = nowIso();
  const goalId = newId("goal");
  const title = input?.title?.trim() || "Demo Live OS start";
  const outcome = input?.outcome?.trim() || "Propose starting an OS agent run (demo — no OS call)";

  const goal: Goal = {
    id: goalId,
    title,
    outcome,
    domain: "ops",
    status: "blocked",
    priority: 1,
    trust_tier: "LIMITED",
    autonomy_ceiling: 0,
    mode: "live",
    key_results: [],
    owner_principal_id: HUMAN_PRINCIPAL,
    created_at: now,
    updated_at: now,
  };
  engine.store.saveGoal(goal);

  const task: Task = {
    id: newId("task"),
    parent_id: goalId,
    goal_id: goalId,
    title: "Propose OS start_run (Live demo)",
    intent: "live_write_demo",
    status: "waiting_approval",
    assignee_kind: "os_agent",
    tool_ids: ["os.runtime.start_run"],
    idempotency_key: `${goalId}:demo-start`,
  };
  engine.store.saveTask(task);

  const manifest = engine.tools.require("os.runtime.start_run");
  const verdict = classifyProposal({ goal, manifest, tool_id: manifest.tool_id });

  const decision_id = newId("dec");
  const run: AgentRun = {
    id: newId("run"),
    task_id: task.id,
    goal_id: goalId,
    decision_id,
    principal_id: JARVIS_PRINCIPAL,
    delegation_chain: buildDelegationChain("os.runtime"),
    mode: "live",
    policy_verdict_id: verdict.id,
    status: "proposed",
    tool_invocations: [],
  };
  engine.store.saveRun(run);

  engine.evidence.append({
    goal_id: goalId,
    run_id: run.id,
    kind: "policy_verdict",
    principal_id: JARVIS_PRINCIPAL,
    payload_summary: `${verdict.class}: ${verdict.reason}`,
    correlation: { decision_id },
  });

  engine.journal.append({
    id: decision_id,
    goal_id: goalId,
    decision: "propose_live_start_run",
    why: verdict.reason,
    alternatives: ["stay_shadow", "reject"],
    evidence_head: engine.evidence.head(goalId)!,
    confidence: 0.7,
    outcome: verdict.class === "reject" ? "do_not_act" : "escalate",
  });

  const escStore = getEscalationStore();
  let escalation = null;
  if (verdict.class === "approval_required" || verdict.class === "strong_confirmation") {
    escalation = escStore.create({
      goal_id: goalId,
      run_id: run.id,
      tool_id: manifest.tool_id,
      verdict_id: verdict.id,
      verdict_class: verdict.class,
      reason: verdict.reason,
      title: goal.title,
    });
  } else if (verdict.class === "reject") {
    escalation = escStore.create({
      goal_id: goalId,
      run_id: run.id,
      tool_id: manifest.tool_id,
      verdict_id: verdict.id,
      verdict_class: "reject",
      reason: verdict.reason,
      title: goal.title,
    });
    // Auto-mark as pending inform (still shows in inbox)
  }

  return { goal, task, run, verdict, escalation, manifest };
}
