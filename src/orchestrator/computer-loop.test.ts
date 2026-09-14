import { describe, expect, it, beforeEach } from "vitest";
import { GoalEngine } from "../goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { ModelRouter } from "../model-router/router.js";
import { resetFactStore } from "../world-model/fact-store.js";
import { COMPUTER_SIMULATED_NOTICE } from "../computer/types.js";
import type { OperatorPlan } from "../decision/plan.js";

function routerFor(plan: OperatorPlan): ModelRouter {
  return new ModelRouter(undefined, async () => ({ ok: true, text: JSON.stringify(plan) }));
}

describe("Phase 2 — ComputerRuntime on Orchestrator", () => {
  beforeEach(() => {
    resetFactStore();
  });

  it("executes observe/locate/shadow-open through the operator loop under policy", async () => {
    const plan: OperatorPlan = {
      steps: [
        {
          capability_id: "computer.observe.snapshot",
          inputs: {},
          reason: "Observe",
          expected_result: "snapshot",
          verification: "snapshot",
        },
        {
          capability_id: "computer.locate",
          inputs: { target_id: "notepad" },
          reason: "Locate notepad",
          expected_result: "found",
          verification: "found",
        },
        {
          capability_id: "computer.open_app",
          inputs: { target_id: "notepad" },
          reason: "Open notepad",
          expected_result: "shadow open",
          verification: "verified",
        },
      ],
    };
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { modelRouter: routerFor(plan) });
    const result = await engine.runShadowLoop({ outcome: "Open Notepad." });
    expect(result.verification.passed).toBe(true);
    expect(result.goal.status).toBe("done");
    expect(result.evidence_json).toContain("policy_verdict");
    expect(result.message).toContain("SIMULATED");
    const openRun = result.runs.find((r) => r.tool_invocations.includes("computer.open_app"));
    expect(openRun?.status).toBe("simulated");
    expect(COMPUTER_SIMULATED_NOTICE).toContain("SIMULATED");
  });

  it("types into Notepad only after shadow-open, still simulated", async () => {
    const plan: OperatorPlan = {
      steps: [
        {
          capability_id: "computer.open_app",
          inputs: { target_id: "notepad" },
          reason: "Open notepad",
          expected_result: "opened",
          verification: "open",
        },
        {
          capability_id: "computer.type_text",
          inputs: { target_id: "notepad", text: "Hello from Jarvis" },
          reason: "Type greeting",
          expected_result: "keystrokes simulated",
          verification: "shadow type",
        },
      ],
    };
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { modelRouter: routerFor(plan) });
    const result = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis",
    });
    expect(result.goal.status).toBe("done");
    const typed = result.runs.find((r) => r.tool_invocations.includes("computer.type_text"));
    expect(typed?.status).toBe("simulated");
    expect(result.evidence_json).toContain("computer.type_text");
    expect(result.evidence_json).toContain("Shadow type verified");
  });

  it("blocks type_text without a prior open_app", async () => {
    const plan: OperatorPlan = {
      steps: [
        {
          capability_id: "computer.type_text",
          inputs: { target_id: "notepad", text: "nope" },
          reason: "Type without open",
          expected_result: "should fail",
          verification: "prior_open",
        },
      ],
    };
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { modelRouter: routerFor(plan) });
    const result = await engine.runShadowLoop({ outcome: "Type into Notepad" });
    expect(result.goal.status).toBe("blocked");
    expect(result.runs.some((r) => r.status === "failed")).toBe(true);
  });
});
