import { describe, expect, it, beforeEach } from "vitest";
import { GoalEngine } from "../goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { ModelRouter } from "../model-router/router.js";
import { resetFactStore, getFactStore } from "../world-model/fact-store.js";
import { resetOpportunityStore } from "../ops/opportunity-store.js";
import type { OperatorPlan } from "./plan.js";

function routerFor(plan: OperatorPlan): ModelRouter {
  const json = JSON.stringify(plan);
  return new ModelRouter(undefined, async () => ({ ok: true, text: json }));
}

describe("Phase 1 — model intent on the operator loop", () => {
  beforeEach(() => {
    resetFactStore();
    resetOpportunityStore();
  });

  it("same free-text goal twice yields a stable capability sequence", async () => {
    const plan: OperatorPlan = {
      steps: [
        {
          capability_id: "computer.observe.snapshot",
          inputs: {},
          reason: "Observe host",
          expected_result: "snapshot",
          verification: "snapshot recorded",
        },
        {
          capability_id: "computer.locate",
          inputs: { target_id: "notepad" },
          reason: "Find Notepad",
          expected_result: "located",
          verification: "locate.found",
        },
        {
          capability_id: "computer.open_app",
          inputs: { target_id: "notepad" },
          reason: "Open Notepad",
          expected_result: "shadow open",
          verification: "verifyShadowOpen",
        },
      ],
    };
    const outcome = "Open Notepad on this computer.";
    const run = () =>
      new GoalEngine(new MockOsRuntimeAdapter(), { modelRouter: routerFor(plan) }).runShadowLoop({
        outcome,
      });

    const a = await run();
    const b = await run();
    const seq = (r: typeof a) =>
      (r.decisions ?? [])
        .filter((d) => d.decision === "execute")
        .map((d) => d.selected_capability);

    expect(a.goal.plan_source).toBe("model");
    expect(seq(a)).toEqual([
      "computer.observe.snapshot",
      "computer.locate",
      "computer.open_app",
    ]);
    expect(seq(b)).toEqual(seq(a));
    expect(a.runs.some((r) => r.tool_invocations.includes("computer.open_app"))).toBe(true);
    expect(a.runs.some((r) => r.tool_invocations.includes("os.runtime.start_run"))).toBe(false);
    expect(a.operator_report?.plan_source).toBe("model");
  });

  it("falls back to deterministic decomposer on invalid model output", async () => {
    const bad = new ModelRouter(undefined, async () => ({
      ok: true,
      text: "I think you should maybe open something",
    }));
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { modelRouter: bad });
    const result = await engine.runShadowLoop({
      outcome: "Produce a weekly company overview plan",
      domain: "ops",
    });
    expect(result.goal.plan_source).toBe("fallback");
    expect(result.runs.some((r) => r.tool_invocations.includes("os.runtime.get_state"))).toBe(true);
    expect(result.runs.some((r) => r.tool_invocations.includes("os.runtime.start_run"))).toBe(true);
  });

  it("selects knowledge.pdf.read for a PDF summary goal without a plan_kind branch", async () => {
    const plan: OperatorPlan = {
      steps: [
        {
          capability_id: "knowledge.pdf.read",
          inputs: { path: "C:\\docs\\notes.pdf" },
          reason: "Read the PDF and store important points",
          expected_result: "observation facts",
          verification: "facts stored",
        },
      ],
    };
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), {
      modelRouter: routerFor(plan),
      pdf_loader: async () => ({
        bytes: new Uint8Array([1, 2, 3]),
        source: "file:C:\\docs\\notes.pdf",
      }),
      pdf_extractor: () =>
        "Hiring locally in Riyadh matters. Document retention is required for audits. Pricing should stay transparent.",
    });
    const result = await engine.runShadowLoop({
      outcome: "Read this PDF and summarize the important points",
    });
    expect(result.goal.plan_source).toBe("model");
    expect(result.normalized.plan_kind).not.toBe("pdf");
    expect(result.runs.some((r) => r.tool_invocations.includes("knowledge.pdf.read"))).toBe(true);
    const facts = getFactStore().listFacts({ goal_id: result.goal.id });
    expect(facts.length).toBeGreaterThan(0);
    expect(facts.every((f) => f.source === "knowledge.pdf.read")).toBe(true);
    expect(facts.every((f) => f.kind === "observation")).toBe(true);
  });
});
