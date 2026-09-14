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
import { BrowserRuntime } from "../browser/runtime.js";
import { ComputerRuntime } from "../computer/runtime.js";
import { CapabilityCatalog } from "../capabilities/catalog.js";
import { DecisionEngine } from "../decision/engine.js";
import { materializePlan } from "../decision/materialize.js";
import { buildOperatorReport } from "../decision/report.js";
import type { OperatorContext, OperatorDecision } from "../decision/types.js";
import { Orchestrator } from "../orchestrator/orchestrator.js";
import { countOpportunitiesForGoal } from "../ops/qualify-facts.js";
import { getFactStore } from "../world-model/fact-store.js";
import { ModelRouter, getModelRouter } from "../model-router/router.js";
import type { PdfBytesLoader, PdfTextExtractor } from "../knowledge/pdf.js";
import { isTerminalOsStatus } from "../contracts/os-runtime-adapter.js";
import {
  SHADOW_SIMULATED_NOTICE,
  verifyComputerTypeLoop,
  verifyLiveRun,
  verifyShadowLoop,
  type VerificationResult,
} from "./verifier.js";
import { isComputerTypeTaskSet } from "./computer-type.js";
import { COMPUTER_LIVE_OPEN_CONFIRM } from "../computer/types.js";
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
  operator_report?: ReturnType<typeof buildOperatorReport>;
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
  computer?: ComputerRuntime;
  modelRouter?: ModelRouter;
  pdf_loader?: PdfBytesLoader;
  pdf_extractor?: PdfTextExtractor;
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
  readonly computer: ComputerRuntime;
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
    const planner =
      deps.modelRouter ??
      (process.env.VITEST
        ? new ModelRouter(undefined, async () => ({
            ok: false,
            text: "",
            error: "vitest: planner disabled unless injected",
          }))
        : getModelRouter());
    this.decisionEngine = new DecisionEngine(planner);
    const browser = deps.browser ?? new BrowserRuntime({ evidence: this.evidence });
    this.computer = deps.computer ?? new ComputerRuntime({ evidence: this.evidence });
    this.orchestrator = new Orchestrator({
      store: this.store,
      evidence: this.evidence,
      tools: this.tools,
      bridge: this.bridge,
      browser,
      computer: this.computer,
      execution: this.execution,
      browser_fetch: this.execution.browser_fetch,
      pdf_loader: deps.pdf_loader,
      pdf_extractor: deps.pdf_extractor,
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
    let tasks: Task[];
    if (normalized.plan_kind === "computer_type") {
      ({ tasks } = decomposeGoal(this.store, goal, normalized));
      this.evidence.append({
        goal_id: goal.id,
        kind: "decision",
        principal_id: JARVIS_PRINCIPAL,
        payload_summary: `computer_type template (open ${normalized.computer_target_id ?? "notepad"} → type_text); not OS start_run`,
        correlation: { decision_id },
      });
    } else {
      const planned = await this.decisionEngine.planFromModel({
        outcome: normalized.outcome,
        capabilities: this.capabilities.list(),
        facts: getFactStore().listFacts({ status: "active" }).slice(0, 20),
        manifests: this.tools.list(),
      });
      if (planned.ok) {
        ({ tasks } = materializePlan(this.store, goal, planned.plan));
        this.evidence.append({
          goal_id: goal.id,
          kind: "decision",
          principal_id: JARVIS_PRINCIPAL,
          payload_summary: `Model plan: ${tasks.length} steps (${tasks.map((t) => t.tool_ids[0]).join(" → ")})`,
          correlation: { decision_id },
        });
      } else {
        ({ tasks } = decomposeGoal(this.store, goal, normalized));
        this.evidence.append({
          goal_id: goal.id,
          kind: "decision",
          principal_id: JARVIS_PRINCIPAL,
          payload_summary: `Fallback decomposer (${planned.reason}); ${tasks.length} tasks; plan_kind=${normalized.plan_kind}`,
          correlation: { decision_id },
        });
      }
    }

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
   * Human Strong-confirm → Live.
   * OS goals: type LIVE (Control API startRun).
   * computer_type (open allowlisted app → type_text): type OPEN — never substitutes OS start_run.
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
    if (isKillSwitchEngaged()) {
      throw new Error("Kill switch engaged — Live promote blocked");
    }

    const goal = this.store.goals.get(input.goalId);
    if (!goal) throw new Error("goal not found");

    const existingTasks = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    if (isComputerTypeTaskSet(existingTasks)) {
      return this.promoteComputerTypeLive(goal, existingTasks, input.confirm);
    }

    if (input.confirm.trim() !== "LIVE") {
      throw new Error('Strong confirm required — type LIVE exactly to authorize Live execution');
    }

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

    let timed_out = false;
    let os_status: string = run.status;
    if (run.os_run_id && this.adapter.subscribeRun) {
      const polled = await this.adapter.subscribeRun(
        run.os_run_id,
        (row) => {
          os_status = row.status;
        },
        {
          interval_ms: this.execution.live_poll_interval_ms,
          timeout_ms: this.execution.live_poll_timeout_ms,
        },
      );
      if (polled && isTerminalOsStatus(polled.status)) {
        os_status = polled.status;
        const mapped =
          polled.status === "succeeded" || polled.status === "simulated" || polled.status === "noop_shadow"
            ? "succeeded"
            : polled.status === "failed"
              ? "failed"
              : polled.status === "cancelled"
                ? "cancelled"
                : "running";
        run.status = mapped;
        this.store.saveRun(run);
        this.applyLiveRunOutcome(goal, run, polled.status, false);
      } else {
        timed_out = true;
        run.status = "running";
        this.store.saveRun(run);
        goal.status = "active";
        goal.updated_at = nowIso();
        this.store.saveGoal(goal);
      }
    }

    const liveVerify = verifyLiveRun({ os_status, timed_out });
    this.evidence.append({
      goal_id: goal.id,
      run_id: run.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `Live verify: ${liveVerify.summary}`,
      simulated: false,
      correlation: { decision_id, os_run_id: run.os_run_id },
    });

    const head = this.evidence.head(goal.id)!;
    this.journal.append({
      id: decision_id,
      goal_id: goal.id,
      decision: "promote_to_live",
      why: `Human typed LIVE; verdict=${verdict.class}; adapter=${this.adapter.name}`,
      alternatives: ["stay_shadow", "reject"],
      evidence_head: head,
      expected: "OS run reaches a terminal status (not merely plan accepted)",
      actual: run.os_run_id
        ? `os_run_id=${run.os_run_id}; os_status=${os_status}; timed_out=${timed_out}; goal=${goal.status}`
        : `status=${run.status}; ${skipped ?? ""}`,
      assumptions: [
        "Strong-confirm LIVE authorizes this goal only",
        "OsRuntimeAdapter is the sole Live write path",
        "Plan accepted is not outcome fulfillment",
      ],
      confidence: liveVerify.passed ? 0.8 : 0.4,
      verification_passed: liveVerify.passed,
      outcome: liveVerify.passed ? "act" : timed_out ? "defer" : "escalate",
    });

    const message = liveVerify.passed
      ? `Live run completed — os_run_id=${run.os_run_id}`
      : timed_out
        ? `Live run in progress (os_run_id=${run.os_run_id}) — plan accepted is not completion`
        : `Live run not complete — ${liveVerify.summary}`;

    return {
      goal,
      decision_id,
      run,
      os_run_id: run.os_run_id,
      message,
    };
  }

  private async promoteComputerTypeLive(
    goal: Goal,
    tasks: Task[],
    confirm: string,
  ): Promise<{
    goal: Goal;
    decision_id: string;
    run: AgentRun;
    os_run_id?: string;
    message: string;
  }> {
    if (confirm.trim() !== COMPUTER_LIVE_OPEN_CONFIRM) {
      throw new Error(
        "Strong confirm required — type OPEN exactly to launch the app and type into that window (not LIVE / OS start_run)",
      );
    }

    const prevMode = goal.mode;
    const prevTrust = goal.trust_tier;
    const prevAutonomy = goal.autonomy_ceiling;
    const prevStatus = goal.status;

    if (goal.status === "done" || goal.status === "blocked" || goal.status === "draft") {
      assertGoalTransition(goal.status, "active");
      goal.status = "active";
    }

    goal.mode = "live";
    goal.trust_tier = "AUTONOMOUS";
    goal.autonomy_ceiling = 3;
    goal.updated_at = nowIso();
    this.store.saveGoal(goal);

    const typeKr = goal.key_results.find((k) => k.metric_ref === "computer.type_verified");
    if (typeKr) {
      typeKr.current = 0;
      typeKr.last_measured_at = nowIso();
    }

    for (const task of tasks) {
      if (!task.tool_ids.some((id) => id === "computer.open_app" || id === "computer.type_text")) {
        continue;
      }
      task.status = "ready";
      task.idempotency_key = `${goal.id}:live:${task.tool_ids[0]}`;
      task.input = { ...(task.input ?? {}), confirm: COMPUTER_LIVE_OPEN_CONFIRM };
      this.store.saveTask(task);
    }

    const decision_id = newId("dec");
    this.evidence.append({
      goal_id: goal.id,
      kind: "decision",
      principal_id: HUMAN_PRINCIPAL,
      payload_summary:
        "Human Strong-confirm OPEN — Live computer.open_app then computer.type_text into that pid/hwnd (not OS start_run)",
      correlation: { decision_id },
    });

    const normalized = normalizeOutcome({ outcome: goal.outcome, domain: goal.domain });
    let runs: AgentRun[] = [];
    let decisions: OperatorDecision[] = [];
    try {
      const looped = await this.runOperatorLoop(goal, decision_id, normalized);
      runs = looped.runs;
      decisions = looped.decisions;
    } catch (e) {
      goal.mode = prevMode;
      goal.trust_tier = prevTrust;
      goal.autonomy_ceiling = prevAutonomy;
      goal.status = prevStatus;
      goal.updated_at = nowIso();
      this.store.saveGoal(goal);
      throw e;
    }

    const actions = this.computer.lastComputerActions(goal.id);
    const verification = verifyComputerTypeLoop({
      goal,
      tasks: [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id),
      runs,
      evidence: this.evidence.chainForGoal(goal.id),
      mode: "live",
      keystrokes_sent: this.computer.typeIntoCalls > 0,
      open: actions.open
        ? { ok: actions.open.ok, pid: actions.open.pid, target_id: actions.open.target_id }
        : undefined,
      typed: actions.type
        ? {
            ok: actions.type.ok,
            pid: actions.type.pid,
            hwnd: actions.type.hwnd,
            intended_text: actions.type.intended_text,
            readback: actions.type.readback,
            text_readback_feasible: actions.type.text_readback_feasible,
            keystrokes_sent: actions.type.keystrokes_sent,
            verification_passed: actions.type.verification?.passed,
            verification_summary: actions.type.verification?.summary,
          }
        : undefined,
    });

    this.evidence.append({
      goal_id: goal.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `Live computer verify: ${verification.summary}`,
      simulated: false,
      correlation: { decision_id },
    });

    if (verification.passed) {
      assertGoalTransition(goal.status, "done");
      goal.status = "done";
    } else {
      assertGoalTransition(goal.status, "blocked");
      goal.status = "blocked";
    }
    goal.updated_at = nowIso();

    const freshTasks = [...this.store.tasks.values()].filter((t) => t.goal_id === goal.id);
    const operator_report = buildOperatorReport({
      goal,
      tasks: freshTasks,
      runs,
      decisions,
      verification_summary: verification.summary,
      computer: actions,
    });
    goal.operator_report = operator_report;
    this.store.saveGoal(goal);

    const head = this.evidence.head(goal.id)!;
    this.journal.append({
      id: decision_id,
      goal_id: goal.id,
      decision: "promote_to_live_computer",
      why: `Human typed OPEN; computer open+type; verified=${verification.passed}`,
      alternatives: ["stay_shadow", "reject"],
      evidence_head: head,
      expected: "Identified target window exists, process running, typed text read back",
      actual: verification.summary,
      assumptions: [
        "OPEN authorizes this computer slice only — not OS start_run",
        "Keystrokes target the pid from the preceding open, not the foreground window",
      ],
      confidence: verification.passed ? 0.85 : 0.4,
      verification_passed: verification.passed,
      outcome: verification.passed ? "act" : "escalate",
    });

    const lastRun =
      [...runs].reverse().find((r) => r.tool_invocations.includes("computer.type_text")) ??
      runs[runs.length - 1];
    if (!lastRun) {
      throw new Error("Live computer promote produced no runs");
    }

    return {
      goal,
      decision_id,
      run: lastRun,
      message: operator_report.summary,
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
        this.applyLiveRunOutcome(goal, run, "failed", false);
      } else if (
        mapped === "succeeded" ||
        os_run.status === "simulated" ||
        os_run.status === "noop_shadow"
      ) {
        this.applyLiveRunOutcome(goal, run, os_run.status, false);
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

  /** Apply terminal OS status to the goal. Never treats plan-accept as done. */
  private applyLiveRunOutcome(
    goal: Goal,
    _run: AgentRun,
    os_status: string,
    timed_out: boolean,
  ): void {
    const verification = verifyLiveRun({ os_status, timed_out });
    if (os_status === "failed" || os_status === "cancelled") {
      if (goal.status === "active" || goal.status === "done") {
        if (goal.status === "done") {
          assertGoalTransition("done", "active");
          goal.status = "active";
        }
        assertGoalTransition("active", "blocked");
        goal.status = "blocked";
        goal.updated_at = nowIso();
        this.store.saveGoal(goal);
      }
      return;
    }
    if (verification.passed) {
      if (goal.status === "active" || goal.status === "blocked") {
        assertGoalTransition(goal.status, "done");
        goal.status = "done";
        goal.updated_at = nowIso();
        this.store.saveGoal(goal);
      }
    }
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
    const typeKr = goal.key_results.find((k) => k.metric_ref === "computer.type_verified");
    if (typeKr && typeof typeKr.current !== "number") {
      typeKr.current = 0;
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
      plan_source: goal.plan_source ?? "fallback",
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

    const verification =
      normalized.plan_kind === "computer_type"
        ? verifyComputerTypeLoop({
            goal,
            tasks,
            runs,
            evidence: this.evidence.chainForGoal(goal.id),
            mode: "shadow",
            keystrokes_sent: this.computer.typeIntoCalls > 0,
            open: this.computer.lastComputerActions(goal.id).open
              ? {
                  ok: this.computer.lastComputerActions(goal.id).open?.ok,
                  pid: this.computer.lastComputerActions(goal.id).open?.pid,
                  target_id: this.computer.lastComputerActions(goal.id).open?.target_id,
                }
              : undefined,
            typed: this.computer.lastComputerActions(goal.id).type
              ? {
                  ok: this.computer.lastComputerActions(goal.id).type?.ok,
                  pid: this.computer.lastComputerActions(goal.id).type?.pid,
                  hwnd: this.computer.lastComputerActions(goal.id).type?.hwnd,
                  intended_text: this.computer.lastComputerActions(goal.id).type?.intended_text,
                  readback: this.computer.lastComputerActions(goal.id).type?.readback,
                  text_readback_feasible:
                    this.computer.lastComputerActions(goal.id).type?.text_readback_feasible,
                  keystrokes_sent: this.computer.lastComputerActions(goal.id).type?.keystrokes_sent,
                  verification_passed:
                    this.computer.lastComputerActions(goal.id).type?.verification?.passed,
                  verification_summary:
                    this.computer.lastComputerActions(goal.id).type?.verification?.summary,
                }
              : undefined,
          })
        : verifyShadowLoop({
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

    const finalVerification: VerificationResult = passed
      ? verification
      : {
          ...verification,
          passed: false,
          summary: blockedByPartial
            ? `Shadow lifecycle incomplete — ${partialNote}`
            : verification.summary,
        };

    const operator_report = buildOperatorReport({
      goal,
      tasks,
      runs,
      decisions: decisions ?? [],
      verification_summary: finalVerification.summary,
      computer:
        normalized.plan_kind === "computer_type"
          ? this.computer.lastComputerActions(goal.id)
          : undefined,
    });
    goal.operator_report = operator_report;
    this.store.saveGoal(goal);

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
        ...(normalized.plan_kind === "computer_type"
          ? [
              "computer_type is a narrow open→type template, not OS start_run",
              "Shadow type_text must not send real keystrokes",
            ]
          : []),
      ],
      confidence: passed ? 0.85 : 0.4,
      verification_passed: passed,
      outcome: passed ? "act" : "escalate",
    });

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
      operator_report,
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
