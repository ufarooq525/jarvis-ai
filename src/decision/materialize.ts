import type { Goal, Objective, Task } from "../types/model.js";
import { newId, nowIso } from "../util/ids.js";
import type { MemoryStore } from "../store/memory-store.js";
import type { OperatorPlan } from "./plan.js";

function assigneeFor(capability_id: string): Task["assignee_kind"] {
  if (capability_id.startsWith("computer.")) return "computer";
  if (capability_id.startsWith("os.runtime.start_run")) return "os_agent";
  return "jarvis_internal";
}

/** Turn a validated model plan into objectives + tasks. Does not invent extra template steps. */
export function materializePlan(
  store: MemoryStore,
  goal: Goal,
  plan: OperatorPlan,
): { objectives: Objective[]; tasks: Task[] } {
  const obj: Objective = {
    id: newId("obj"),
    goal_id: goal.id,
    title: `Plan: ${goal.title}`,
    success_criteria: goal.outcome,
    status: "active",
    order: 1,
  };
  store.saveObjective(obj);

  const tasks: Task[] = plan.steps.map((step, index) => {
    const task: Task = {
      id: newId("task"),
      parent_id: obj.id,
      goal_id: goal.id,
      title: step.reason.slice(0, 120),
      intent: step.expected_result || step.reason,
      status: "ready",
      assignee_kind: assigneeFor(step.capability_id),
      tool_ids: [step.capability_id],
      idempotency_key: `${goal.id}:plan:${index}:${step.capability_id}`,
      input: step.inputs,
    };
    store.saveTask(task);
    return task;
  });

  goal.plan_source = "model";
  goal.updated_at = nowIso();
  store.saveGoal(goal);
  return { objectives: [obj], tasks };
}
