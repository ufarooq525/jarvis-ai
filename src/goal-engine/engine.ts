import type { OsRuntimeAdapter } from "../contracts/index.js";
import type { AgentRun, Goal } from "../types/model.js";
import { EvidenceChain } from "../evidence/chain.js";
import { DecisionJournal } from "../journal/decision-journal.js";
import { MemoryStore } from "../store/memory-store.js";
import { ToolRegistry } from "../tools/registry.js";
import { HUMAN_PRINCIPAL, JARVIS_PRINCIPAL, defaultDomainTrustTier } from "../trust/principals.js";
import { newId, nowIso } from "../util/ids.js";
import { isKillSwitchEngaged } from "../kill-switch.js";
import { decomposeGoal } from "./decomposer.js";
import { DispatchBridge } from "./dispatch-bridge.js";
import { inspectState } from "./state-inspector.js";

export interface ShadowLoopResult {
  goal: Goal;
  decision_outcome: string;
  decision_id: string;
  evidence_json: string;
  runs: AgentRun[];
  message: string;
}

export interface GoalEngineDeps {
  store?: MemoryStore;
  evidence?: EvidenceChain;
  journal?: DecisionJournal;
}

/**
 * Goal Engine — depends ONLY on OsRuntimeAdapter contract + local stores.
 * Never imports Umer AI OS packages.
 */
export class GoalEngine {
  readonly store: MemoryStore;
  readonly evidence: EvidenceChain;
  readonly journal: DecisionJournal;
  readonly tools = new ToolRegistry();
  /** Exposed for tests / advanced callers; still adapter-bound only. */
  readonly bridge: DispatchBridge;

  constructor(
    private readonly adapter: OsRuntimeAdapter,
    deps: GoalEngineDeps = {},
  ) {
    this.store = deps.store ?? new MemoryStore();
    this.evidence = deps.evidence ?? new EvidenceChain();
    this.journal = deps.journal ?? new DecisionJournal();
    this.bridge = new DispatchBridge(this.store, adapter, this.tools, this.evidence);
  }

  /** §16: create goal → inspect → decompose → shadow dispatch → evidence → KR. */
  async runShadowLoop(input: {
    title: string;
    outcome: string;
    domain?: string;
  }): Promise<ShadowLoopResult> {
    const domain = input.domain ?? "general";
    const now = nowIso();
    const goalId = newId("goal");

    this.evidence.append({
      goal_id: goalId,
      kind: "stimulus",
      principal_id: HUMAN_PRINCIPAL,
      payload_summary: `User outcome: ${input.outcome}`,
    });

    await this.adapter.listCapabilities();
    const inspection = await inspectState(this.store, this.adapter, input.outcome, domain);

    if (inspection.duplicate_risk && inspection.overlapping_goals.length > 0) {
      const existing = inspection.overlapping_goals[0]!;
      const decision_id = newId("dec");
      this.evidence.append({
        goal_id: existing.id,
        kind: "decision",
        principal_id: JARVIS_PRINCIPAL,
        payload_summary: "do_not_act / merge — overlapping goal",
        correlation: { decision_id },
      });
      const head = this.evidence.head(existing.id)!;
      this.journal.append({
        id: decision_id,
        goal_id: existing.id,
        decision: "merge_into_existing",
        why: `Overlapping active goal ${existing.id}: ${existing.outcome}`,
        alternatives: ["act_anyway", "defer"],
        evidence_head: head,
        confidence: 0.9,
        outcome: "merge_into_existing",
      });

      return {
        goal: existing,
        decision_outcome: "merge_into_existing",
        decision_id,
        evidence_json: this.evidence.exportJson(existing.id),
        runs: [],
        message: `do_not_act: merged into existing goal ${existing.id}`,
      };
    }

    const goal: Goal = {
      id: goalId,
      title: input.title,
      outcome: input.outcome,
      domain,
      status: "active",
      priority: 1,
      trust_tier: defaultDomainTrustTier(),
      autonomy_ceiling: 1,
      mode: "shadow",
      key_results: [
        {
          id: newId("kr"),
          label: "Shadow plan produced with evidence",
          metric_ref: "evidence.chain.length",
          target: 1,
        },
      ],
      owner_principal_id: HUMAN_PRINCIPAL,
      created_at: now,
      updated_at: now,
    };
    this.store.saveGoal(goal);

    this.evidence.append({
      goal_id: goal.id,
      kind: "observation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `State OK; OS: ${inspection.os_summary}`,
    });

    const decision_id = newId("dec");
    const { tasks } = decomposeGoal(this.store, goal);

    this.evidence.append({
      goal_id: goal.id,
      kind: "decision",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `Decomposed into ${tasks.length} tasks (shadow)`,
      correlation: { decision_id },
    });

    const runs: AgentRun[] = [];
    for (const task of tasks) {
      const tool_id = task.tool_ids[0]!;
      const { run } = await this.bridge.dispatchTask({
        goal,
        task,
        decision_id,
        tool_id,
      });
      runs.push(run);
      task.status = "done";
      this.store.saveTask(task);
    }

    const kr = goal.key_results[0]!;
    kr.current = this.evidence.chainForGoal(goal.id).length;
    kr.last_measured_at = nowIso();
    this.evidence.append({
      goal_id: goal.id,
      kind: "metric",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `KR ${kr.label}=${kr.current} (target ${kr.target})`,
    });
    this.evidence.append({
      goal_id: goal.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `expected: shadow evidence; actual: ${runs.length} runs simulated/noop`,
    });

    goal.status = "done";
    goal.updated_at = nowIso();
    this.store.saveGoal(goal);

    const evidence_head = this.evidence.head(goal.id)!;
    this.journal.append({
      id: decision_id,
      goal_id: goal.id,
      decision: "shadow_loop_complete",
      why: "Phase-1 Shadow Loop — plan/simulate/journal only; no Live OS side effects",
      alternatives: ["do_not_act", "escalate_to_live"],
      evidence_head,
      expected: "shadow noop runs + evidence chain",
      actual: `${runs.length} runs; evidence nodes=${this.evidence.chainForGoal(goal.id).length}`,
      confidence: 0.85,
      outcome: "act",
    });

    return {
      goal,
      decision_outcome: "act",
      decision_id,
      evidence_json: this.evidence.exportJson(goal.id),
      runs,
      message: `Shadow loop complete for goal ${goal.id} via adapter=${this.adapter.name}`,
    };
  }

  /**
   * Phase E: human Strong-confirm → elevate this goal → Live startRun (fail closed).
   * Confirm phrase must be exactly "LIVE". Kill switch and SHADOW-without-confirm block.
   */
  async promoteToLive(input: {
    goalId: string;
    confirm: string;
    project_id?: string;
    approver?: string;
  }): Promise<{
    goal: Goal;
    decision_id: string;
    run: AgentRun;
    os_run_id?: string;
    message: string;
  }> {
    if (input.confirm.trim() !== "LIVE") {
      throw new Error('Strong confirm required — type LIVE exactly to authorize Live execution');
    }
    if (isKillSwitchEngaged()) {
      throw new Error("Kill switch engaged — Live promote blocked");
    }

    const goal = this.store.goals.get(input.goalId);
    if (!goal) throw new Error("goal not found");

    // Fail closed: without Strong-confirm path, SHADOW cannot Live.
    // Confirm authorizes elevating this goal only.
    goal.mode = "live";
    goal.trust_tier = "APPROVED";
    goal.autonomy_ceiling = 2;
    goal.status = "active";
    goal.updated_at = nowIso();
    this.store.saveGoal(goal);

    const decision_id = newId("dec");
    this.evidence.append({
      goal_id: goal.id,
      kind: "decision",
      principal_id: HUMAN_PRINCIPAL,
      payload_summary: "Human Strong-confirm LIVE — promote Shadow plan to Live startRun",
      correlation: { decision_id },
    });

    const tasks = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    let task = tasks.find((t) => t.tool_ids.includes("os.runtime.start_run"));
    if (!task) {
      const obj = [...this.store.objectives.values()].find((o) => o.goal_id === goal.id);
      task = {
        id: newId("task"),
        parent_id: obj?.id ?? goal.id,
        goal_id: goal.id,
        title: "Live OS agent run (approved)",
        intent: `Live advance: ${goal.outcome}`,
        status: "ready",
        assignee_kind: "os_agent",
        tool_ids: ["os.runtime.start_run"],
        idempotency_key: `${goal.id}:live:start_run`,
      };
      this.store.saveTask(task);
    } else {
      // Fresh Live idempotency key so Shadow sim run is not replayed.
      task = {
        ...task,
        idempotency_key: `${goal.id}:live:start_run`,
        status: "ready",
      };
      this.store.saveTask(task);
    }

    const { run, verdict, skipped } = await this.bridge.dispatchLiveApproved({
      goal,
      task,
      decision_id,
      tool_id: "os.runtime.start_run",
      project_id: input.project_id,
      approver: input.approver ?? HUMAN_PRINCIPAL,
    });

    if (skipped && !run.os_run_id) {
      throw new Error(skipped);
    }

    const head = this.evidence.head(goal.id)!;
    this.journal.append({
      id: decision_id,
      goal_id: goal.id,
      decision: "promote_to_live",
      why: `Human typed LIVE; verdict=${verdict.class}; adapter=${this.adapter.name}`,
      alternatives: ["stay_shadow", "reject"],
      evidence_head: head,
      expected: "OS plan accepted with os_run_id",
      actual: run.os_run_id
        ? `os_run_id=${run.os_run_id}; status=${run.status}`
        : `status=${run.status}; ${skipped ?? ""}`,
      confidence: 0.8,
      outcome: run.os_run_id ? "act" : "escalate",
    });

    return {
      goal,
      decision_id,
      run,
      os_run_id: run.os_run_id,
      message: run.os_run_id
        ? `Live dispatch accepted — os_run_id=${run.os_run_id}`
        : `Live promote recorded — ${skipped ?? run.status}`,
    };
  }
}
