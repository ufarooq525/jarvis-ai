import { describe, expect, it } from "vitest";
import { GoalEngine } from "../goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import {
  describeEvidenceNode,
  validateEvidenceChain,
  validateRunHonesty,
} from "./integrity.js";
import type { EvidenceNode } from "../types/model.js";
import { SHADOW_SIMULATED_NOTICE } from "../goal-engine/verifier.js";

describe("Phase 3 — evidence integrity & attribution", () => {
  it("shadow loop evidence links task/action/decision and passes integrity", async () => {
    const engine = new GoalEngine(new MockOsRuntimeAdapter());
    const result = await engine.runShadowLoop({
      outcome: "Phase 3 evidence attribution outcome",
      domain: "ops",
    });

    const chain = engine.evidence.chainForGoal(result.goal.id);
    const report = validateEvidenceChain(chain);
    expect(report.ok).toBe(true);

    const toolNodes = chain.filter((n) => n.kind === "tool_invocation" || n.kind === "simulation");
    expect(toolNodes.length).toBeGreaterThan(0);
    for (const n of toolNodes) {
      expect(n.task_id).toBeTruthy();
      expect(n.action_id).toBeTruthy();
      expect(n.simulated).toBe(true);
      expect(n.correlation?.decision_id).toBe(result.decision_id);
      expect(n.correlation?.tool_id).toBeTruthy();
      expect(n.correlation?.jarvis_task_id).toBe(n.task_id);
    }

    // Simulation + invocation for same attempt share action_id
    const byAction = new Map<string, EvidenceNode[]>();
    for (const n of toolNodes) {
      const list = byAction.get(n.action_id!) ?? [];
      list.push(n);
      byAction.set(n.action_id!, list);
    }
    expect([...byAction.values()].some((g) => g.length >= 2)).toBe(true);

    const runsReport = validateRunHonesty(result.runs);
    expect(runsReport.ok).toBe(true);
    expect(result.runs.every((r) => r.status === "simulated" || r.status === "succeeded")).toBe(
      true,
    );
    expect(result.runs.every((r) => r.mode === "shadow")).toBe(true);

    const journal = engine.journal.get(result.decision_id);
    expect(journal?.assumptions?.length).toBeGreaterThan(0);
    expect(journal?.verification_passed).toBe(true);

    const attr = describeEvidenceNode(toolNodes[0]!);
    expect(attr.task_id).toBeTruthy();
    expect(attr.action_id).toBeTruthy();
    expect(attr.simulated).toContain("SIMULATED");
  });

  it("flags fabricated claims on simulated nodes", () => {
    const bad: EvidenceNode[] = [
      {
        id: "ev_1",
        goal_id: "g1",
        kind: "stimulus",
        at: new Date().toISOString(),
        principal_id: "Human",
        payload_summary: "start",
      },
      {
        id: "ev_2",
        prev_id: "ev_1",
        goal_id: "g1",
        kind: "tool_invocation",
        at: new Date().toISOString(),
        principal_id: "JARVIS",
        payload_summary: "successfully performed an external action",
        simulated: true,
      },
    ];
    const report = validateEvidenceChain(bad);
    expect(report.ok).toBe(false);
    expect(report.issues.some((i) => i.code === "fabricated_claim")).toBe(true);
  });

  it("tool invocation includes SIMULATED notice in Shadow", async () => {
    const engine = new GoalEngine(new MockOsRuntimeAdapter());
    const result = await engine.runShadowLoop({
      outcome: "Phase 3 simulated notice on tools",
    });
    const chain = JSON.parse(result.evidence_json) as EvidenceNode[];
    const inv = chain.filter((n) => n.kind === "tool_invocation");
    expect(inv.every((n) => n.simulated === true)).toBe(true);
    expect(inv.some((n) => n.payload_summary.includes(SHADOW_SIMULATED_NOTICE))).toBe(true);
  });
});
