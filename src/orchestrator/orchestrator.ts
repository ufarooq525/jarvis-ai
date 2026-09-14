import type { BrowserRuntime } from "../browser/runtime.js";
import type { ComputerRuntime } from "../computer/runtime.js";
import { COMPUTER_LIVE_OPEN_CONFIRM } from "../computer/types.js";
import { resolveTargetId } from "../computer/targets.js";
import type { ResearchFact } from "../browser/types.js";
import type { DispatchBridge } from "../goal-engine/dispatch-bridge.js";
import type { ExecutionPolicy } from "../goal-engine/execution-policy.js";
import type { NormalizedOutcome } from "../goal-engine/normalize.js";
import {
  TimeoutError,
  isRetryableFailure,
  retryIdempotencyKey,
  withTimeout,
} from "../goal-engine/execution-policy.js";
import { assertTaskTransition } from "../goal-engine/transitions.js";
import { recordObservation } from "../observation/record.js";
import { isQualifyingOpportunityFact } from "../ops/qualify-facts.js";
import { createOpportunityFromFacts } from "../ops/from-facts.js";
import type { OperatorDecision } from "../decision/types.js";
import type { AgentRun, Goal, Task } from "../types/model.js";
import type { EvidenceChain } from "../evidence/chain.js";
import type { MemoryStore } from "../store/memory-store.js";
import type { ToolRegistry } from "../tools/registry.js";
import { classifyProposal } from "../policy/classify.js";
import { JARVIS_PRINCIPAL } from "../trust/principals.js";
import { newId } from "../util/ids.js";
import { ingestBrowserResearch } from "../world-model/ingest-research.js";
import { getFactStore } from "../world-model/fact-store.js";
import { readPdf, type PdfBytesLoader, type PdfTextExtractor } from "../knowledge/pdf.js";
import { ingestPdfExtract } from "../knowledge/ingest-pdf.js";

export interface OrchestratorDeps {
  store: MemoryStore;
  evidence: EvidenceChain;
  tools: ToolRegistry;
  bridge: DispatchBridge;
  browser: BrowserRuntime;
  computer: ComputerRuntime;
  execution: ExecutionPolicy;
  /** When false, browser research is simulate_only (no network). */
  browser_fetch: boolean;
  pdf_loader?: PdfBytesLoader;
  pdf_extractor?: PdfTextExtractor;
}

export interface OrchestratorResult {
  ok: boolean;
  run?: AgentRun;
  skipped?: string;
  facts_stored?: number;
  opportunities_created?: number;
  message: string;
}

function syntheticRun(
  goal: Goal,
  task: Task | undefined,
  decision_id: string,
  tool_id: string,
  status: AgentRun["status"],
): AgentRun {
  return {
    id: newId("run"),
    task_id: task?.id ?? goal.id,
    goal_id: goal.id,
    decision_id,
    principal_id: JARVIS_PRINCIPAL,
    delegation_chain: ["Human(Umer)", JARVIS_PRINCIPAL],
    mode: goal.mode,
    policy_verdict_id: newId("verdict"),
    status,
    tool_invocations: [tool_id],
  };
}

/**
 * Orchestrator — execute a Decision Engine choice on the matching runtime.
 * Does not invent goals. OS work stays on DispatchBridge / OsRuntimeAdapter.
 */
export class Orchestrator {
  lastResearchFacts: ResearchFact[] = [];

  constructor(private readonly deps: OrchestratorDeps) {}

  async execute(input: {
    goal: Goal;
    task?: Task;
    decision: OperatorDecision;
    decision_id: string;
    normalized: NormalizedOutcome;
  }): Promise<OrchestratorResult> {
    const cap = input.decision.selected_capability;
    if (!cap) {
      return { ok: false, message: "No capability selected", skipped: "no capability" };
    }
    const manifest = this.deps.tools.require(cap);

    if (!cap.startsWith("os.runtime.")) {
      const verdict = classifyProposal({ goal: input.goal, manifest, tool_id: cap });
      this.deps.evidence.append({
        goal_id: input.goal.id,
        task_id: input.task?.id,
        kind: "policy_verdict",
        principal_id: JARVIS_PRINCIPAL,
        payload_summary: `${verdict.class}: ${verdict.reason}`,
        simulated: input.goal.mode === "shadow",
        correlation: {
          decision_id: input.decision_id,
          policy_verdict_id: verdict.id,
          tool_id: cap,
          jarvis_task_id: input.task?.id,
        },
      });
      if (verdict.class === "reject") {
        const run = syntheticRun(input.goal, input.task, input.decision_id, cap, "cancelled");
        run.policy_verdict_id = verdict.id;
        this.deps.store.saveRun(run);
        return { ok: false, run, skipped: verdict.reason, message: verdict.reason };
      }
      const args = this.inputOf(input);
      const computerOpenAuthorized =
        (cap === "computer.open_app" || cap === "computer.type_text") &&
        typeof args.confirm === "string" &&
        args.confirm.trim() === COMPUTER_LIVE_OPEN_CONFIRM;
      if (
        (verdict.class === "approval_required" || verdict.class === "strong_confirmation") &&
        input.goal.mode !== "shadow" &&
        input.goal.trust_tier !== "SHADOW" &&
        !computerOpenAuthorized
      ) {
        const run = syntheticRun(input.goal, input.task, input.decision_id, cap, "proposed");
        run.policy_verdict_id = verdict.id;
        this.deps.store.saveRun(run);
        return { ok: false, run, skipped: `Awaiting human: ${verdict.class}`, message: verdict.reason };
      }
    }

    if (cap.startsWith("os.runtime.")) {
      if (!input.task) return { ok: false, message: "OS capability requires a task" };
      return this.executeOsTask(input.goal, input.task, input.decision_id, cap);
    }
    if (cap === "browser.research") {
      return this.executeBrowserResearch(input);
    }
    if (cap.startsWith("computer.")) {
      return this.executeComputer(input, cap);
    }
    if (cap === "knowledge.pdf.read") {
      return this.executePdfRead(input);
    }
    if (cap === "wm.facts.upsert") {
      return this.executeKnowledgeStore(input);
    }
    if (cap === "ops.opportunity.create") {
      return this.executeOpsFromFacts(input);
    }
    return { ok: false, message: `Orchestrator has no adapter for ${cap}`, skipped: cap };
  }

  private async executeOsTask(
    goal: Goal,
    task: Task,
    decision_id: string,
    tool_id: string,
  ): Promise<OrchestratorResult> {
    const max = this.deps.execution.max_attempts;
    const rootKey = task.idempotency_key;

    for (let attempt = 1; attempt <= max; attempt++) {
      if (task.status === "failed") {
        assertTaskTransition("failed", "ready");
        task.status = "ready";
      }
      task.idempotency_key = retryIdempotencyKey(rootKey, attempt);
      this.deps.store.saveTask(task);
      if (task.status === "ready" || task.status === "pending") {
        assertTaskTransition(task.status, "running");
        task.status = "running";
        this.deps.store.saveTask(task);
      }

      try {
        const { run, skipped } = await withTimeout(
          this.deps.bridge.dispatchTask({ goal, task, decision_id, tool_id }),
          this.deps.execution.timeout_ms,
          `task ${task.id} attempt ${attempt}`,
        );

        if (run.status === "cancelled") {
          assertTaskTransition("running", "cancelled");
          task.status = "cancelled";
          this.deps.store.saveTask(task);
          return { ok: false, run, skipped, message: skipped ?? "cancelled" };
        }

        if (run.status === "failed" || skipped) {
          assertTaskTransition("running", "failed");
          task.status = "failed";
          this.deps.store.saveTask(task);
          const retryable = Boolean(skipped && isRetryableFailure(new Error(skipped)));
          if (retryable && attempt < max) continue;
          return { ok: false, run, skipped, message: skipped ?? "failed" };
        }

        assertTaskTransition("running", "done");
        task.status = "done";
        this.deps.store.saveTask(task);
        recordObservation(this.deps.evidence, {
          goal_id: goal.id,
          task_id: task.id,
          action_id: run.id,
          capability_id: tool_id,
          kind: "os_status",
          summary: `OS run ${run.status} tools=${run.tool_invocations.join(",")}`,
          simulated: goal.mode === "shadow",
          decision_id,
        });
        return { ok: true, run, message: `OS ${tool_id} ${run.status}` };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        const run = syntheticRun(goal, task, decision_id, tool_id, "failed");
        this.deps.store.saveRun(run);
        this.deps.evidence.append({
          goal_id: goal.id,
          run_id: run.id,
          kind: "raw_result",
          principal_id: JARVIS_PRINCIPAL,
          payload_summary: e instanceof TimeoutError ? `timeout: ${msg}` : `dispatch error: ${msg}`,
          correlation: { decision_id },
        });
        assertTaskTransition("running", "failed");
        task.status = "failed";
        this.deps.store.saveTask(task);
        if (isRetryableFailure(e) && attempt < max) continue;
        return { ok: false, run, skipped: msg, message: msg };
      }
    }

    return { ok: false, message: "retries exhausted" };
  }

  private async executeBrowserResearch(input: {
    goal: Goal;
    task?: Task;
    decision: OperatorDecision;
    decision_id: string;
  }): Promise<OrchestratorResult> {
    const url =
      (typeof input.decision.input?.url === "string" && input.decision.input.url) ||
      "https://example.com/";
    const task = input.task;
    if (task && (task.status === "ready" || task.status === "pending" || task.status === "failed")) {
      if (task.status === "failed") {
        assertTaskTransition("failed", "ready");
        task.status = "ready";
      }
      assertTaskTransition(task.status, "running");
      task.status = "running";
      this.deps.store.saveTask(task);
    }

    const simulate_only = input.goal.mode === "shadow" && !this.deps.browser_fetch;
    const result = await this.deps.browser.runShadowResearch({
      url,
      goal_id: input.goal.id,
      simulate_only,
    });

    const action_id = result.action.id;
    const visited = Boolean(result.action.fetch?.visited);
    recordObservation(this.deps.evidence, {
      goal_id: input.goal.id,
      task_id: task?.id,
      action_id,
      capability_id: "browser.research",
      kind: visited ? "page_loaded" : "page_not_visited",
      summary: visited
        ? `Page loaded ${url} title=${result.action.fetch?.title ?? "?"}`
        : `Source not visited (${result.action.fetch?.error ?? (simulate_only ? "simulate_only" : "fetch failed")})`,
      simulated: result.simulated,
      decision_id: input.decision_id,
    });
    recordObservation(this.deps.evidence, {
      goal_id: input.goal.id,
      task_id: task?.id,
      action_id,
      capability_id: "browser.extract",
      kind: "extract",
      summary: `Extracted ${result.facts.length} claims (duplicates_skipped=${result.duplicates_skipped})`,
      simulated: result.simulated,
      decision_id: input.decision_id,
    });

    const run = syntheticRun(
      input.goal,
      task,
      input.decision_id,
      "browser.research",
      simulate_only ? "simulated" : result.action.ok ? "succeeded" : "failed",
    );
    this.deps.store.saveRun(run);
    this.lastResearchFacts = result.facts;

    if (task) {
      if (run.status === "failed") {
        assertTaskTransition("running", "failed");
        task.status = "failed";
      } else {
        assertTaskTransition("running", "done");
        task.status = "done";
      }
      this.deps.store.saveTask(task);
    }

    return { ok: run.status !== "failed", run, message: result.message };
  }

  private executeKnowledgeStore(input: {
    goal: Goal;
    task?: Task;
    decision_id: string;
  }): OrchestratorResult {
    const facts = this.lastResearchFacts;
    const url = facts[0]?.source_url ?? "about:blank";
    const memory = ingestBrowserResearch({
      facts,
      goal_id: input.goal.id,
      task_id: input.task?.id,
      url,
    });
    recordObservation(this.deps.evidence, {
      goal_id: input.goal.id,
      task_id: input.task?.id,
      capability_id: "wm.facts.upsert",
      kind: "extract",
      summary: `Memory stored=${memory.stored.length} skipped=${memory.skipped} links=${memory.links}`,
      simulated: input.goal.mode === "shadow",
      decision_id: input.decision_id,
    });
    const run = syntheticRun(input.goal, input.task, input.decision_id, "wm.facts.upsert", "simulated");
    this.deps.store.saveRun(run);
    return {
      ok: true,
      run,
      facts_stored: memory.stored.length,
      message: `Stored ${memory.stored.length} facts`,
    };
  }

  private executeOpsFromFacts(input: {
    goal: Goal;
    decision_id: string;
    normalized: NormalizedOutcome;
  }): OrchestratorResult {
    const facts = getFactStore()
      .listFacts({ goal_id: input.goal.id, status: "active" })
      .filter((f) => isQualifyingOpportunityFact(f, input.normalized));

    let created = 0;
    for (const f of facts) {
      createOpportunityFromFacts({
        fact_ids: [f.id],
        title: f.claim.slice(0, 80),
        channel: "web",
      });
      created += 1;
    }

    recordObservation(this.deps.evidence, {
      goal_id: input.goal.id,
      capability_id: "ops.opportunity.create",
      kind: "metric",
      summary: `Qualifying facts=${facts.length}; opportunities_created=${created}`,
      simulated: input.goal.mode === "shadow",
      decision_id: input.decision_id,
    });

    const run = syntheticRun(input.goal, undefined, input.decision_id, "ops.opportunity.create", "simulated");
    this.deps.store.saveRun(run);
    return {
      ok: true,
      run,
      opportunities_created: created,
      message:
        created === 0
          ? "No qualifying opportunity candidates in observations — none fabricated"
          : `Created ${created} opportunities from qualifying facts`,
    };
  }

  private inputOf(input: {
    task?: Task;
    decision: OperatorDecision;
  }): Record<string, unknown> {
    return { ...(input.task?.input ?? {}), ...(input.decision.input ?? {}) };
  }

  private markTask(task: Task | undefined, to: Task["status"]): void {
    if (!task) return;
    if (task.status !== to) {
      assertTaskTransition(task.status, to);
      task.status = to;
      this.deps.store.saveTask(task);
    }
  }

  private beginTask(task: Task | undefined): void {
    if (!task) return;
    if (task.status === "failed") {
      assertTaskTransition("failed", "ready");
      task.status = "ready";
    }
    if (task.status === "ready" || task.status === "pending") {
      assertTaskTransition(task.status, "running");
      task.status = "running";
      this.deps.store.saveTask(task);
    }
  }

  private markTypeVerified(goal: Goal, passed: boolean): void {
    const kr = goal.key_results.find((k) => k.metric_ref === "computer.type_verified");
    if (!kr) return;
    kr.current = passed ? 1 : 0;
    kr.last_measured_at = new Date().toISOString();
    this.deps.store.saveGoal(goal);
  }

  private targetOpened(goal_id: string, target_id: string): boolean {
    return [...this.deps.store.tasks.values()].some(
      (t) =>
        t.goal_id === goal_id &&
        t.tool_ids.includes("computer.open_app") &&
        t.status === "done" &&
        String(t.input?.target_id ?? "") === target_id,
    );
  }

  private async executeComputer(
    input: {
      goal: Goal;
      task?: Task;
      decision: OperatorDecision;
      decision_id: string;
    },
    cap: string,
  ): Promise<OrchestratorResult> {
    this.beginTask(input.task);
    const args = this.inputOf(input);
    const rawTarget = String(args.target_id ?? args.target ?? "");
    const target_id = rawTarget ? resolveTargetId(rawTarget) ?? rawTarget : undefined;

    if (cap === "computer.observe.snapshot") {
      const obs = this.deps.computer.observe("standalone");
      recordObservation(this.deps.evidence, {
        goal_id: input.goal.id,
        task_id: input.task?.id,
        capability_id: cap,
        kind: "state_snapshot",
        summary: obs.snapshot_summary,
        simulated: input.goal.mode === "shadow",
        decision_id: input.decision_id,
      });
      const run = syntheticRun(input.goal, input.task, input.decision_id, cap, "simulated");
      this.deps.store.saveRun(run);
      this.markTask(input.task, "done");
      return { ok: true, run, message: obs.snapshot_summary };
    }

    if (cap === "computer.locate") {
      if (!target_id) {
        this.markTask(input.task, "failed");
        return { ok: false, message: "computer.locate requires target_id", skipped: "target_id" };
      }
      const locate = this.deps.computer.locate(target_id);
      recordObservation(this.deps.evidence, {
        goal_id: input.goal.id,
        task_id: input.task?.id,
        capability_id: cap,
        kind: "state_snapshot",
        summary: locate.detail,
        simulated: true,
        decision_id: input.decision_id,
      });
      const run = syntheticRun(
        input.goal,
        input.task,
        input.decision_id,
        cap,
        locate.found ? "simulated" : "failed",
      );
      this.deps.store.saveRun(run);
      this.markTask(input.task, locate.found ? "done" : "failed");
      return { ok: locate.found, run, message: locate.detail };
    }

    if (cap === "computer.open_app") {
      if (!target_id) {
        this.markTask(input.task, "failed");
        return { ok: false, message: "computer.open_app requires target_id", skipped: "target_id" };
      }
      if (input.goal.mode === "live") {
        const live = await this.deps.computer.runLiveOpen({
          target: target_id,
          confirm: typeof args.confirm === "string" ? args.confirm : undefined,
          goal_id: input.goal.id,
        });
        if ("need_confirm" in live) {
          this.markTask(input.task, "failed");
          const run = syntheticRun(input.goal, input.task, input.decision_id, cap, "proposed");
          this.deps.store.saveRun(run);
          return { ok: false, run, skipped: live.message, message: live.message };
        }
        const passed = Boolean(live.action.verification?.passed);
        recordObservation(this.deps.evidence, {
          goal_id: input.goal.id,
          task_id: input.task?.id,
          action_id: live.action.id,
          capability_id: cap,
          kind: "host_process",
          summary: live.action.verification?.summary ?? live.message,
          simulated: false,
          decision_id: input.decision_id,
        });
        const run = syntheticRun(
          input.goal,
          input.task,
          input.decision_id,
          cap,
          passed ? "succeeded" : "failed",
        );
        this.deps.store.saveRun(run);
        this.markTask(input.task, passed ? "done" : "failed");
        if (input.task) {
          input.task.input = { ...(input.task.input ?? {}), target_id };
          this.deps.store.saveTask(input.task);
        }
        return { ok: passed, run, message: live.message };
      }

      const shadow = await this.deps.computer.runShadowOpen({
        target: target_id,
        goal_id: input.goal.id,
      });
      const passed = Boolean(shadow.action.verification?.passed);
      recordObservation(this.deps.evidence, {
        goal_id: input.goal.id,
        task_id: input.task?.id,
        action_id: shadow.action.id,
        capability_id: cap,
        kind: "host_process",
        summary: shadow.action.verification?.summary ?? shadow.message,
        simulated: true,
        decision_id: input.decision_id,
      });
      const run = syntheticRun(
        input.goal,
        input.task,
        input.decision_id,
        cap,
        passed ? "simulated" : "failed",
      );
      this.deps.store.saveRun(run);
      if (input.task) {
        input.task.input = { ...(input.task.input ?? {}), target_id };
      }
      this.markTask(input.task, passed ? "done" : "failed");
      return { ok: passed, run, message: shadow.message };
    }

    if (cap === "computer.type_text") {
      if (!target_id) {
        this.markTask(input.task, "failed");
        return { ok: false, message: "computer.type_text requires target_id", skipped: "target_id" };
      }
      const text = String(args.text ?? "");
      if (input.goal.mode === "live") {
        const live = await this.deps.computer.runLiveType({
          target: target_id,
          text,
          confirm: typeof args.confirm === "string" ? args.confirm : undefined,
          goal_id: input.goal.id,
          prior_open:
            this.targetOpened(input.goal.id, target_id) ||
            this.deps.computer.getLaunch(input.goal.id)?.target_id === target_id,
        });
        if ("need_confirm" in live) {
          this.markTask(input.task, "failed");
          const run = syntheticRun(input.goal, input.task, input.decision_id, cap, "proposed");
          this.deps.store.saveRun(run);
          return { ok: false, run, skipped: live.message, message: live.message };
        }
        const passed = Boolean(live.action.verification?.passed);
        this.markTypeVerified(input.goal, passed);
        recordObservation(this.deps.evidence, {
          goal_id: input.goal.id,
          task_id: input.task?.id,
          action_id: live.action.id,
          capability_id: cap,
          kind: "host_process",
          summary: live.action.verification?.summary ?? live.message,
          simulated: false,
          decision_id: input.decision_id,
        });
        const run = syntheticRun(
          input.goal,
          input.task,
          input.decision_id,
          cap,
          passed ? "succeeded" : "failed",
        );
        this.deps.store.saveRun(run);
        this.markTask(input.task, passed ? "done" : "failed");
        return { ok: passed, run, message: live.message };
      }
      const typed = await this.deps.computer.runShadowType({
        target: target_id,
        text,
        goal_id: input.goal.id,
        prior_open: this.targetOpened(input.goal.id, target_id),
      });
      const passed = Boolean(typed.action.verification?.passed);
      this.markTypeVerified(input.goal, passed);
      recordObservation(this.deps.evidence, {
        goal_id: input.goal.id,
        task_id: input.task?.id,
        action_id: typed.action.id,
        capability_id: cap,
        kind: "host_process",
        summary: typed.action.verification?.summary ?? typed.message,
        simulated: true,
        decision_id: input.decision_id,
      });
      const run = syntheticRun(
        input.goal,
        input.task,
        input.decision_id,
        cap,
        passed ? "simulated" : "failed",
      );
      this.deps.store.saveRun(run);
      this.markTask(input.task, passed ? "done" : "failed");
      return { ok: passed, run, message: typed.message };
    }

    this.markTask(input.task, "failed");
    return { ok: false, message: `Computer capability not wired: ${cap}`, skipped: cap };
  }

  private async executePdfRead(input: {
    goal: Goal;
    task?: Task;
    decision: OperatorDecision;
    decision_id: string;
  }): Promise<OrchestratorResult> {
    this.beginTask(input.task);
    const args = this.inputOf(input);
    const path = typeof args.path === "string" ? args.path : undefined;
    const url = typeof args.url === "string" ? args.url : undefined;
    try {
      const extract = await readPdf({
        path,
        url,
        loader: this.deps.pdf_loader,
        extractor: this.deps.pdf_extractor,
      });
      const memory = ingestPdfExtract({
        extract,
        goal_id: input.goal.id,
        task_id: input.task?.id,
      });
      recordObservation(this.deps.evidence, {
        goal_id: input.goal.id,
        task_id: input.task?.id,
        capability_id: "knowledge.pdf.read",
        kind: "pdf_text",
        summary: `PDF ${extract.source} bytes=${extract.bytes} facts=${memory.stored.length} skipped=${memory.skipped}`,
        simulated: input.goal.mode === "shadow",
        decision_id: input.decision_id,
      });
      const run = syntheticRun(
        input.goal,
        input.task,
        input.decision_id,
        "knowledge.pdf.read",
        "simulated",
      );
      this.deps.store.saveRun(run);
      this.markTask(input.task, "done");
      return {
        ok: true,
        run,
        facts_stored: memory.stored.length,
        message: `Read PDF; stored ${memory.stored.length} observation facts`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      recordObservation(this.deps.evidence, {
        goal_id: input.goal.id,
        task_id: input.task?.id,
        capability_id: "knowledge.pdf.read",
        kind: "pdf_text",
        summary: `PDF read failed: ${msg}`,
        simulated: true,
        decision_id: input.decision_id,
      });
      const run = syntheticRun(input.goal, input.task, input.decision_id, "knowledge.pdf.read", "failed");
      this.deps.store.saveRun(run);
      this.markTask(input.task, "failed");
      return { ok: false, run, skipped: msg, message: msg };
    }
  }
}
