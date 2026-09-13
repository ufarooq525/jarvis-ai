import { describe, expect, it } from "vitest";
import { GoalEngine } from "../goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "./mock/mock-os-runtime-adapter.js";

describe("Phase 4 — Live status sync + subscribe (mock)", () => {
  it("syncLiveRun updates store and preserves failure evidence", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const engine = new GoalEngine(adapter);

    const shadow = await engine.runShadowLoop({
      outcome: "Phase 4 sync live status outcome",
      domain: "ops",
    });

    const promoted = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "LIVE",
    });
    expect(promoted.run.os_run_id).toBeTruthy();

    adapter.setRunStatus(promoted.run.os_run_id!, "failed");

    const synced = await engine.syncLiveRun(shadow.goal.id);
    expect(synced.updated).toBe(true);
    expect(synced.run?.status).toBe("failed");
    expect(synced.goal.status).toBe("blocked");

    const evidence = engine.evidence.chainForGoal(shadow.goal.id);
    expect(evidence.some((e) => e.payload_summary.includes("OS reported failure"))).toBe(true);
  });

  it("subscribeRun reaches terminal status on mock", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const started = await adapter.startRun({
      tool_id: "os.runtime.start_run",
      input: {},
      domain: "ops",
      mode: "shadow",
      idempotency_key: "sub-1",
      correlation: {
        jarvis_goal_id: "g",
        jarvis_task_id: "t",
        jarvis_run_id: "r",
        decision_id: "d",
        principal_id: "h",
        delegation_chain: ["h"],
        mode: "shadow",
        policy_verdict_id: "v",
      },
    });
    // Shadow finishes terminal immediately (noop_shadow)
    const final = await adapter.subscribeRun!(started.os_run_id, () => undefined, {
      interval_ms: 5,
      timeout_ms: 200,
    });
    expect(final?.status).toBe("noop_shadow");
  });
});
