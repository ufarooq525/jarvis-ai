/** Computer plane types — separate from Goal Engine / OsRuntimeAdapter. */

export type ComputerActionKind =
  | "observe"
  | "list_targets"
  | "locate"
  | "open_app"
  | "focus_window"
  | "click"
  | "type"
  | "scroll";

export type ComputerTargetId =
  | "vscode"
  | "browser"
  | "terminal"
  | "file_manager"
  | "notepad";

export interface AppTarget {
  id: ComputerTargetId;
  display_name: string;
  /** Semantic labels — never stale screen coordinates. */
  aliases: string[];
  /** Windows launch candidates (first existing wins for Live later). */
  windows_commands: string[];
}

export interface LocateResult {
  target_id: ComputerTargetId;
  found: boolean;
  resolved_command?: string;
  method: "path_probe" | "which" | "builtin" | "not_found";
  detail: string;
}

export interface ComputerObservation {
  at: string;
  kind: "before" | "after" | "standalone";
  snapshot_summary: string;
  locate?: LocateResult;
}

export interface ComputerActionRecord {
  id: string;
  action: ComputerActionKind;
  target_id?: ComputerTargetId;
  mode: "shadow" | "live";
  /** Always true for Phase 5 shadow open — no real OS UI mutation. */
  simulated: boolean;
  simulated_notice: string;
  started_at: string;
  finished_at: string;
  ok: boolean;
  summary: string;
  before?: ComputerObservation;
  after?: ComputerObservation;
  verification?: {
    passed: boolean;
    checks: Array<{ id: string; ok: boolean; detail: string }>;
    summary: string;
  };
}

export const COMPUTER_SIMULATED_NOTICE = "SIMULATED / No external computer action was performed";

/** Strong-confirm token for gated Live open (mirrors LIVE for goals). */
export const COMPUTER_LIVE_OPEN_CONFIRM = "OPEN";

export const COMPUTER_LIVE_OPEN_NOTICE = "LIVE / External computer action was performed";
