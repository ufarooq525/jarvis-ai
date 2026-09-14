import { describe, expect, it, beforeEach } from "vitest";
import { GoalEngine } from "./engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { resetFactStore } from "../world-model/fact-store.js";
import { resetOpportunityStore } from "../ops/opportunity-store.js";

describe("Phase 4 — Live outcome verification", () => {
  beforeEach(() => {
    resetFactStore();
    resetOpportunityStore();
  });

  it("does not mark the goal done when the Live plan is only accepted", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);
    const shadow = await engine.runShadowLoop({
      outcome: "Produce a weekly company overview plan",
      domain: "ops",
    });
    const promoted = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "LIVE",
    });
    expect(promoted.run.os_run_id).toBeTruthy();
    expect(promoted.goal.status).not.toBe("done");
    expect(promoted.goal.status).toBe("active");
    expect(promoted.message).toMatch(/in progress|not complete|not completion/i);
    const journal = engine.journal.byGoal(shadow.goal.id).find((j) => j.decision === "promote_to_live");
    expect(journal?.verification_passed).toBe(false);
  });

  it("marks blocked when getRun reports failed", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);
    const shadow = await engine.runShadowLoop({
      outcome: "Phase 4 live fail outcome unique",
      domain: "ops",
    });
    const promoted = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "LIVE",
    });
    adapter.setRunStatus(promoted.run.os_run_id!, "failed");
    const synced = await engine.syncLiveRun(shadow.goal.id);
    expect(synced.goal.status).toBe("blocked");
    expect(synced.run?.status).toBe("failed");
  });

  it("marks done only after a terminal success signal", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);
    const shadow = await engine.runShadowLoop({
      outcome: "Phase 4 live success outcome unique",
      domain: "ops",
    });
    const promoted = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "LIVE",
    });
    expect(promoted.goal.status).toBe("active");
    adapter.setRunStatus(promoted.run.os_run_id!, "succeeded");
    const synced = await engine.syncLiveRun(shadow.goal.id);
    expect(synced.goal.status).toBe("done");
    expect(synced.run?.status).toBe("succeeded");
  });
});
