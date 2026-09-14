import type { BrowserRuntime } from "../browser/runtime.js";
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
import { getOpportunityStore } from "../ops/opportunity-store.js";
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

export interface OrchestratorDeps {
  store: MemoryStore;
  evidence: EvidenceChain;
  tools: ToolRegistry;
  bridge: DispatchBridge;
  browser: BrowserRuntime;
  execution: ExecutionPolicy;
  /** When false, browser research is simulate_only (no network). */
  browser_fetch: boolean;
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
      if (
        (verdict.class === "approval_required" || verdict.class === "strong_confirmation") &&
        input.goal.mode !== "shadow" &&
        input.goal.trust_tier !== "SHADOW"
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
}
