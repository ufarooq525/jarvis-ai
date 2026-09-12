import type { OsRuntimeAdapter, RunSpec } from "../contracts/index.js";
import type { AgentRun, Goal, PolicyVerdict, Task } from "../types/model.js";
import { classifyProposal } from "../policy/classify.js";
import type { ToolRegistry } from "../tools/registry.js";
import type { EvidenceChain } from "../evidence/chain.js";
import type { MemoryStore } from "../store/memory-store.js";
import { buildDelegationChain, JARVIS_PRINCIPAL } from "../trust/principals.js";
import { newId, nowIso } from "../util/ids.js";
import { isKillSwitchEngaged } from "../kill-switch.js";

export class DispatchBridge {
  constructor(
    private readonly store: MemoryStore,
    private readonly adapter: OsRuntimeAdapter,
    private readonly tools: ToolRegistry,
    private readonly evidence: EvidenceChain,
  ) {}

  async dispatchTask(input: {
    goal: Goal;
    task: Task;
    decision_id: string;
    tool_id: string;
  }): Promise<{ run: AgentRun; verdict: PolicyVerdict; skipped?: string }> {
    const existing = this.store.getRunByIdempotency(input.task.idempotency_key);
    if (existing) {
      return {
        run: existing,
        verdict: {
          id: existing.policy_verdict_id,
          class: "automatic",
          reason: "Idempotent replay — existing run returned",
          at: nowIso(),
        },
      };
    }

    const manifest = this.tools.require(input.tool_id);
    const verdict = classifyProposal({
      goal: input.goal,
      manifest,
      tool_id: input.tool_id,
    });

    this.evidence.append({
      goal_id: input.goal.id,
      kind: "policy_verdict",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `${verdict.class}: ${verdict.reason}`,
      correlation: { decision_id: input.decision_id, policy_verdict_id: verdict.id },
    });

    if (verdict.class === "reject") {
      const run: AgentRun = {
        id: newId("run"),
        task_id: input.task.id,
        goal_id: input.goal.id,
        decision_id: input.decision_id,
        principal_id: JARVIS_PRINCIPAL,
        delegation_chain: buildDelegationChain(),
        mode: input.goal.mode,
        policy_verdict_id: verdict.id,
        status: "cancelled",
        tool_invocations: [],
      };
      this.store.saveRun(run);
      this.store.rememberIdempotency(input.task.idempotency_key, run.id);
      return { run, verdict, skipped: verdict.reason };
    }

    if (verdict.class === "approval_required" || verdict.class === "strong_confirmation") {
      // Phase-1 Shadow slice: treat as blocked for Live; in SHADOW we still simulate reads/noops.
      if (input.goal.mode !== "shadow" && input.goal.trust_tier !== "SHADOW") {
        const run: AgentRun = {
          id: newId("run"),
          task_id: input.task.id,
          goal_id: input.goal.id,
          decision_id: input.decision_id,
          principal_id: JARVIS_PRINCIPAL,
          delegation_chain: buildDelegationChain(),
          mode: input.goal.mode,
          policy_verdict_id: verdict.id,
          status: "proposed",
          tool_invocations: [],
        };
        this.store.saveRun(run);
        return { run, verdict, skipped: `Awaiting human: ${verdict.class}` };
      }
    }

    if (isKillSwitchEngaged() && input.goal.mode === "live") {
      throw new Error("Kill switch engaged");
    }

    // Force shadow semantics for §16 — Goal Engine never assumes Live OS.
    const effectiveMode = input.goal.mode === "live" && input.goal.trust_tier === "SHADOW" ? "shadow" : input.goal.mode;

    const correlation = {
      jarvis_goal_id: input.goal.id,
      jarvis_task_id: input.task.id,
      jarvis_run_id: newId("run"),
      decision_id: input.decision_id,
      principal_id: JARVIS_PRINCIPAL,
      delegation_chain: buildDelegationChain("OS_Agent(mock)"),
      mode: effectiveMode as "shadow" | "live",
      policy_verdict_id: verdict.id,
    };

    const spec: RunSpec = {
      tool_id: input.tool_id,
      input: { intent: input.task.intent, title: input.task.title },
      domain: input.goal.domain,
      mode: correlation.mode,
      correlation,
      idempotency_key: input.task.idempotency_key,
    };

    const sim = await this.adapter.proposeRun(spec);
    this.evidence.append({
      goal_id: input.goal.id,
      run_id: correlation.jarvis_run_id,
      kind: "simulation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: sim.predicted_summary,
      correlation: { decision_id: input.decision_id, policy_verdict_id: verdict.id },
    });

    const osRecord = await this.adapter.startRun(spec);
    this.evidence.append({
      goal_id: input.goal.id,
      run_id: correlation.jarvis_run_id,
      kind: "tool_invocation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: osRecord.summary,
      correlation: {
        decision_id: input.decision_id,
        policy_verdict_id: verdict.id,
        os_run_id: osRecord.os_run_id,
      },
    });

    const run: AgentRun = {
      id: correlation.jarvis_run_id,
      task_id: input.task.id,
      goal_id: input.goal.id,
      decision_id: input.decision_id,
      os_run_id: osRecord.os_run_id,
      principal_id: JARVIS_PRINCIPAL,
      delegation_chain: correlation.delegation_chain,
      mode: correlation.mode,
      policy_verdict_id: verdict.id,
      status: osRecord.status === "noop_shadow" || osRecord.status === "simulated" ? "simulated" : "succeeded",
      tool_invocations: [input.tool_id],
    };
    this.store.saveRun(run);
    this.store.rememberIdempotency(input.task.idempotency_key, run.id);
    return { run, verdict };
  }

  /**
   * Phase E: after human Strong-confirm, skip the "awaiting approval" hold and call Live startRun.
   * Still fail-closed on kill switch / reject verdict / SHADOW tier (caller must elevate first).
   */
  async dispatchLiveApproved(input: {
    goal: Goal;
    task: Task;
    decision_id: string;
    tool_id: string;
    project_id?: string;
    approver?: string;
  }): Promise<{ run: AgentRun; verdict: PolicyVerdict; skipped?: string }> {
    const existing = this.store.getRunByIdempotency(input.task.idempotency_key);
    if (existing) {
      return {
        run: existing,
        verdict: {
          id: existing.policy_verdict_id,
          class: "automatic",
          reason: "Idempotent replay — existing Live run returned",
          at: nowIso(),
        },
      };
    }

    if (input.goal.trust_tier === "SHADOW" || input.goal.mode !== "live") {
      throw new Error("Live dispatch refused — goal still SHADOW or not in live mode");
    }
    if (isKillSwitchEngaged()) {
      throw new Error("Kill switch engaged");
    }

    const manifest = this.tools.require(input.tool_id);
    const verdict = classifyProposal({
      goal: input.goal,
      manifest,
      tool_id: input.tool_id,
    });

    this.evidence.append({
      goal_id: input.goal.id,
      kind: "policy_verdict",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `${verdict.class}: ${verdict.reason} (post Strong-confirm)`,
      correlation: { decision_id: input.decision_id, policy_verdict_id: verdict.id },
    });

    if (verdict.class === "reject") {
      const run: AgentRun = {
        id: newId("run"),
        task_id: input.task.id,
        goal_id: input.goal.id,
        decision_id: input.decision_id,
        principal_id: JARVIS_PRINCIPAL,
        delegation_chain: buildDelegationChain(),
        mode: "live",
        policy_verdict_id: verdict.id,
        status: "cancelled",
        tool_invocations: [],
      };
      this.store.saveRun(run);
      this.store.rememberIdempotency(input.task.idempotency_key, run.id);
      return { run, verdict, skipped: verdict.reason };
    }

    // Strong-confirm already collected — proceed even if class is approval_required.
    const correlation = {
      jarvis_goal_id: input.goal.id,
      jarvis_task_id: input.task.id,
      jarvis_run_id: newId("run"),
      decision_id: input.decision_id,
      principal_id: input.approver ?? JARVIS_PRINCIPAL,
      delegation_chain: buildDelegationChain("OS_Agent(umer)"),
      mode: "live" as const,
      policy_verdict_id: verdict.id,
    };

    const spec: RunSpec = {
      tool_id: input.tool_id,
      input: {
        intent: input.task.intent,
        title: input.task.title,
        project_id: input.project_id,
      },
      domain: input.goal.domain,
      mode: "live",
      correlation,
      idempotency_key: input.task.idempotency_key,
      project_id: input.project_id,
      approver: input.approver,
    };

    const sim = await this.adapter.proposeRun(spec);
    this.evidence.append({
      goal_id: input.goal.id,
      run_id: correlation.jarvis_run_id,
      kind: "simulation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: sim.predicted_summary,
      correlation: { decision_id: input.decision_id, policy_verdict_id: verdict.id },
    });

    const osRecord = await this.adapter.startRun(spec);
    this.evidence.append({
      goal_id: input.goal.id,
      run_id: correlation.jarvis_run_id,
      kind: "tool_invocation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: osRecord.summary,
      correlation: {
        decision_id: input.decision_id,
        policy_verdict_id: verdict.id,
        os_run_id: osRecord.os_run_id,
      },
    });

    const run: AgentRun = {
      id: correlation.jarvis_run_id,
      task_id: input.task.id,
      goal_id: input.goal.id,
      decision_id: input.decision_id,
      os_run_id: osRecord.os_run_id,
      principal_id: JARVIS_PRINCIPAL,
      delegation_chain: correlation.delegation_chain,
      mode: "live",
      policy_verdict_id: verdict.id,
      status:
        osRecord.status === "running"
          ? "running"
          : osRecord.status === "failed"
            ? "failed"
            : osRecord.status === "succeeded"
              ? "succeeded"
              : "approved",
      tool_invocations: [input.tool_id],
    };
    this.store.saveRun(run);
    this.store.rememberIdempotency(input.task.idempotency_key, run.id);
    return { run, verdict };
  }
}
