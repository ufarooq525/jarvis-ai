export type Stage = "stated" | "shadow" | "live" | "done" | "failed" | "discarded";
export type Effect = "read" | "compute" | "writes";
export type Domain = "ops" | "comms" | "finance" | "data" | "general";
export type Mode = "shadow" | "live";

export interface Step {
  text: string;
  effect: Effect;
}

export interface Goal {
  id: string;
  title: string;
  summary: string;
  domain: Domain;
  stage: Stage;
  at: string;
  steps: Step[];
  effects: {
    filesWritten: number | string;
    messagesSent: number | string;
    deletes: string;
    reversible: string;
    extra?: { label: string; value: string; hot?: boolean }[];
  } | null;
  plannedAt?: string;
  approvedAt?: string;
  finishedAt?: string;
  progress?: number;
  needsAttention?: number;
  leaving?: boolean;
  /** api = from Goal Engine; local = optimistic / session-only */
  source?: "api" | "local";
}

export interface LogEntry {
  id: string;
  day: string;
  time: string;
  kind: "" | "sh" | "lv" | "dn" | "fl";
  title: string;
  detail: string;
  fx?: string;
  fxk?: "sim" | "real";
  mine?: boolean;
  real?: boolean;
  undoable?: boolean;
  goalId?: string;
}

export function nowStr(): string {
  const d = new Date();
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}:${m < 10 ? "0" : ""}${m} ${h < 12 ? "AM" : "PM"}`;
}

export function todayLabel(): string {
  return `Today — ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
}

export function writesCount(g: Goal): number {
  return g.steps.filter((s) => s.effect === "writes").length;
}

export function readsCount(g: Goal): number {
  return g.steps.filter((s) => s.effect === "read").length;
}

export const SEED_GOALS: Goal[] = [
  {
    id: "khan",
    title: "Clear the Khan Traders thread",
    summary: "Three mails unanswered since Tuesday.",
    domain: "comms",
    stage: "stated",
    at: "12:20 PM",
    steps: [],
    effects: null,
  },
  {
    id: "weekly",
    title: "Weekly company overview",
    summary: "Reads the ops sheet and the tracker, then drafts the Monday note.",
    domain: "ops",
    stage: "shadow",
    at: "3:52 AM",
    steps: [
      { text: "Read the ops sheet for 1–7 Sep", effect: "read" },
      { text: "Pull open tickets from the tracker", effect: "read" },
      { text: "Compare both against last week’s targets", effect: "compute" },
      { text: "Flag anything that has slipped twice", effect: "compute" },
      { text: "Draft the note in your usual format", effect: "compute" },
      { text: 'Save to Documents as "Week 37 overview"', effect: "writes" },
    ],
    effects: {
      filesWritten: 1,
      messagesSent: 0,
      deletes: "no",
      reversible: "yes — keeps a copy",
    },
  },
  {
    id: "invoices",
    title: "Reconcile September invoices",
    summary: "Matches 38 lines against the ledger and flags what it can’t.",
    domain: "finance",
    stage: "shadow",
    at: "12:20 PM",
    steps: [
      { text: "Open the September ledger export", effect: "read" },
      { text: "Load 38 invoice lines from the folder", effect: "read" },
      { text: "Match each line by reference and amount", effect: "compute" },
      { text: "Set aside anything that matches twice", effect: "compute" },
      { text: "Save a reconciliation sheet to Documents", effect: "writes" },
    ],
    effects: {
      filesWritten: 1,
      messagesSent: 0,
      deletes: "no",
      reversible: "yes",
    },
  },
  {
    id: "backup",
    title: "Back up the client catalogue",
    summary: "Copying the catalogue to a dated folder.",
    domain: "ops",
    stage: "live",
    at: "1:04 PM",
    progress: 4,
    approvedAt: "1:04 PM",
    steps: [
      { text: "Read the catalogue index", effect: "read" },
      { text: "Create a dated folder", effect: "writes" },
      { text: "Copy product data", effect: "writes" },
      { text: "Copy images", effect: "writes" },
      { text: "Verify every file copied", effect: "compute" },
      { text: "Write a manifest", effect: "writes" },
      { text: "Report what changed", effect: "compute" },
    ],
    effects: {
      filesWritten: "1,240 so far",
      messagesSent: 0,
      deletes: "no",
      reversible: "yes — stop rolls back",
    },
  },
  {
    id: "august",
    title: "August invoices reconciled",
    summary: "41 of 43 lines matched. Two need your call.",
    domain: "finance",
    stage: "done",
    at: "9 Sep",
    needsAttention: 2,
    steps: [
      { text: "Opened the August ledger", effect: "read" },
      { text: "Loaded 43 invoice lines", effect: "read" },
      { text: "Matched 41 lines", effect: "compute" },
      { text: "Set aside 2 unmatched lines", effect: "compute" },
      { text: "Saved the reconciliation sheet", effect: "writes" },
    ],
    effects: {
      filesWritten: 1,
      messagesSent: 0,
      deletes: "no",
      reversible: "yes",
      extra: [{ label: "Still needs you", value: "2 lines", hot: true }],
    },
  },
  {
    id: "w5",
    title: "Weekly company overview",
    summary: "Saved to Documents. Not sent.",
    domain: "ops",
    stage: "done",
    at: "5 Sep",
    steps: [
      { text: "Read three sources", effect: "read" },
      { text: "Drafted the note", effect: "compute" },
      { text: "Saved to Documents", effect: "writes" },
    ],
    effects: {
      filesWritten: 1,
      messagesSent: 0,
      deletes: "no",
      reversible: "yes",
    },
  },
  {
    id: "sync",
    title: "Sync the price list to the store",
    summary: "Stopped at step 3 — the store rejected two SKUs.",
    domain: "data",
    stage: "failed",
    at: "8 Sep",
    steps: [
      { text: "Read the price list", effect: "read" },
      { text: "Check every SKU exists", effect: "compute" },
      { text: "Push 240 price updates", effect: "writes" },
    ],
    effects: {
      filesWritten: 0,
      messagesSent: 0,
      deletes: "no",
      reversible: "yes",
      extra: [
        { label: "Rolled back", value: "yes — nothing changed" },
        { label: "Needs a fix", value: "2 SKUs", hot: true },
      ],
    },
  },
];

export const SEED_LOG: LogEntry[] = [
  {
    id: "l1",
    day: "Today — 12 September",
    time: "1:04 PM",
    kind: "lv",
    title: 'You approved "Back up the client catalogue"',
    detail: "Moved from Shadow to Live. Started immediately.",
    fx: "7 steps · writes to disk",
    fxk: "real",
    mine: true,
    real: true,
    goalId: "backup",
  },
  {
    id: "l2",
    day: "Today — 12 September",
    time: "12:20 PM",
    kind: "sh",
    title: 'Planned "Reconcile September invoices" in Shadow',
    detail: "Five steps against a copy of the ledger. Waiting on your review.",
    fx: "simulated · nothing sent",
    fxk: "sim",
    goalId: "invoices",
  },
  {
    id: "l3",
    day: "Today — 12 September",
    time: "12:20 PM",
    kind: "",
    title: 'You stated "Clear the Khan Traders thread"',
    detail: "JARVIS started working out the steps.",
    mine: true,
    goalId: "khan",
  },
  {
    id: "l4",
    day: "Today — 12 September",
    time: "3:52 AM",
    kind: "sh",
    title: 'Planned "Weekly company overview" in Shadow',
    detail: "Six steps across three sources. Waiting on your review.",
    fx: "simulated · nothing sent",
    fxk: "sim",
    goalId: "weekly",
  },
  {
    id: "l5",
    day: "Wednesday — 9 September",
    time: "6:41 PM",
    kind: "dn",
    title: 'Finished "August invoices reconciled"',
    detail:
      "41 of 43 lines matched. Two were left for you — both look like the same duplicate reference.",
    fx: "wrote 1 file · sent 0",
    fxk: "real",
    real: true,
    goalId: "august",
  },
  {
    id: "l6",
    day: "Tuesday — 8 September",
    time: "4:12 PM",
    kind: "fl",
    title: '"Sync the price list" stopped at step 3',
    detail:
      "The store rejected two SKUs, so JARVIS rolled the whole run back rather than push a partial update.",
    fx: "rolled back · nothing changed",
    fxk: "real",
    real: true,
    goalId: "sync",
  },
];
