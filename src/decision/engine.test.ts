import { describe, expect, it } from "vitest";
import { DecisionEngine } from "./engine.js";
import { normalizeOutcome } from "../goal-engine/normalize.js";
import type { OperatorContext } from "./types.js";
import type { Goal, Task } from "../types/model.js";

function goal(partial: Partial<Goal> = {}): Goal {
  const now = new Date().toISOString();
  return {
    id: "goal_1",
    title: "t",
    outcome: "o",
    domain: "ops",
    status: "active",
    priority: 1,
    trust_tier: "SHADOW",
    autonomy_ceiling: 1,
    mode: "shadow",
    key_results: [{ id: "kr1", label: "e", metric_ref: "evidence.chain.length", target: 1, current: 1 }],
    owner_principal_id: "Human(Umer)",
    created_at: now,
    updated_at: now,
    ...partial,
  };
}

function ctx(over: Partial<OperatorContext>): OperatorContext {
  const g = over.goal ?? goal();
  return {
    goal: g,
    objectives: [],
    tasks: [],
    runs: [],
    evidence: [],
    facts: [],
    opportunity_count: 0,
    capabilities: [],
    previous_decisions: [],
    journal: [],
    normalized: over.normalized ?? normalizeOutcome({ outcome: g.outcome, domain: g.domain }),
    attempted_capability_ids: [],
    ...over,
  };
}

describe("DecisionEngine", () => {
  const engine = new DecisionEngine();

  it("inspects OS state first when that task is ready", () => {
    const inspect: Task = {
      id: "task_inspect",
      parent_id: "obj",
      goal_id: "goal_1",
      title: "inspect",
      intent: "i",
      status: "ready",
      assignee_kind: "jarvis_internal",
      tool_ids: ["os.runtime.get_state"],
      idempotency_key: "k-inspect",
    };
    const d = engine.decideNext(ctx({ tasks: [inspect] }));
    expect(d.decision).toBe("execute");
    expect(d.selected_capability).toBe("os.runtime.get_state");
  });

  it("selects browser.research for research plan after inspect is done", () => {
    const inspect: Task = {
      id: "task_inspect",
      parent_id: "obj",
      goal_id: "goal_1",
      title: "inspect",
      intent: "i",
      status: "done",
      assignee_kind: "jarvis_internal",
      tool_ids: ["os.runtime.get_state"],
      idempotency_key: "k-inspect",
    };
    const research: Task = {
      id: "task_research",
      parent_id: "obj",
      goal_id: "goal_1",
      title: "research",
      intent: "r",
      status: "ready",
      assignee_kind: "jarvis_internal",
      tool_ids: ["browser.research"],
      idempotency_key: "k-research",
    };
    const d = engine.decideNext(
      ctx({
        goal: goal({
          domain: "sales",
          outcome: "Find 10 Laravel SaaS opportunities in Saudi Arabia.",
          key_results: [
            { id: "kr1", label: "e", metric_ref: "evidence.chain.length", target: 1, current: 3 },
            { id: "kr2", label: "ops", metric_ref: "research.opportunity_count", target: 10, current: 0 },
          ],
        }),
        tasks: [inspect, research],
        normalized: normalizeOutcome({
          outcome: "Find 10 Laravel SaaS opportunities in Saudi Arabia.",
        }),
      }),
    );
    expect(d.decision).toBe("execute");
    expect(d.selected_capability).toBe("browser.research");
    expect(d.input?.url).toContain("wikipedia.org/wiki/Laravel");
  });

  it("blocks when research was attempted and opportunity KR is unmet", () => {
    const inspect: Task = {
      id: "task_inspect",
      parent_id: "obj",
      goal_id: "goal_1",
      title: "inspect",
      intent: "i",
      status: "done",
      assignee_kind: "jarvis_internal",
      tool_ids: ["os.runtime.get_state"],
      idempotency_key: "k-inspect",
    };
    const research: Task = {
      id: "task_research",
      parent_id: "obj",
      goal_id: "goal_1",
      title: "research",
      intent: "r",
      status: "done",
      assignee_kind: "jarvis_internal",
      tool_ids: ["browser.research"],
      idempotency_key: "k-research",
    };
    const d = engine.decideNext(
      ctx({
        goal: goal({
          domain: "sales",
          outcome: "Find 10 Laravel SaaS opportunities in Saudi Arabia.",
          key_results: [
            { id: "kr2", label: "ops", metric_ref: "research.opportunity_count", target: 10, current: 0 },
          ],
        }),
        tasks: [inspect, research],
        runs: [
          {
            id: "run_b",
            task_id: "task_research",
            goal_id: "goal_1",
            decision_id: "dec",
            principal_id: "JARVIS",
            delegation_chain: [],
            mode: "shadow",
            policy_verdict_id: "v",
            status: "simulated",
            tool_invocations: ["browser.research", "wm.facts.upsert", "ops.opportunity.create"],
          },
        ],
        attempted_capability_ids: ["browser.research", "wm.facts.upsert", "ops.opportunity.create"],
        opportunity_count: 0,
        normalized: normalizeOutcome({
          outcome: "Find 10 Laravel SaaS opportunities in Saudi Arabia.",
        }),
      }),
    );
    expect(d.decision).toBe("block");
    expect(d.reason).toMatch(/opportunity_count=0/i);
  });
});
