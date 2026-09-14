import type { AgentRun, Goal, GoalStatus, Task } from "../types/model.js";
import type { ComputerActionRecord } from "../computer/types.js";
import type { OperatorDecision } from "./types.js";

export interface OperatorReport {
  summary: string;
  plan_source: "model" | "fallback";
  steps: Array<{
    capability_id: string;
    ok: boolean;
    observation: string;
  }>;
  verification: string;
  outcome: GoalStatus;
  opened?: string;
  typed?: string;
  observed?: string;
}

export function buildOperatorReport(input: {
  goal: Goal;
  tasks: Task[];
  runs: AgentRun[];
  decisions: OperatorDecision[];
  verification_summary: string;
  computer?: {
    open?: ComputerActionRecord;
    type?: ComputerActionRecord;
  };
}): OperatorReport {
  const steps = input.tasks.map((t) => {
    const cap = t.tool_ids[0] ?? "unknown";
    const run = [...input.runs].reverse().find((r) => r.task_id === t.id);
    const ok = t.status === "done" && run?.status !== "failed";
    return {
      capability_id: cap,
      ok,
      observation: `${t.status}${run ? ` / run ${run.status}` : ""} — ${t.intent}`,
    };
  });

  const opened = describeOpened(input);
  const typed = describeTyped(input);
  const observed = describeObserved(input);

  const last = input.decisions[input.decisions.length - 1];
  const computerSummary =
    opened || typed
      ? [opened, typed, observed].filter(Boolean).join(" ")
      : undefined;
  const summary =
    computerSummary ??
    last?.reason ??
    (input.goal.status === "done"
      ? "Goal finished after planned steps."
      : input.goal.status === "blocked"
        ? "Goal blocked — outcome not verified."
        : "Goal still in progress.");

  return {
    summary,
    plan_source: input.goal.plan_source ?? "fallback",
    steps,
    verification: input.verification_summary,
    outcome: input.goal.status,
    opened,
    typed,
    observed,
  };
}

function describeOpened(input: {
  tasks: Task[];
  computer?: { open?: ComputerActionRecord; type?: ComputerActionRecord };
}): string | undefined {
  const openTask = input.tasks.find((t) => t.tool_ids.includes("computer.open_app"));
  if (!openTask) return undefined;
  const target = String(input.computer?.open?.target_id ?? openTask.input?.target_id ?? "app");
  const action = input.computer?.open;
  if (action?.mode === "live" && action.pid) {
    return `Opened ${target} (pid ${action.pid}).`;
  }
  if (action?.simulated) {
    return `Would open ${target} (simulated — app was not launched).`;
  }
  return `Open ${target}: ${openTask.status}.`;
}

function describeTyped(input: {
  tasks: Task[];
  computer?: { open?: ComputerActionRecord; type?: ComputerActionRecord };
}): string | undefined {
  const typeTask = input.tasks.find((t) => t.tool_ids.includes("computer.type_text"));
  if (!typeTask) return undefined;
  const text = String(input.computer?.type?.intended_text ?? typeTask.input?.text ?? "");
  const action = input.computer?.type;
  if (action?.mode === "live" && action.keystrokes_sent) {
    return `Typed ${JSON.stringify(text)} into that window.`;
  }
  if (action?.mode === "live") {
    return `Did not type ${JSON.stringify(text)} — target window was not identified (no keystrokes sent).`;
  }
  if (action?.simulated || action?.keystrokes_sent === false) {
    return `Would type ${JSON.stringify(text)} (no keystrokes sent).`;
  }
  return `Type ${JSON.stringify(text)}: ${typeTask.status}.`;
}

function describeObserved(input: {
  goal: Goal;
  computer?: { open?: ComputerActionRecord; type?: ComputerActionRecord };
}): string | undefined {
  const action = input.computer?.type;
  if (!action) {
    return input.goal.status === "blocked"
      ? "Observed: type step did not verify."
      : undefined;
  }
  if (action.simulated) {
    return "Observed: Shadow simulation only — process/window were not started; text was not read back.";
  }
  const bits = [
    action.pid ? `process pid=${action.pid}` : "process not identified",
    action.hwnd ? `window hwnd=${action.hwnd}` : "window not identified",
    action.text_readback_feasible
      ? `text read-back ${JSON.stringify(action.readback ?? "")}`
      : "text-content read-back not feasible",
  ];
  return `Observed: ${bits.join("; ")}.`;
}
