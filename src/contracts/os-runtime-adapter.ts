/**
 * Permanent boundary: Goal Engine talks ONLY to this contract.
 * Mock and Umer OS adapters implement it. Never import OS packages here.
 */

export type Mode = "shadow" | "live";

export interface CorrelationIds {
  jarvis_goal_id: string;
  jarvis_task_id: string;
  jarvis_run_id: string;
  decision_id: string;
  principal_id: string;
  delegation_chain: string[];
  mode: Mode;
  policy_verdict_id: string;
}

export interface OsCapability {
  tool_id: string;
  display_name: string;
  specialist_id?: string;
  summary?: string;
}

export interface OsStateSnapshot {
  at: string;
  active_run_ids: string[];
  pending_gate_count: number;
  overlapping_summaries: string[];
  raw_summary: string;
}

export interface RunSpec {
  tool_id: string;
  input: unknown;
  domain: string;
  mode: Mode;
  correlation: CorrelationIds;
  idempotency_key: string;
  /** Phase E: work-graph project id for Live plan */
  project_id?: string;
  /** Phase E: OS plan body.approver */
  approver?: string;
}


export interface OsRunRecord {
  os_run_id: string;
  status: "proposed" | "simulated" | "running" | "succeeded" | "failed" | "cancelled" | "noop_shadow";
  summary: string;
  correlation: CorrelationIds;
  started_at: string;
  finished_at?: string;
}

export interface SimulateResult {
  predicted_summary: string;
  blast_radius: "local" | "account" | "org" | "public";
  side_effects: boolean;
  conflicts: string[];
}

/**
 * OsRuntimeAdapter — sole exec-plane port for the Goal Engine.
 */
export interface OsRuntimeAdapter {
  readonly name: string;

  listCapabilities(): Promise<OsCapability[]>;

  getCurrentState(query: {
    domain?: string;
    include_runs?: boolean;
    include_gates?: boolean;
  }): Promise<OsStateSnapshot>;

  /**
   * Dry-run / simulate. Mock always supports this.
   * Umer adapter returns local prediction (OS has no dry-run endpoint).
   */
  proposeRun(spec: RunSpec): Promise<SimulateResult>;

  /**
   * In shadow mode adapters MUST NOT cause real side effects.
   * Mock/Umer return noop_shadow. Live Umer posts work-graph plan.
   */
  startRun(spec: RunSpec): Promise<OsRunRecord>;

  getRun(os_run_id: string): Promise<OsRunRecord | null>;

  cancelRun(os_run_id: string): Promise<{ ok: boolean; summary: string }>;

  /**
   * Controlled polling fallback (NATS subscribe not wired in JARVIS yet).
   * Calls onUpdate on each poll; resolves when terminal status or timeout.
   */
  subscribeRun?(
    os_run_id: string,
    onUpdate: (record: OsRunRecord) => void,
    opts?: { interval_ms?: number; timeout_ms?: number },
  ): Promise<OsRunRecord | null>;
}

export function isTerminalOsStatus(status: OsRunRecord["status"]): boolean {
  return (
    status === "succeeded" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "noop_shadow" ||
    status === "simulated"
  );
}

/** Shared poll loop for adapters that implement getRun. */
export async function pollSubscribeRun(
  getRun: (os_run_id: string) => Promise<OsRunRecord | null>,
  os_run_id: string,
  onUpdate: (record: OsRunRecord) => void,
  opts?: { interval_ms?: number; timeout_ms?: number },
): Promise<OsRunRecord | null> {
  const interval = opts?.interval_ms ?? 500;
  const timeout = opts?.timeout_ms ?? 15_000;
  const started = Date.now();
  let last: OsRunRecord | null = null;

  while (Date.now() - started < timeout) {
    const row = await getRun(os_run_id);
    if (row) {
      last = row;
      onUpdate(row);
      if (isTerminalOsStatus(row.status)) return row;
    }
    await new Promise((r) => setTimeout(r, interval));
  }
  return last;
}
