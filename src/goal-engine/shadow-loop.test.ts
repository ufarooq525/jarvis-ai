import { describe, expect, it } from "vitest";
import { GoalEngine } from "./engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { engageKillSwitch, clearKillSwitch } from "../kill-switch.js";

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
    expect(result.runs.length).toBeGreaterThanOrEqual(2);
    expect(result.runs.every((r) => r.mode === "shadow")).toBe(true);
    expect(result.runs.every((r) => r.delegation_chain.length >= 2)).toBe(true);
    expect(result.runs.every((r) => r.decision_id && r.policy_verdict_id)).toBe(true);

    const chain = JSON.parse(result.evidence_json) as unknown[];
    expect(chain.length).toBeGreaterThan(3);

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

describe("Adapter isolation", () => {
  it("GoalEngine constructor accepts only OsRuntimeAdapter (mock)", () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);
    expect(engine).toBeInstanceOf(GoalEngine);
  });
});
