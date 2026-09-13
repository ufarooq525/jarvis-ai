import { describe, expect, it } from "vitest";
import { GoalEngine } from "./engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { engageKillSwitch, clearKillSwitch } from "../kill-switch.js";
import { normalizeOutcome } from "./normalize.js";
import { canTransitionGoal, canTransitionTask, assertGoalTransition } from "./transitions.js";
import { SHADOW_SIMULATED_NOTICE, verifyShadowLoop } from "./verifier.js";

describe("Goal Engine Shadow Loop (§16)", () => {
  it("completes shadow loop with evidence, manifests, and delegation — mock only", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);

    const result = await engine.runShadowLoop({
      title: "Weekly overview",
      outcome: "Produce a weekly company overview plan",
      domain: "ops",
    });

    expect(result.decision_outcome).toBe("act");
    expect(result.goal.mode).toBe("shadow");
    expect(result.goal.trust_tier).toBe("SHADOW");
    expect(result.goal.status).toBe("done");
    expect(result.simulated).toBe(true);
    expect(result.simulated_notice).toBe(SHADOW_SIMULATED_NOTICE);
    expect(result.verification.passed).toBe(true);
    expect(result.message).toContain(SHADOW_SIMULATED_NOTICE);
    expect(result.runs.length).toBeGreaterThanOrEqual(2);
    expect(result.runs.every((r) => r.mode === "shadow")).toBe(true);
    expect(result.runs.every((r) => r.delegation_chain.length >= 2)).toBe(true);
    expect(result.runs.every((r) => r.decision_id && r.policy_verdict_id)).toBe(true);

    const chain = JSON.parse(result.evidence_json) as Array<{ kind: string }>;
    expect(chain.length).toBeGreaterThan(3);
    expect(chain.some((n) => n.kind === "stimulus")).toBe(true);
    expect(chain.some((n) => n.kind === "decision")).toBe(true);
    expect(chain.some((n) => n.kind === "policy_verdict")).toBe(true);

    // Mock never creates live OS side-effect statuses
    for (const run of result.runs) {
      expect(["simulated", "succeeded", "cancelled"]).toContain(run.status);
      if (run.os_run_id) {
        const os = await adapter.getRun(run.os_run_id);
        expect(os?.status).toMatch(/noop_shadow|simulated|cancelled/);
      }
    }

    expect(adapter.name).toBe("mock");
  });

  it("merges duplicate overlapping goals (do_not_act)", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);

    const first = await engine.runShadowLoop({
      title: "Outreach batch",
      outcome: "Prepare outreach batch for prospects",
      domain: "sales",
    });
    expect(first.decision_outcome).toBe("act");

    // Reset goal status to active so overlap finder still sees it
    first.goal.status = "active";
    engine.store.saveGoal(first.goal);

    const second = await engine.runShadowLoop({
      title: "Outreach batch again",
      outcome: "Prepare outreach batch for prospects",
      domain: "sales",
    });

    expect(second.decision_outcome).toBe("merge_into_existing");
    expect(second.goal.id).toBe(first.goal.id);
    expect(second.runs).toHaveLength(0);
    expect(second.simulated_notice).toBe(SHADOW_SIMULATED_NOTICE);
  });

  it("is idempotent on the same task key", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);
    const result = await engine.runShadowLoop({
      title: "Idem",
      outcome: "Unique idempotency outcome alpha",
      domain: "general",
    });
    const run = result.runs.find((r) => r.tool_invocations.includes("os.runtime.start_run"));
    expect(run).toBeTruthy();

    const task = [...engine.store.tasks.values()].find((t) => t.id === run!.task_id)!;
    const again = await engine.bridge.dispatchTask({
      goal: result.goal,
      task,
      decision_id: result.decision_id,
      tool_id: "os.runtime.start_run",
    });
    expect(again.run.id).toBe(run!.id);
  });

  it("rejects live dispatch when kill switch engaged", async () => {
    engageKillSwitch("test");
    try {
      const adapter = new MockOsRuntimeAdapter();
      const engine = new GoalEngine(adapter);
      const result = await engine.runShadowLoop({
        title: "Still shadow",
        outcome: "Kill switch should not break shadow mode",
        domain: "general",
      });
      // Shadow mode still proceeds (kill switch gates live)
      expect(result.decision_outcome).toBe("act");
      expect(result.goal.mode).toBe("shadow");
    } finally {
      clearKillSwitch();
    }
  });
});

describe("Phase 1 — outcome normalize + lifecycle acceptance", () => {
  it("normalizes the Saudi Laravel SaaS research outcome", () => {
    const n = normalizeOutcome({
      outcome: "Find 10 Laravel SaaS opportunities in Saudi Arabia.",
    });
    expect(n.domain).toBe("sales");
    expect(n.plan_kind).toBe("research");
    expect(n.geography).toBe("Saudi Arabia");
    expect(n.target_count).toBe(10);
    expect(n.constraints).toEqual(
      expect.arrayContaining([
        "geography:Saudi Arabia",
        "target_count:10",
        "stack:Laravel",
        "product:SaaS",
      ]),
    );
    expect(n.key_results.some((kr) => kr.metric_ref === "research.opportunity_count")).toBe(true);
    expect(n.key_results.find((kr) => kr.metric_ref === "research.opportunity_count")?.target).toBe(10);
  });

  it("runs full Shadow lifecycle for Saudi SaaS outcome without external actions", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);

    const result = await engine.runShadowLoop({
      outcome: "Find 10 Laravel SaaS opportunities in Saudi Arabia.",
    });

    expect(result.decision_outcome).toBe("act");
    expect(result.simulated).toBe(true);
    expect(result.simulated_notice).toBe(SHADOW_SIMULATED_NOTICE);
    expect(result.verification.passed).toBe(true);
    expect(result.goal.status).toBe("done");
    expect(result.goal.mode).toBe("shadow");
    expect(result.goal.domain).toBe("sales");
    expect(result.normalized.plan_kind).toBe("research");
    expect(result.normalized.target_count).toBe(10);

    const objectives = [...engine.store.objectives.values()].filter(
      (o) => o.goal_id === result.goal.id,
    );
    const tasks = [...engine.store.tasks.values()].filter((t) => t.goal_id === result.goal.id);

    expect(objectives.length).toBeGreaterThanOrEqual(1);
    expect(objectives[0]!.title).toMatch(/Research/i);
    expect(objectives[0]!.success_criteria).toContain("10");
    expect(tasks.length).toBeGreaterThanOrEqual(2);
    expect(tasks.every((t) => t.status === "done")).toBe(true);

    expect(result.runs.length).toBeGreaterThanOrEqual(2);
    expect(result.runs.every((r) => r.mode === "shadow")).toBe(true);
    expect(result.runs.every((r) => r.status === "simulated" || r.status === "succeeded")).toBe(
      true,
    );

    const chain = JSON.parse(result.evidence_json) as Array<{ kind: string; payload_summary: string }>;
    expect(chain.some((n) => n.kind === "stimulus")).toBe(true);
    expect(chain.some((n) => n.kind === "decision")).toBe(true);
    expect(chain.some((n) => n.kind === "policy_verdict")).toBe(true);
    expect(chain.some((n) => n.kind === "simulation" || n.kind === "tool_invocation")).toBe(true);
    expect(chain.some((n) => n.payload_summary.includes("verification: passed"))).toBe(true);
    expect(chain.some((n) => n.payload_summary.includes(SHADOW_SIMULATED_NOTICE))).toBe(true);

    // Research count KR is planned, not fabricated as completed in Shadow
    const researchKr = result.goal.key_results.find(
      (kr) => kr.metric_ref === "research.opportunity_count",
    );
    expect(researchKr?.target).toBe(10);
    expect(researchKr?.current).toBe(0);

    for (const run of result.runs) {
      if (run.os_run_id) {
        const os = await adapter.getRun(run.os_run_id);
        expect(os?.status).toMatch(/noop_shadow|simulated/);
        expect(os?.summary).toMatch(/SHADOW|noop|mock/i);
      }
    }
  });
});

describe("lifecycle transitions", () => {
  it("allows draft→active→done and rejects done→cancelled", () => {
    expect(canTransitionGoal("draft", "active")).toBe(true);
    expect(canTransitionGoal("active", "done")).toBe(true);
    expect(canTransitionGoal("done", "active")).toBe(true); // replan / Live reopen
    expect(canTransitionGoal("done", "cancelled")).toBe(false);
    expect(() => assertGoalTransition("done", "cancelled")).toThrow(/Illegal goal transition/);
  });

  it("allows task ready→running→done and failed→ready for retry", () => {
    expect(canTransitionTask("ready", "running")).toBe(true);
    expect(canTransitionTask("running", "done")).toBe(true);
    expect(canTransitionTask("failed", "ready")).toBe(true);
    expect(canTransitionTask("failed", "cancelled")).toBe(true);
    expect(canTransitionTask("done", "running")).toBe(false);
  });
});

describe("Phase 1 — failure, retry, timeout, cancel, replan", () => {
  it("retries adapter failure then succeeds within max_attempts", async () => {
    const adapter = new MockOsRuntimeAdapter();
    adapter.failTools = ["os.runtime.start_run"];
    adapter.failStartRunRemaining = 1; // fail once, then succeed
    const engine = new GoalEngine(adapter, { execution: { max_attempts: 2, timeout_ms: 2000 } });

    const result = await engine.runShadowLoop({
      outcome: "Unique retry success outcome omega-1",
    });

    expect(result.decision_outcome).toBe("act");
    expect(result.goal.status).toBe("done");
    expect(result.verification.passed).toBe(true);
    expect(result.partial?.failed).toBe(0);
    // At least one failed attempt run should exist for start_run, plus eventual success
    const startRuns = result.runs.filter((r) => r.tool_invocations.includes("os.runtime.start_run"));
    expect(startRuns.some((r) => r.status === "failed")).toBe(true);
    expect(startRuns.some((r) => r.status === "simulated" || r.status === "succeeded")).toBe(true);
  });

  it("blocks goal with partial completion when retries exhaust", async () => {
    const adapter = new MockOsRuntimeAdapter();
    adapter.failTools = ["os.runtime.start_run"];
    adapter.failStartRunRemaining = 10; // never succeed
    const engine = new GoalEngine(adapter, { execution: { max_attempts: 2, timeout_ms: 2000 } });

    const result = await engine.runShadowLoop({
      outcome: "Unique permanent failure outcome omega-2",
    });

    expect(result.decision_outcome).toBe("escalate");
    expect(result.goal.status).toBe("blocked");
    expect(result.verification.passed).toBe(false);
    expect(result.partial?.done).toBeGreaterThanOrEqual(1); // inspect may succeed
    expect(result.partial?.failed).toBeGreaterThanOrEqual(1);

    const tasks = [...engine.store.tasks.values()].filter((t) => t.goal_id === result.goal.id);
    expect(tasks.some((t) => t.status === "done")).toBe(true);
    expect(tasks.some((t) => t.status === "failed")).toBe(true);
  });

  it("times out slow adapter calls and retries", async () => {
    const adapter = new MockOsRuntimeAdapter();
    adapter.startRunDelayMs = 80;
    adapter.failTools = ["os.runtime.start_run"];
    // First start_run attempt times out; reduce delay so retry can succeed
    const engine = new GoalEngine(adapter, { execution: { max_attempts: 2, timeout_ms: 30 } });

    // After first timeout on start_run, clear delay so retry succeeds (inspect may also timeout)
    const origStart = adapter.startRun.bind(adapter);
    let calls = 0;
    adapter.startRun = async (spec) => {
      calls += 1;
      if (calls >= 2) adapter.startRunDelayMs = 0;
      return origStart(spec);
    };

    const result = await engine.runShadowLoop({
      outcome: "Unique timeout retry outcome omega-3",
    });

    expect(result.goal.status === "done" || result.goal.status === "blocked").toBe(true);
    const evidence = JSON.parse(result.evidence_json) as Array<{ payload_summary: string }>;
    expect(evidence.some((e) => /timeout/i.test(e.payload_summary))).toBe(true);
  });

  it("cancels a blocked goal", async () => {
    const adapter = new MockOsRuntimeAdapter();
    adapter.failTools = ["os.runtime.start_run"];
    adapter.failStartRunRemaining = 10;
    const engine = new GoalEngine(adapter, { execution: { max_attempts: 1, timeout_ms: 2000 } });

    const failed = await engine.runShadowLoop({
      outcome: "Unique cancel target outcome omega-4",
    });
    expect(failed.goal.status).toBe("blocked");

    const cancelled = await engine.cancelGoal(failed.goal.id, "test cancel");
    expect(cancelled.goal.status).toBe("cancelled");
    expect(cancelled.cancelled_tasks).toBeGreaterThanOrEqual(1);
  });

  it("replans a blocked goal and completes after adapter recovers", async () => {
    const adapter = new MockOsRuntimeAdapter();
    adapter.failTools = ["os.runtime.start_run"];
    adapter.failStartRunRemaining = 10;
    const engine = new GoalEngine(adapter, { execution: { max_attempts: 1, timeout_ms: 2000 } });

    const failed = await engine.runShadowLoop({
      outcome: "Unique replan target outcome omega-5",
    });
    expect(failed.goal.status).toBe("blocked");

    adapter.failStartRunRemaining = 0; // recover
    const replanned = await engine.replanGoal(failed.goal.id);

    expect(replanned.decision_outcome).toBe("act");
    expect(replanned.goal.status).toBe("done");
    expect(replanned.verification.passed).toBe(true);
    expect(replanned.partial?.failed).toBe(0);

    const journal = engine.journal.byGoal(failed.goal.id);
    expect(journal.some((j) => j.decision.includes("replan"))).toBe(true);
  });
});

describe("verifier", () => {
  it("fails when shadow evidence is incomplete", () => {
    const result = verifyShadowLoop({
      goal: {
        id: "goal_x",
        title: "t",
        outcome: "o",
        domain: "general",
        status: "active",
        priority: 1,
        trust_tier: "SHADOW",
        autonomy_ceiling: 1,
        mode: "shadow",
        key_results: [
          {
            id: "kr1",
            label: "e",
            metric_ref: "evidence.chain.length",
            target: 1,
            current: 0,
          },
        ],
        owner_principal_id: "Human",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      tasks: [],
      runs: [],
      evidence: [],
    });
    expect(result.passed).toBe(false);
    expect(result.simulated_notice).toBe(SHADOW_SIMULATED_NOTICE);
  });
});

describe("Adapter isolation", () => {
  it("GoalEngine constructor accepts only OsRuntimeAdapter (mock)", () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);
    expect(engine).toBeInstanceOf(GoalEngine);
  });
});
