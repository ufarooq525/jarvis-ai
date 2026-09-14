import type { Task } from "../types/model.js";
import type { ComputerTargetId } from "../computer/types.js";

/** Narrow, removable template id for "open allowlisted app → type_text". */
export const COMPUTER_TYPE_PLAN_KIND = "computer_type" as const;

export type ComputerTypePlanKind = typeof COMPUTER_TYPE_PLAN_KIND;

export type ComputerTypeTargetId = Extract<ComputerTargetId, "notepad" | "cursor">;

const TYPEABLE: ComputerTypeTargetId[] = ["cursor", "notepad"];

/** This pass: Notepad and Cursor only. Click/scroll stay blocked. */
export function extractComputerTargetId(outcome: string): ComputerTypeTargetId | undefined {
  const o = outcome.toLowerCase();
  for (const id of TYPEABLE) {
    if (new RegExp(`\\b${id}\\b`).test(o)) return id;
  }
  return undefined;
}

export function isComputerTypeOutcome(outcome: string): boolean {
  const o = outcome.toLowerCase();
  return /\bopen\b/.test(o) && /\btype\b/.test(o) && extractComputerTargetId(outcome) != null;
}

export function extractTypeText(outcome: string): string {
  const m = outcome.match(
    /\btype\b\s+(?:into\s+(?:it|notepad|cursor)\s+)?["']?(.+?)["']?\s*$/i,
  );
  if (!m?.[1]) return "";
  return m[1].replace(/[.\s]+$/g, "").trim();
}

export function isComputerTypeTaskSet(tasks: Task[]): boolean {
  const tools = tasks.flatMap((t) => t.tool_ids);
  return (
    tools.includes("computer.open_app") &&
    tools.includes("computer.type_text") &&
    !tools.includes("os.runtime.start_run")
  );
}
