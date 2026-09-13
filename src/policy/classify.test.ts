import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { classifyProposal } from "./classify.js";
import type { Goal, ToolManifest } from "../types/model.js";
import { PHASE1_MANIFESTS, ToolRegistry, defaultManifestTrust } from "../tools/registry.js";
import { GoalEngine } from "../goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { engageKillSwitch, clearKillSwitch } from "../kill-switch.js";

function baseGoal(over: Partial<Goal> = {}): Goal {
  const now = new Date().toISOString();
  return {
    id: "goal_test",
    title: "t",
    outcome: "o",
    domain: "ops",
    status: "active",
    priority: 1,
    trust_tier: "LIMITED",
    autonomy_ceiling: 2,
    mode: "live",
    key_results: [],
    owner_principal_id: "Human",
    created_at: now,
    updated_at: now,
    ...over,
  };
}

function manifest(tool_id: string): ToolManifest {
  return PHASE1_MANIFESTS.find((m) => m.tool_id === tool_id)!;
}

describe("policy classify — Phase 2", () => {
  afterEach(() => clearKillSwitch());

  it("shadow path stays automatic for write tools", () => {
    const v = classifyProposal({
      goal: baseGoal({ mode: "shadow", trust_tier: "SHADOW" }),
      manifest: manifest("os.runtime.start_run"),
      tool_id: "os.runtime.start_run",
    });
    expect(v.class).toBe("automatic");
  });

  it("live write requires approval when trust/autonomy allow", () => {
    const v = classifyProposal({
      goal: baseGoal({ mode: "live", trust_tier: "LIMITED", autonomy_ceiling: 2 }),
      manifest: manifest("os.runtime.start_run"),
      tool_id: "os.runtime.start_run",
    });
    expect(v.class).toBe("approval_required");
  });

  it("irreversible / strong_confirmation tools need strong confirm in Live", () => {
    const v = classifyProposal({
      goal: baseGoal({ mode: "live", trust_tier: "APPROVED", autonomy_ceiling: 4 }),
      manifest: manifest("computer.act.click"),
      tool_id: "computer.act.click",
    });
    expect(v.class).toBe("strong_confirmation");
  });

  it("publish/send effects require strong confirm", () => {
    const pub: ToolManifest = {
      ...manifest("os.runtime.start_run"),
      tool_id: "demo.publish",
      effects: ["write", "publish"],
      approval_requirement: "none",
      risk_level: "high",
      required_trust_tier: "APPROVED",
      required_autonomy: 0,
    };
    const v = classifyProposal({
      goal: baseGoal({ mode: "live", trust_tier: "APPROVED", autonomy_ceiling: 4 }),
      manifest: pub,
      tool_id: pub.tool_id,
    });
    expect(v.class).toBe("strong_confirmation");
  });

  it("kill switch rejects Live", () => {
    engageKillSwitch("test");
    const v = classifyProposal({
      goal: baseGoal({ mode: "live", trust_tier: "APPROVED" }),
      manifest: manifest("os.runtime.get_state"),
      tool_id: "os.runtime.get_state",
    });
    expect(v.class).toBe("reject");
  });

  it("rejects when trust tier below manifest minimum", () => {
    const v = classifyProposal({
      goal: baseGoal({ mode: "live", trust_tier: "SHADOW", autonomy_ceiling: 4 }),
      // SHADOW trust_tier forces shadowBound automatic — use LIMITED goal with too-low tier vs APPROVED tool
      manifest: manifest("computer.act.click"),
      tool_id: "computer.act.click",
    });
    // trust_tier SHADOW → shadowBound → automatic. Use LIMITED vs APPROVED tool:
    const v2 = classifyProposal({
      goal: baseGoal({ mode: "live", trust_tier: "LIMITED", autonomy_ceiling: 4 }),
      manifest: manifest("computer.act.click"),
      tool_id: "computer.act.click",
    });
    expect(v2.class).toBe("reject");
    void v;
  });
});

describe("policy bypass guards", () => {
  beforeEach(() => clearKillSwitch());
  afterEach(() => clearKillSwitch());

  it("dispatch refuses unknown tools", async () => {
    const engine = new GoalEngine(new MockOsRuntimeAdapter());
    const result = await engine.runShadowLoop({ outcome: "bypass unknown tool setup" });
    const task = [...engine.store.tasks.values()].find((t) => t.goal_id === result.goal.id)!;
    await expect(
      engine.bridge.dispatchTask({
        goal: result.goal,
        task,
        decision_id: result.decision_id,
        tool_id: "no.such.tool",
      }),
    ).rejects.toThrow(/not registered/i);
  });

  it("dispatchLiveApproved refuses SHADOW goals", async () => {
    const engine = new GoalEngine(new MockOsRuntimeAdapter());
    const result = await engine.runShadowLoop({ outcome: "live refuse shadow omega" });
    const task = [...engine.store.tasks.values()].find(
      (t) => t.goal_id === result.goal.id && t.tool_ids.includes("os.runtime.start_run"),
    )!;
    await expect(
      engine.bridge.dispatchLiveApproved({
        goal: result.goal,
        task: { ...task, idempotency_key: `${task.idempotency_key}:live-try` },
        decision_id: result.decision_id,
        tool_id: "os.runtime.start_run",
      }),
    ).rejects.toThrow(/SHADOW|live mode/i);
  });

  it("new registered tools default to SHADOW min trust", () => {
    const reg = new ToolRegistry([]);
    expect(defaultManifestTrust()).toBe("SHADOW");
    reg.register({
      ...manifest("os.runtime.get_state"),
      tool_id: "custom.new.tool",
      required_trust_tier: "SHADOW",
    });
    expect(reg.require("custom.new.tool").required_trust_tier).toBe("SHADOW");
  });
});
