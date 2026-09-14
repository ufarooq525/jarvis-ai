import type { OsRuntimeAdapter } from "../contracts/index.js";
import type { AgentRun, Goal, Task } from "../types/model.js";
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
import { normalizeOutcome, type NormalizedOutcome } from "./normalize.js";
import { assertGoalTransition, assertTaskTransition } from "./transitions.js";
import {
  SHADOW_SIMULATED_NOTICE,
  verifyShadowLoop,
  type VerificationResult,
} from "./verifier.js";
import {
  DEFAULT_SHADOW_EXECUTION,
  type ExecutionPolicy,
  isRetryableFailure,
  replanIdempotencyKey,
  retryIdempotencyKey,
  TimeoutError,
  withTimeout,
} from "./execution-policy.js";
import { quarantineAdapterText } from "../world-model/quarantine.js";
import { BrowserRuntime } from "../browser/runtime.js";
import { CapabilityCatalog } from "../capabilities/catalog.js";
import { DecisionEngine } from "../decision/engine.js";
import type { OperatorContext, OperatorDecision } from "../decision/types.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { countOpportunitiesForGoal } from "../ops/qualify-facts.js";
import { getFactStore } from "../world-model/fact-store.js";

export interface PartialCompletion {
  done: number;
  failed: number;
  cancelled: number;
  pending: number;
}

export interface ShadowLoopResult {
  goal: Goal;
  decision_outcome: string;
  decision_id: string;
  evidence_json: string;
  runs: AgentRun[];
  message: string;
  /** Always true for Shadow Loop — no external side effects. */
  simulated: true;
  simulated_notice: typeof SHADOW_SIMULATED_NOTICE;
  verification: VerificationResult;
  normalized: NormalizedOutcome;
  partial?: PartialCompletion;
  decisions?: OperatorDecision[];
}

export interface CancelGoalResult {
  goal: Goal;
  decision_id: string;
  cancelled_tasks: number;
  cancelled_runs: number;
  message: string;
}

export interface GoalEngineDeps {
  store?: MemoryStore;
  evidence?: EvidenceChain;
  journal?: DecisionJournal;
  execution?: Partial<ExecutionPolicy>;
  browser?: BrowserRuntime;
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
  readonly execution: ExecutionPolicy;
  readonly capabilities: CapabilityCatalog;
  readonly decisionEngine: DecisionEngine;
  readonly orchestrator: Orchestrator;
  private replanGeneration = new Map<string, number>();

  constructor(
    private readonly adapter: OsRuntimeAdapter,
    deps: GoalEngineDeps = {},
  ) {
    this.store = deps.store ?? new MemoryStore();
    this.evidence = deps.evidence ?? new EvidenceChain();
    this.journal = deps.journal ?? new DecisionJournal();
    this.bridge = new DispatchBridge(this.store, adapter, this.tools, this.evidence);
    this.execution = { ...DEFAULT_SHADOW_EXECUTION, ...deps.execution };
    this.capabilities = CapabilityCatalog.fromRegistry(this.tools);
    this.decisionEngine = new DecisionEngine();
    const browser = deps.browser ?? new BrowserRuntime({ evidence: this.evidence });
    this.orchestrator = new Orchestrator({
      store: this.store,
      evidence: this.evidence,
      tools: this.tools,
      bridge: this.bridge,
      browser,
      execution: this.execution,
      browser_fetch: this.execution.browser_fetch,
    });
  }

  /** §16 + Phase-1 harden: normalize → inspect → decompose → shadow dispatch → verify → KR. */
  async runShadowLoop(input: {
    title?: string;
    outcome: string;
    domain?: string;
  }): Promise<ShadowLoopResult> {
    const normalized = normalizeOutcome(input);
    const now = nowIso();
    const goalId = newId("goal");

    this.evidence.append({
      goal_id: goalId,
      kind: "stimulus",
      principal_id: HUMAN_PRINCIPAL,
      payload_summary: `User outcome: ${normalized.outcome}`,
    });

    await this.adapter.listCapabilities();
    const inspection = await inspectState(
      this.store,
      this.adapter,
      normalized.outcome,
      normalized.domain,
    );

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
        assumptions: [
          "Overlap detector token match implies duplicate intent",
          "Merging avoids duplicate Shadow work",
        ],
        confidence: 0.9,
        verification_passed: false,
        outcome: "merge_into_existing",
      });

      const emptyVerification: VerificationResult = {
        passed: false,
        summary: "Merged into existing goal — no new Shadow execution",
        checks: [],
        simulated_notice: SHADOW_SIMULATED_NOTICE,
      };

      return {
        goal: existing,
        decision_outcome: "merge_into_existing",
        decision_id,
        evidence_json: this.evidence.exportJson(existing.id),
        runs: [],
        message: `do_not_act: merged into existing goal ${existing.id} — ${SHADOW_SIMULATED_NOTICE}`,
        simulated: true,
        simulated_notice: SHADOW_SIMULATED_NOTICE,
        verification: emptyVerification,
        normalized,
      };
    }

    const goal: Goal = {
      id: goalId,
      title: normalized.title,
      outcome: normalized.outcome,
      domain: normalized.domain,
      status: "draft",
      priority: 1,
      trust_tier: defaultDomainTrustTier(),
      autonomy_ceiling: 1,
      mode: "shadow",
      key_results: normalized.key_results,
      owner_principal_id: HUMAN_PRINCIPAL,
      created_at: now,
      updated_at: now,
    };
    this.store.saveGoal(goal);
    assertGoalTransition(goal.status, "active");
    goal.status = "active";
    goal.updated_at = nowIso();
    this.store.saveGoal(goal);

    this.evidence.append({
      goal_id: goal.id,
      kind: "observation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `State OK; OS: ${
        quarantineAdapterText({
          source: "adapter.os_summary",
          text: inspection.os_summary,
          goal_id: goal.id,
        }).safe_summary
      }; normalized domain=${normalized.domain} plan_kind=${normalized.plan_kind}`,
    });

    const decision_id = newId("dec");
    const { tasks } = decomposeGoal(this.store, goal, normalized);

    this.evidence.append({
      goal_id: goal.id,
      kind: "decision",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `Decomposed into ${tasks.length} tasks (shadow); plan_kind=${normalized.plan_kind}`,
      correlation: { decision_id },
    });

    const { runs, partial, decisions } = await this.runOperatorLoop(
      goal,
      decision_id,
      normalized,
    );
    return this.finalizeShadowCycle({
      goal,
      tasks,
      runs,
      partial,
      decision_id,
      normalized,
      decisionLabel: "shadow_loop",
      decisions,
    });
  }

  /**
   * Replan after verified failure / blocked state: reopen failed tasks with new
   * idempotency keys, re-dispatch under Shadow policy, re-verify.
   */
  async replanGoal(goalId: string): Promise<ShadowLoopResult> {
    const goal = this.store.goals.get(goalId);
    if (!goal) throw new Error("goal not found");
    if (goal.status !== "blocked" && goal.status !== "active") {
      throw new Error(`Replan refused — goal status is ${goal.status} (need blocked or active)`);
    }
    if (goal.mode !== "shadow") {
      throw new Error("Replan currently supported for Shadow goals only");
    }

    const gen = (this.replanGeneration.get(goalId) ?? 0) + 1;
    this.replanGeneration.set(goalId, gen);

    if (goal.status === "blocked") {
      assertGoalTransition("blocked", "active");
      goal.status = "active";
      goal.updated_at = nowIso();
      this.store.saveGoal(goal);
    }

    const decision_id = newId("dec");
    this.evidence.append({
      goal_id: goal.id,
      kind: "decision",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `Replan generation ${gen} — retry failed/cancelled tasks`,
      correlation: { decision_id },
    });

    const allTasks = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    const toRetry = allTasks.filter((t) => t.status === "failed" || t.status === "cancelled");
    if (toRetry.length === 0) {
      throw new Error("Replan refused — no failed/cancelled tasks to retry");
    }

    for (const task of toRetry) {
      assertTaskTransition(task.status, "ready");
      task.status = "ready";
      task.idempotency_key = replanIdempotencyKey(task.idempotency_key, gen);
      this.store.clearIdempotency(task.idempotency_key);
      this.store.saveTask(task);
    }

    const { runs: _retried, decisions } = await this.runOperatorLoop(
      goal,
      decision_id,
      normalizeOutcome({
        outcome: goal.outcome,
        title: goal.title,
        domain: goal.domain,
      }),
    );
    void _retried;
    const tasksNow = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    const normalized = normalizeOutcome({
      outcome: goal.outcome,
      title: goal.title,
      domain: goal.domain,
    });

    return this.finalizeShadowCycle({
      goal,
      tasks: tasksNow,
      runs: [...this.store.runs.values()].filter((r) => r.goal_id === goal.id),
      partial: summarizeTasks(tasksNow),
      decision_id,
      normalized,
      decisionLabel: "replan",
      decisions,
    });
  }

  /** Cancel an active/blocked goal; cancel OS runs via adapter when present. */
  async cancelGoal(goalId: string, reason = "user cancel"): Promise<CancelGoalResult> {
    const goal = this.store.goals.get(goalId);
    if (!goal) throw new Error("goal not found");
    if (goal.status === "cancelled") {
      return {
        goal,
        decision_id: newId("dec"),
        cancelled_tasks: 0,
        cancelled_runs: 0,
        message: `Goal ${goalId} already cancelled`,
      };
    }
    if (goal.status === "done") {
      throw new Error("Cannot cancel a completed goal");
    }

    assertGoalTransition(goal.status, "cancelled");
    const decision_id = newId("dec");

    let cancelled_tasks = 0;
    let cancelled_runs = 0;

    const tasks = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    for (const task of tasks) {
      if (task.status === "done" || task.status === "cancelled") continue;
      assertTaskTransition(task.status, "cancelled");
      task.status = "cancelled";
      this.store.saveTask(task);
      cancelled_tasks += 1;
    }

    const runs = [...this.store.runs.values()].filter((r) => r.goal_id === goal.id);
    for (const run of runs) {
      if (run.status === "running" || run.status === "proposed" || run.status === "approved") {
        if (run.os_run_id) {
          try {
            await this.adapter.cancelRun(run.os_run_id);
          } catch {
            /* best-effort */
          }
        }
        run.status = "cancelled";
        this.store.saveRun(run);
        cancelled_runs += 1;
      }
    }

    goal.status = "cancelled";
    goal.updated_at = nowIso();
    this.store.saveGoal(goal);

    this.evidence.append({
      goal_id: goal.id,
      kind: "decision",
      principal_id: HUMAN_PRINCIPAL,
      payload_summary: `Goal cancelled: ${reason}`,
      correlation: { decision_id },
    });

    const head = this.evidence.head(goal.id)!;
    this.journal.append({
      id: decision_id,
      goal_id: goal.id,
      decision: "cancel_goal",
      why: reason,
      alternatives: ["replan", "keep_blocked"],
      evidence_head: head,
      confidence: 1,
      outcome: "do_not_act",
    });

    return {
      goal,
      decision_id,
      cancelled_tasks,
      cancelled_runs,
      message: `Cancelled goal ${goal.id} — tasks=${cancelled_tasks} runs=${cancelled_runs}`,
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

    const prevMode = goal.mode;
    const prevTrust = goal.trust_tier;
    const prevAutonomy = goal.autonomy_ceiling;
    const prevStatus = goal.status;

    if (goal.status === "done" || goal.status === "blocked" || goal.status === "draft") {
      assertGoalTransition(goal.status, "active");
      goal.status = "active";
    }

    goal.mode = "live";
    goal.trust_tier = "APPROVED";
    goal.autonomy_ceiling = 2;
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
      task = {
        ...task,
        idempotency_key: `${goal.id}:live:start_run`,
        status: "ready",
      };
      this.store.saveTask(task);
    }

    let run: AgentRun;
    let verdict: { id: string; class: string; reason: string };
    let skipped: string | undefined;
    try {
      const dispatched = await this.bridge.dispatchLiveApproved({
        goal,
        task,
        decision_id,
        tool_id: "os.runtime.start_run",
        project_id: input.project_id,
        approver: input.approver ?? process.env.JARVIS_OS_APPROVER?.trim() ?? "human.ceo",
      });
      run = dispatched.run;
      verdict = dispatched.verdict;
      skipped = dispatched.skipped;
    } catch (e) {
      goal.mode = prevMode;
      goal.trust_tier = prevTrust;
      goal.autonomy_ceiling = prevAutonomy;
      goal.status = prevStatus;
      goal.updated_at = nowIso();
      this.store.saveGoal(goal);
      const msg = e instanceof Error ? e.message : "Live dispatch failed";
      throw new Error(
        msg.includes("fetch failed") || /ECONNREFUSED|unreachable|Failed to fetch/i.test(msg)
          ? `Control API unreachable — start Umer OS (port 4000), then try LIVE again. (${msg})`
          : msg,
      );
    }

    if (skipped && !run.os_run_id) {
      goal.mode = prevMode;
      goal.trust_tier = prevTrust;
      goal.autonomy_ceiling = prevAutonomy;
      goal.status = prevStatus;
      goal.updated_at = nowIso();
      this.store.saveGoal(goal);
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
      assumptions: [
        "Strong-confirm LIVE authorizes this goal only",
        "OsRuntimeAdapter is the sole Live write path",
      ],
      confidence: 0.8,
      verification_passed: Boolean(run.os_run_id),
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

  /**
   * Phase 4: poll OS via adapter.getRun and sync status into the JARVIS run store.
   * Preserves evidence when OS reports failure.
   */
  async syncLiveRun(goalId: string): Promise<{
    goal: Goal;
    run: AgentRun | null;
    os_run: Awaited<ReturnType<OsRuntimeAdapter["getRun"]>>;
    updated: boolean;
    message: string;
  }> {
    const goal = this.store.goals.get(goalId);
    if (!goal) throw new Error("goal not found");

    const runs = [...this.store.runs.values()].filter((r) => r.goal_id === goalId && r.mode === "live");
    const run = runs[runs.length - 1] ?? null;
    if (!run?.os_run_id) {
      return {
        goal,
        run,
        os_run: null,
        updated: false,
        message: "No Live run with os_run_id to sync",
      };
    }

    const os_run = await this.adapter.getRun(run.os_run_id);
    if (!os_run) {
      return { goal, run, os_run: null, updated: false, message: "OS run not found" };
    }

    const prev = run.status;
    const mapped =
      os_run.status === "succeeded"
        ? "succeeded"
        : os_run.status === "failed"
          ? "failed"
          : os_run.status === "cancelled"
            ? "cancelled"
            : os_run.status === "running"
              ? "running"
              : run.status;

    let updated = false;
    if (mapped !== prev) {
      run.status = mapped as AgentRun["status"];
      this.store.saveRun(run);
      updated = true;
      this.evidence.append({
        goal_id: goal.id,
        run_id: run.id,
        task_id: run.task_id,
        kind: "observation",
        principal_id: JARVIS_PRINCIPAL,
        payload_summary: `OS status sync: ${prev} → ${mapped}; ${os_run.summary}`,
        simulated: false,
        correlation: {
          decision_id: run.decision_id,
          os_run_id: run.os_run_id,
          jarvis_task_id: run.task_id,
        },
      });
      if (mapped === "failed") {
        this.evidence.append({
          goal_id: goal.id,
          run_id: run.id,
          task_id: run.task_id,
          kind: "raw_result",
          principal_id: JARVIS_PRINCIPAL,
          payload_summary: `OS reported failure — evidence preserved: ${os_run.summary}`,
          simulated: false,
          correlation: {
            decision_id: run.decision_id,
            os_run_id: run.os_run_id,
          },
        });
        if (goal.status === "active") {
          assertGoalTransition("active", "blocked");
          goal.status = "blocked";
          goal.updated_at = nowIso();
          this.store.saveGoal(goal);
        }
      }
    }

    return {
      goal,
      run,
      os_run,
      updated,
      message: updated
        ? `Synced Live run ${run.id}: ${prev} → ${mapped}`
        : `Live run ${run.id} unchanged (${mapped})`,
    };
  }

  /**
   * Canonical operator loop: Decision → Policy (inside orchestrator/bridge) → runtime.
   */
  private async runOperatorLoop(
    goal: Goal,
    decision_id: string,
    normalized: NormalizedOutcome,
  ): Promise<{ runs: AgentRun[]; partial: PartialCompletion; decisions: OperatorDecision[] }> {
    const decisions: OperatorDecision[] = [];
    const maxSteps = 10;

    for (let step = 0; step < maxSteps; step++) {
      const fresh = this.store.goals.get(goal.id);
      if (fresh?.status === "cancelled") break;

      const ctx = this.buildOperatorContext(goal, normalized, decisions);
      const next = this.decisionEngine.decideNext(ctx);
      decisions.push(next);

      this.evidence.append({
        goal_id: goal.id,
        kind: "decision",
        principal_id: JARVIS_PRINCIPAL,
        payload_summary: `operator ${next.decision}: ${next.reason}${
          next.selected_capability ? `; capability=${next.selected_capability}` : ""
        }`,
        correlation: {
          decision_id,
          tool_id: next.selected_capability,
          jarvis_task_id: next.task_id,
        },
      });

      if (next.decision !== "execute") break;

      const task = next.task_id ? this.store.tasks.get(next.task_id) : undefined;
      await this.orchestrator.execute({
        goal,
        task,
        decision: next,
        decision_id,
        normalized,
      });
    }

    const tasksNow = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    const runs = [...this.store.runs.values()].filter((r) => r.goal_id === goal.id);
    return { runs, partial: summarizeTasks(tasksNow), decisions };
  }

  private buildOperatorContext(
    goal: Goal,
    normalized: NormalizedOutcome,
    previous: OperatorDecision[],
  ): OperatorContext {
    const tasks = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    const runs = [...this.store.runs.values()].filter((r) => r.goal_id === goal.id);
    const facts = getFactStore().listFacts({ goal_id: goal.id });
    const opportunity_count = countOpportunitiesForGoal(goal.id);
    const researchKr = goal.key_results.find((k) => k.metric_ref === "research.opportunity_count");
    if (researchKr) {
      researchKr.current = opportunity_count;
      researchKr.last_measured_at = nowIso();
    }
    return {
      goal,
      objectives: [...this.store.objectives.values()].filter((o) => o.goal_id === goal.id),
      tasks,
      runs,
      evidence: this.evidence.chainForGoal(goal.id),
      facts,
      opportunity_count,
      capabilities: this.capabilities.list(),
      previous_decisions: previous,
      journal: this.journal.byGoal(goal.id),
      normalized,
      attempted_capability_ids: runs.flatMap((r) => r.tool_invocations),
    };
  }

  /** Dispatch tasks with per-task timeout + retry; continue on failure for partial completion. */
  private async dispatchTasksWithPolicy(
    goal: Goal,
    tasks: Task[],
    decision_id: string,
  ): Promise<{ runs: AgentRun[]; partial: PartialCompletion }> {
    const runs: AgentRun[] = [];
    let done = 0;
    let failed = 0;
    let cancelled = 0;

    for (const task of tasks) {
      // Goal may have been cancelled mid-loop (tests / concurrent cancel).
      const fresh = this.store.goals.get(goal.id);
      if (fresh?.status === "cancelled") {
        if (task.status === "ready" || task.status === "running") {
          assertTaskTransition(task.status, "cancelled");
          task.status = "cancelled";
          this.store.saveTask(task);
          cancelled += 1;
        }
        continue;
      }

      const result = await this.dispatchOneTaskWithRetries(goal, task, decision_id);
      runs.push(...result.attempts);

      if (result.ok) {
        done += 1;
      } else if (result.finalStatus === "cancelled") {
        cancelled += 1;
      } else {
        failed += 1;
      }
    }

    return {
      runs,
      partial: { done, failed, cancelled, pending: 0 },
    };
  }

  private async dispatchOneTaskWithRetries(
    goal: Goal,
    task: Task,
    decision_id: string,
  ): Promise<{ ok: boolean; finalStatus: Task["status"]; attempts: AgentRun[] }> {
    const attempts: AgentRun[] = [];
    const max = this.execution.max_attempts;
    const rootKey = task.idempotency_key;

    for (let attempt = 1; attempt <= max; attempt++) {
      if (task.status === "failed" || task.status === "ready") {
        if (task.status === "failed") {
          assertTaskTransition("failed", "ready");
          task.status = "ready";
        }
      }

      task.idempotency_key = retryIdempotencyKey(rootKey, attempt);
      this.store.saveTask(task);

      assertTaskTransition(task.status, "running");
      task.status = "running";
      this.store.saveTask(task);

      const tool_id = task.tool_ids[0]!;
      try {
        const { run, skipped } = await withTimeout(
          this.bridge.dispatchTask({ goal, task, decision_id, tool_id }),
          this.execution.timeout_ms,
          `task ${task.id} attempt ${attempt}`,
        );
        attempts.push(run);

        if (run.status === "cancelled") {
          assertTaskTransition("running", "cancelled");
          task.status = "cancelled";
          this.store.saveTask(task);
          return { ok: false, finalStatus: "cancelled", attempts };
        }

        if (run.status === "failed" || skipped) {
          assertTaskTransition("running", "failed");
          task.status = "failed";
          this.store.saveTask(task);

          const retryable = Boolean(skipped && isRetryableFailure(new Error(skipped)));
          if (retryable && attempt < max) {
            this.evidence.append({
              goal_id: goal.id,
              run_id: run.id,
              kind: "observation",
              principal_id: JARVIS_PRINCIPAL,
              payload_summary: `Retry ${attempt}/${max} after failure: ${skipped}`,
              correlation: { decision_id },
            });
            continue;
          }
          return { ok: false, finalStatus: "failed", attempts };
        }

        assertTaskTransition("running", "done");
        task.status = "done";
        this.store.saveTask(task);
        return { ok: true, finalStatus: "done", attempts };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const run: AgentRun = {
          id: newId("run"),
          task_id: task.id,
          goal_id: goal.id,
          decision_id,
          principal_id: JARVIS_PRINCIPAL,
          delegation_chain: [HUMAN_PRINCIPAL, JARVIS_PRINCIPAL],
          mode: goal.mode,
          policy_verdict_id: newId("verdict"),
          status: "failed",
          tool_invocations: [tool_id],
        };
        this.store.saveRun(run);
        attempts.push(run);
        this.evidence.append({
          goal_id: goal.id,
          run_id: run.id,
          kind: "raw_result",
          principal_id: JARVIS_PRINCIPAL,
          payload_summary: e instanceof TimeoutError ? `timeout: ${msg}` : `dispatch error: ${msg}`,
          correlation: { decision_id },
        });

        assertTaskTransition("running", "failed");
        task.status = "failed";
        this.store.saveTask(task);

        if (isRetryableFailure(e) && attempt < max) {
          this.evidence.append({
            goal_id: goal.id,
            kind: "observation",
            principal_id: JARVIS_PRINCIPAL,
            payload_summary: `Retry ${attempt}/${max} after ${e instanceof TimeoutError ? "timeout" : "error"}`,
            correlation: { decision_id },
          });
          continue;
        }
        return { ok: false, finalStatus: "failed", attempts };
      }
    }

    return { ok: false, finalStatus: "failed", attempts };
  }

  private finalizeShadowCycle(input: {
    goal: Goal;
    tasks: Task[];
    runs: AgentRun[];
    partial: PartialCompletion;
    decision_id: string;
    normalized: NormalizedOutcome;
    decisionLabel: "shadow_loop" | "replan";
    decisions?: OperatorDecision[];
  }): ShadowLoopResult {
    const { goal, tasks, runs, partial, decision_id, normalized, decisionLabel, decisions } = input;

    const kr = goal.key_results.find((k) => k.metric_ref === "evidence.chain.length")!;
    kr.current = this.evidence.chainForGoal(goal.id).length;
    kr.last_measured_at = nowIso();

    const researchKr = goal.key_results.find((k) => k.metric_ref === "research.opportunity_count");
    if (researchKr) {
      researchKr.current = countOpportunitiesForGoal(goal.id);
      researchKr.last_measured_at = nowIso();
    }

    const partialNote =
      partial.failed > 0 || partial.cancelled > 0
        ? `partial completion: done=${partial.done} failed=${partial.failed} cancelled=${partial.cancelled}`
        : `complete: done=${partial.done}`;

    this.evidence.append({
      goal_id: goal.id,
      kind: "metric",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `KR ${kr.label}=${kr.current} (target ${kr.target}); ${partialNote}`,
    });
    this.evidence.append({
      goal_id: goal.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `expected: shadow evidence; actual: ${runs.length} runs; ${partialNote}; ${SHADOW_SIMULATED_NOTICE}`,
    });

    // Refresh KR after metric nodes for verifier.
    kr.current = this.evidence.chainForGoal(goal.id).length;

    const verification = verifyShadowLoop({
      goal,
      tasks,
      runs,
      evidence: this.evidence.chainForGoal(goal.id),
    });

    // Partial failure always fails verification / blocks goal.
    const blockedByPartial = partial.failed > 0 || partial.cancelled > 0;
    const passed = verification.passed && !blockedByPartial;

    this.evidence.append({
      goal_id: goal.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `verification: ${passed ? "passed" : "failed"} — ${
        blockedByPartial ? partialNote + "; " : ""
      }${verification.summary}`,
      simulated: true,
      correlation: { decision_id },
    });

    if (goal.status !== "cancelled") {
      if (!passed) {
        if (goal.status === "done") {
          assertGoalTransition("done", "active");
          goal.status = "active";
        }
        if (goal.status === "active") {
          assertGoalTransition("active", "blocked");
          goal.status = "blocked";
        }
        // already blocked → stay blocked
      } else if (goal.status === "blocked") {
        assertGoalTransition("blocked", "done");
        goal.status = "done";
      } else {
        assertGoalTransition(goal.status, "done");
        goal.status = "done";
      }
      goal.updated_at = nowIso();
      this.store.saveGoal(goal);
    }

    const evidence_head = this.evidence.head(goal.id)!;
    this.journal.append({
      id: decision_id,
      goal_id: goal.id,
      decision: passed
        ? `${decisionLabel}_complete`
        : `${decisionLabel}_incomplete`,
      why: passed
        ? "Phase-1 Shadow Loop — plan/simulate/verify/journal only; no Live OS side effects"
        : `Shadow ${decisionLabel} incomplete: ${blockedByPartial ? partialNote : verification.summary}`,
      alternatives: ["do_not_act", "escalate_to_live", "replan", "cancel"],
      evidence_head,
      expected: "shadow noop runs + evidence chain + verification pass",
      actual: `${runs.length} runs; evidence nodes=${this.evidence.chainForGoal(goal.id).length}; verified=${passed}; ${partialNote}`,
      assumptions: [
        "Mock/Umer shadow startRun does not write to Control API",
        "Evidence chain length is a valid KR for Shadow plan completeness",
        ...(normalized.plan_kind === "research"
          ? [
              "Research opportunity count is measured from qualifying observations only",
              "Allowlisted/simulated research is not fabricated into opportunities",
            ]
          : []),
      ],
      confidence: passed ? 0.85 : 0.4,
      verification_passed: passed,
      outcome: passed ? "act" : "escalate",
    });

    const finalVerification: VerificationResult = passed
      ? verification
      : {
          ...verification,
          passed: false,
          summary: blockedByPartial
            ? `Shadow lifecycle incomplete — ${partialNote}`
            : verification.summary,
        };

    return {
      goal,
      decision_outcome: passed ? "act" : "escalate",
      decision_id,
      evidence_json: this.evidence.exportJson(goal.id),
      runs,
      message: passed
        ? `Shadow loop complete for goal ${goal.id} via adapter=${this.adapter.name} — ${SHADOW_SIMULATED_NOTICE}`
        : `Shadow loop incomplete for goal ${goal.id}: ${finalVerification.summary}`,
      simulated: true,
      simulated_notice: SHADOW_SIMULATED_NOTICE,
      verification: finalVerification,
      normalized,
      partial,
      decisions,
    };
  }
}

function summarizeTasks(tasks: Task[]): PartialCompletion {
  return {
    done: tasks.filter((t) => t.status === "done").length,
    failed: tasks.filter((t) => t.status === "failed").length,
    cancelled: tasks.filter((t) => t.status === "cancelled").length,
    pending: tasks.filter((t) =>
      t.status === "ready" || t.status === "running" || t.status === "pending" || t.status === "waiting_approval",
    ).length,
  };
}
