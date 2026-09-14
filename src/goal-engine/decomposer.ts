import type { Goal, Objective, Task } from "../types/model.js";
import { newId, nowIso } from "../util/ids.js";
import type { MemoryStore } from "../store/memory-store.js";
import { COMPUTER_TYPE_PLAN_KIND } from "./computer-type.js";
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
      : plan_kind === COMPUTER_TYPE_PLAN_KIND
        ? `Computer: ${goal.title}`
        : plan_kind === "ops"
          ? `Operate: ${goal.title}`
          : `Achieve: ${goal.title}`;

  const success =
    plan_kind === "research" && normalized?.target_count != null
      ? `${goal.outcome} — deliver ${normalized.target_count} qualifying items in Shadow (no external action)`
      : plan_kind === COMPUTER_TYPE_PLAN_KIND
        ? `${goal.outcome} — open the allowlisted app, type into that window, verify process/window/text (do not substitute OS start_run)`
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

  if (plan_kind === COMPUTER_TYPE_PLAN_KIND) {
    return decomposeComputerType(store, goal, obj, normalized);
  }

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

  store.saveTask(inspect);

  if (plan_kind === "research") {
    const research: Task = {
      id: newId("task"),
      parent_id: obj.id,
      goal_id: goal.id,
      title: "Observe allowlisted sources (shadow research)",
      intent: `Observe sources for: ${goal.outcome}${constraints}`,
      status: "ready",
      assignee_kind: "jarvis_internal",
      tool_ids: ["browser.research"],
      idempotency_key: `${goal.id}:browser.research`,
    };
    store.saveTask(research);
    goal.plan_source = goal.plan_source ?? "fallback";
    goal.updated_at = nowIso();
    store.saveGoal(goal);
    return { objectives: [obj], tasks: [inspect, research] };
  }

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

  store.saveTask(dispatch);

  goal.plan_source = goal.plan_source ?? "fallback";
  goal.updated_at = nowIso();
  store.saveGoal(goal);

  return { objectives: [obj], tasks: [inspect, dispatch] };
}

/** Distinct narrow template — removable once real intent planning covers this case. */
function decomposeComputerType(
  store: MemoryStore,
  goal: Goal,
  obj: Objective,
  normalized?: NormalizedOutcome,
): { objectives: Objective[]; tasks: Task[] } {
  const target_id = normalized?.computer_target_id ?? "notepad";
  const text = normalized?.type_text ?? "";
  const open: Task = {
    id: newId("task"),
    parent_id: obj.id,
    goal_id: goal.id,
    title: `Open ${target_id}`,
    intent: `Launch allowlisted ${target_id} (Shadow simulate / Live OPEN)`,
    status: "ready",
    assignee_kind: "computer",
    tool_ids: ["computer.open_app"],
    idempotency_key: `${goal.id}:computer.open_app`,
    input: { target_id },
  };
  const type: Task = {
    id: newId("task"),
    parent_id: obj.id,
    goal_id: goal.id,
    title: `Type into ${target_id}`,
    intent: text
      ? `Type ${JSON.stringify(text)} into the window from the preceding open`
      : "Type text into the window from the preceding open",
    status: "ready",
    assignee_kind: "computer",
    tool_ids: ["computer.type_text"],
    idempotency_key: `${goal.id}:computer.type_text`,
    input: { target_id, text },
  };
  store.saveTask(open);
  store.saveTask(type);
  goal.plan_source = goal.plan_source ?? "fallback";
  goal.updated_at = nowIso();
  store.saveGoal(goal);
  return { objectives: [obj], tasks: [open, type] };
}
