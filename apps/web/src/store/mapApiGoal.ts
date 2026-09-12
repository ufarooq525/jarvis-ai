import type { GoalDetailResponse, TaskRow } from "../api";
import type { Domain, Effect, Goal, Stage, Step } from "./types";
import { nowStr } from "./types";

function asDomain(d: string): Domain {
  if (d === "ops" || d === "comms" || d === "finance" || d === "data") return d;
  return "general";
}

function formatAt(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return nowStr();
    const h = d.getHours();
    const m = d.getMinutes();
    return `${h % 12 || 12}:${m < 10 ? "0" : ""}${m} ${h < 12 ? "AM" : "PM"}`;
  } catch {
    return nowStr();
  }
}

function taskEffect(task: TaskRow): Effect {
  const tools = (task.tool_ids ?? []).join(" ");
  if (/start_run|write|send|delete|push/i.test(tools) || /write|send|mutate/i.test(task.intent ?? "")) {
    return "writes";
  }
  if (/get_state|list|read|inspect/i.test(tools) || /read|inspect|observe/i.test(task.intent ?? "")) {
    return "read";
  }
  return "compute";
}

export function mapTasksToSteps(tasks: TaskRow[]): Step[] {
  return tasks.map((t) => ({
    text: t.title,
    effect: taskEffect(t),
  }));
}

/** Phase A: Goal Engine Shadow plans land in the Shadow column until the user approves Live (local until Phase E). */
export function defaultStageFromApi(status: string, mode: string): Stage {
  if (status === "cancelled") return "discarded";
  if (mode === "live" && status === "active") return "live";
  if (status === "done" && mode === "live") return "done";
  // Shadow completed / active plans wait for human review
  return "shadow";
}

export function mapDetailToBoardGoal(
  detail: GoalDetailResponse,
  overlay?: Partial<Goal>,
): Goal {
  const g = detail.goal;
  const steps = mapTasksToSteps(detail.tasks ?? []);
  const writeN = steps.filter((s) => s.effect === "writes").length;
  const stage = overlay?.stage ?? defaultStageFromApi(g.status, g.mode);

  return {
    id: g.id,
    title: g.title,
    summary: g.outcome,
    domain: asDomain(g.domain),
    stage,
    at: formatAt(g.updated_at ?? new Date().toISOString()),
    steps,
    effects: {
      filesWritten: writeN,
      messagesSent: 0,
      deletes: "no",
      reversible: "yes — Shadow simulation only",
    },
    plannedAt: formatAt(g.updated_at ?? new Date().toISOString()),
    progress: overlay?.progress,
    approvedAt: overlay?.approvedAt,
    needsAttention: overlay?.needsAttention,
    leaving: overlay?.leaving,
    source: "api",
  };
}
