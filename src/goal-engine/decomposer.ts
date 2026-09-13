import type { Goal, Objective, Task } from "../types/model.js";
import { newId, nowIso } from "../util/ids.js";
import type { MemoryStore } from "../store/memory-store.js";
import type { NormalizedOutcome } from "./normalize.js";

/** Deterministic decomposer (no LLM) — templates keyed by normalized plan_kind. */
export function decomposeGoal(
  store: MemoryStore,
  goal: Goal,
  normalized?: NormalizedOutcome,
): { objectives: Objective[]; tasks: Task[] } {
  const plan_kind = normalized?.plan_kind ?? "general";
  const constraints =
    normalized?.constraints?.length ? ` [${normalized.constraints.join("; ")}]` : "";

  const objTitle =
    plan_kind === "research"
      ? `Research: ${goal.title}`
      : plan_kind === "ops"
        ? `Operate: ${goal.title}`
        : `Achieve: ${goal.title}`;

  const success =
    plan_kind === "research" && normalized?.target_count != null
      ? `${goal.outcome} — deliver ${normalized.target_count} qualifying items in Shadow (no external action)`
      : goal.outcome;

  const obj: Objective = {
    id: newId("obj"),
    goal_id: goal.id,
    title: objTitle,
    success_criteria: success + constraints,
    status: "active",
    order: 1,
  };
  store.saveObjective(obj);

  const inspect: Task = {
    id: newId("task"),
    parent_id: obj.id,
    goal_id: goal.id,
    title: "Inspect current OS/workforce state",
    intent: "Avoid duplicate work via StateInspector",
    status: "ready",
    assignee_kind: "jarvis_internal",
    tool_ids: ["os.runtime.get_state"],
    idempotency_key: `${goal.id}:inspect`,
  };

  const dispatchTitle =
    plan_kind === "research"
      ? "Propose OS research/agent run (shadow)"
      : "Propose OS agent run (shadow)";

  const dispatchIntent =
    plan_kind === "research"
      ? `Shadow research plan for: ${goal.outcome}${constraints}`
      : `Advance outcome: ${goal.outcome}`;

  const dispatch: Task = {
    id: newId("task"),
    parent_id: obj.id,
    goal_id: goal.id,
    title: dispatchTitle,
    intent: dispatchIntent,
    status: "ready",
    assignee_kind: "os_agent",
    tool_ids: ["os.runtime.start_run"],
    idempotency_key: `${goal.id}:start_run`,
  };

  store.saveTask(inspect);
  store.saveTask(dispatch);

  goal.updated_at = nowIso();
  store.saveGoal(goal);

  return { objectives: [obj], tasks: [inspect, dispatch] };
}
