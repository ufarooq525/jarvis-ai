import { boardGoalIsComputerType } from "../store/mapApiGoal";
import type { Goal } from "../store/types";
import type { EscalationDto, GoalDetailResponse, WmNowDto } from "../api";

/** Human-facing operator states — derived from real goals / approvals, never invented. */
export type OperatorStateId =
  | "idle"
  | "thinking"
  | "planning"
  | "working"
  | "waiting"
  | "needs_approval"
  | "blocked"
  | "completed"
  | "failed";

export type OperatorSnapshot = {
  state: OperatorStateId;
  label: string;
  sentence: string;
  modeLabel: "Shadow" | "Live";
  modeHint: string;
  focusGoal: Goal | null;
  focusDetail?: string;
  nextAction: string | null;
};

export function hourGreeting(name = "Umer"): string {
  const h = new Date().getHours();
  const hi = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${hi}, ${name}`;
}

export function humanTool(id: string): string {
  if (id.includes("get_state")) return "Checked current workforce state";
  if (id.includes("start_run")) return "Proposed an OS run";
  if (id.includes("browser")) return "Used browser research";
  if (id.includes("pdf")) return "Read a PDF";
  if (id.includes("type_text")) return "Typed into an identified window";
  if (id.includes("open_app")) return "Opened an application";
  if (id.includes("computer")) return "Used computer capability";
  if (id.includes("wm.") || id.includes("fact")) return "Updated memory";
  return id.replace(/[._]/g, " ");
}

export function humanEvidenceKind(kind: string): string {
  const map: Record<string, string> = {
    stimulus: "You stated an outcome",
    observation: "Checked current state",
    decision: "Formed a plan",
    policy_verdict: "Checked policy and trust",
    simulation: "Simulated a step (no outside effect)",
    tool_invocation: "Ran a Shadow tool (no Live effect)",
    metric: "Recorded a measurement",
    expected_vs_actual: "Compared expected vs actual",
  };
  return map[kind] ?? kind.replace(/_/g, " ");
}

export function taskStatusMark(status: string): "done" | "current" | "todo" | "fail" {
  if (status === "succeeded" || status === "done" || status === "completed") return "done";
  if (status === "running" || status === "in_progress" || status === "active") return "current";
  if (status === "failed" || status === "cancelled") return "fail";
  return "todo";
}

export function deriveOperatorSnapshot(input: {
  goals: Goal[];
  mode: "shadow" | "live";
  pendingEscalations: EscalationDto[];
  now: WmNowDto | null;
  apiOk: boolean | null;
  killEngaged?: boolean;
}): OperatorSnapshot {
  const modeLabel = input.mode === "live" ? "Live" : "Shadow";
  const modeHint =
    input.mode === "live"
      ? "Actions may affect connected systems. Approval may still be required."
      : "Nothing reaches the outside world.";

  if (input.apiOk === false) {
    return {
      state: "blocked",
      label: "Blocked",
      sentence: "JARVIS API is offline — start the API on :3020 to continue.",
      modeLabel,
      modeHint,
      focusGoal: null,
      nextAction: "Start pnpm dev:api, then refresh.",
    };
  }

  if (input.killEngaged) {
    return {
      state: "blocked",
      label: "Blocked",
      sentence: "Emergency stop is on — Live actions are frozen.",
      modeLabel,
      modeHint,
      focusGoal: null,
      nextAction: "Turn emergency stop off in Settings when you are ready.",
    };
  }

  const stated = input.goals.filter((g) => g.stage === "stated");
  const shadow = input.goals.filter((g) => g.stage === "shadow");
  const live = input.goals.filter((g) => g.stage === "live");
  const failed = input.goals.filter((g) => g.stage === "failed");
  const done = input.goals.filter((g) => g.stage === "done");

  if (input.pendingEscalations.length > 0) {
    const e = input.pendingEscalations[0]!;
    const focus =
      input.goals.find((g) => g.id === e.goal_id) ??
      live[0] ??
      shadow[0] ??
      null;
    return {
      state: "needs_approval",
      label: "Needs approval",
      sentence: e.title
        ? `${e.title} — ${e.reason}`
        : e.reason || "A decision is waiting on you.",
      modeLabel,
      modeHint,
      focusGoal: focus,
      focusDetail: "Nothing has been sent until you confirm.",
      nextAction: "Review the approval and confirm or reject.",
    };
  }

  if (live.length > 0) {
    const g = live[0]!;
    return {
      state: "working",
      label: "Working",
      sentence: `Running Live on “${g.title}”.`,
      modeLabel,
      modeHint,
      focusGoal: g,
      focusDetail: g.summary,
      nextAction: "Open the goal to watch Live status and evidence.",
    };
  }

  if (stated.length > 0) {
    const g = stated[0]!;
    return {
      state: "thinking",
      label: "Thinking",
      sentence: `Working out the steps for “${g.title}”.`,
      modeLabel,
      modeHint,
      focusGoal: g,
      nextAction: "Wait a moment — a Shadow plan will appear for review.",
    };
  }

  if (shadow.length > 0) {
    const g = shadow[0]!;
    const computerType = boardGoalIsComputerType(g);
    return {
      state: "waiting",
      label: "Waiting",
      sentence: `Shadow plan ready for “${g.title}”. Nothing has run Live.`,
      modeLabel,
      modeHint,
      focusGoal: g,
      focusDetail: computerType
        ? "Simulated only — the app was not launched. Request Live and type OPEN to do it for real."
        : "This is a simulated plan. Review it before typing LIVE if you want real execution.",
      nextAction: computerType
        ? "Review the plan, then Request Live and type OPEN."
        : "Review the plan, then request Live only if you want real action.",
    };
  }

  if (failed.length > 0) {
    const g = failed[0]!;
    return {
      state: "failed",
      label: "Failed",
      sentence: `“${g.title}” stopped. Check evidence for why.`,
      modeLabel,
      modeHint,
      focusGoal: g,
      nextAction: "Open the goal and replan if needed.",
    };
  }

  if (input.now?.os_reachable === false && input.now.adapter === "umer-read") {
    return {
      state: "blocked",
      label: "Blocked",
      sentence: "Umer AI OS is unreachable. Shadow planning still works.",
      modeLabel,
      modeHint,
      focusGoal: done[0] ?? null,
      nextAction: "Check Settings → Umer OS connection.",
    };
  }

  if (done.length > 0 && input.goals.every((g) => g.stage === "done" || g.stage === "discarded")) {
    const g = done[0]!;
    return {
      state: "idle",
      label: "Idle",
      sentence: `Last finished: “${g.title}”. JARVIS is idle.`,
      modeLabel,
      modeHint,
      focusGoal: g,
      focusDetail:
        g.source === "api"
          ? "If that was Shadow, it was a simulation — not proof the outcome happened in the world."
          : undefined,
      nextAction: "State a new outcome below.",
    };
  }

  if (input.goals.length === 0) {
    return {
      state: "idle",
      label: "Idle",
      sentence: "JARVIS is idle. Nothing is in progress.",
      modeLabel,
      modeHint,
      focusGoal: null,
      nextAction: "State an outcome below to begin.",
    };
  }

  return {
    state: "idle",
    label: "Idle",
    sentence: "JARVIS is idle.",
    modeLabel,
    modeHint,
    focusGoal: null,
    nextAction: "State an outcome below.",
  };
}

/** Honest progress line from real key results — never invents completion. */
export function describeKeyResults(
  detail: GoalDetailResponse | null,
): { label: string; current: string; target: string; note?: string }[] {
  if (!detail?.goal.key_results?.length) return [];
  return detail.goal.key_results.map((kr) => {
    const current = String(kr.current ?? "—");
    const target = String(kr.target);
    const isResearch = /opportunity|research/i.test(kr.label) || /opportunity/i.test(kr.id);
    return {
      label: kr.label,
      current,
      target,
      note:
        isResearch && (kr.current === 0 || kr.current === "0")
          ? "Not found yet — Shadow simulation does not gather real opportunities."
          : undefined,
    };
  });
}

export function operatorStateClass(state: OperatorStateId): string {
  switch (state) {
    case "working":
      return "op-working";
    case "needs_approval":
    case "waiting":
      return "op-wait";
    case "blocked":
    case "failed":
      return "op-block";
    case "thinking":
    case "planning":
      return "op-think";
    case "completed":
      return "op-done";
    default:
      return "op-idle";
  }
}
