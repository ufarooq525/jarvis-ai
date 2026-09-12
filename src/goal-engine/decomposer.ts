import type { Goal, Objective, Task } from "../types/model.js";
import { newId, nowIso } from "../util/ids.js";
import type { MemoryStore } from "../store/memory-store.js";

/** Deterministic decomposer (no LLM) for §16 thin slice. */
export function decomposeGoal(store: MemoryStore, goal: Goal): { objectives: Objective[]; tasks: Task[] } {
  const obj: Objective = {
    id: newId("obj"),
    goal_id: goal.id,
    title: `Achieve: ${goal.title}`,
    success_criteria: goal.outcome,
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

  const dispatch: Task = {
    id: newId("task"),
    parent_id: obj.id,
    goal_id: goal.id,
    title: "Propose OS agent run (shadow)",
    intent: `Advance outcome: ${goal.outcome}`,
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
