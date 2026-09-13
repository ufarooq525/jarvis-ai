import type { GoalStatus, TaskStatus } from "../types/model.js";

/** Explicit goal lifecycle edges — illegal transitions throw. */
const GOAL_TRANSITIONS: Record<GoalStatus, readonly GoalStatus[]> = {
  draft: ["active", "cancelled"],
  active: ["blocked", "done", "cancelled"],
  blocked: ["active", "cancelled", "done"],
  /** Reopen for Live promote or replan after verified Shadow completion. */
  done: ["active"],
  cancelled: [],
};

/** Explicit task lifecycle edges — illegal transitions throw. */
const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  pending: ["ready", "cancelled"],
  ready: ["running", "waiting_approval", "cancelled", "done", "failed"],
  running: ["done", "failed", "cancelled", "waiting_approval"],
  waiting_approval: ["ready", "running", "cancelled", "failed"],
  done: [],
  failed: ["ready", "cancelled"], // retry / replan / cancel
  cancelled: [],
};

export function canTransitionGoal(from: GoalStatus, to: GoalStatus): boolean {
  if (from === to) return true;
  return GOAL_TRANSITIONS[from].includes(to);
}

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  if (from === to) return true;
  return TASK_TRANSITIONS[from].includes(to);
}

export function assertGoalTransition(from: GoalStatus, to: GoalStatus): void {
  if (!canTransitionGoal(from, to)) {
    throw new Error(`Illegal goal transition: ${from} → ${to}`);
  }
}

export function assertTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (!canTransitionTask(from, to)) {
    throw new Error(`Illegal task transition: ${from} → ${to}`);
  }
}
