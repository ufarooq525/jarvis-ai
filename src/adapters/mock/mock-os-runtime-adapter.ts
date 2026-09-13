import type {
  CorrelationIds,
  OsCapability,
  OsRuntimeAdapter,
  OsRunRecord,
  OsStateSnapshot,
  RunSpec,
  SimulateResult,
} from "../../contracts/os-runtime-adapter.js";
import { pollSubscribeRun } from "../../contracts/os-runtime-adapter.js";
import { newId, nowIso } from "../../util/ids.js";

/**
 * Mock adapter for Shadow Loop / tests.
 * Never talks to Umer AI OS. Simulates state/runs in-process.
 */
export class MockOsRuntimeAdapter implements OsRuntimeAdapter {
  readonly name = "mock";

  private runs = new Map<string, OsRunRecord>();
  private byIdempotency = new Map<string, string>();
  private correlationByOsRun = new Map<string, CorrelationIds>();

  /** Optional canned overlapping summaries for StateInspector tests */
  overlappingSummaries: string[] = [];

  /** Fail the next N startRun calls (any tool), then succeed. */
  failStartRunRemaining = 0;

  /** Only fail startRun for these tool_ids (when failStartRunRemaining > 0). Empty = all. */
  failTools: string[] = [];

  /** Artificial delay before startRun resolves (for timeout tests). */
  startRunDelayMs = 0;

  async listCapabilities(): Promise<OsCapability[]> {
    return [
      {
        tool_id: "os.runtime.get_state",
        display_name: "Mock OS state",
        specialist_id: "mock.state",
      },
      {
        tool_id: "os.runtime.start_run",
        display_name: "Mock OS start run",
        specialist_id: "mock.worker",
      },
      {
        tool_id: "os.runtime.get_run",
        display_name: "Mock OS get run",
      },
    ];
  }

  async getCurrentState(): Promise<OsStateSnapshot> {
    const active = [...this.runs.values()]
      .filter((r) => r.status === "running" || r.status === "noop_shadow" || r.status === "simulated")
      .map((r) => r.os_run_id);
    return {
      at: nowIso(),
      active_run_ids: active,
      pending_gate_count: 0,
      overlapping_summaries: [...this.overlappingSummaries],
      raw_summary: `mock state: ${active.length} active mock runs`,
    };
  }

  async proposeRun(spec: RunSpec): Promise<SimulateResult> {
    return {
      predicted_summary: `Simulate ${spec.tool_id} for goal ${spec.correlation.jarvis_goal_id}`,
      blast_radius: "local",
      side_effects: false,
      conflicts: [],
    };
  }

  async startRun(spec: RunSpec): Promise<OsRunRecord> {
    if (this.startRunDelayMs > 0) {
      await new Promise((r) => setTimeout(r, this.startRunDelayMs));
    }

    const shouldFailTool =
      this.failTools.length === 0 || this.failTools.includes(spec.tool_id);
    if (this.failStartRunRemaining > 0 && shouldFailTool) {
      this.failStartRunRemaining -= 1;
      throw new Error(`adapter error: mock forced failure for ${spec.tool_id}`);
    }

    const existingId = this.byIdempotency.get(spec.idempotency_key);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (existing) return existing;
    }

    const os_run_id = newId("mock_run");
    const record: OsRunRecord = {
      os_run_id,
      status: spec.mode === "shadow" ? "noop_shadow" : "simulated",
      summary:
        spec.mode === "shadow"
          ? `SHADOW noop — would invoke ${spec.tool_id} (mock; no OS call)`
          : `Mock simulated ${spec.tool_id} (still no real OS)`,
      correlation: spec.correlation,
      started_at: nowIso(),
      finished_at: nowIso(),
    };
    this.runs.set(os_run_id, record);
    this.byIdempotency.set(spec.idempotency_key, os_run_id);
    this.correlationByOsRun.set(os_run_id, spec.correlation);
    return record;
  }

  async getRun(os_run_id: string): Promise<OsRunRecord | null> {
    const run = this.runs.get(os_run_id);
    if (!run) return null;
    const corr = this.correlationByOsRun.get(os_run_id);
    return corr ? { ...run, correlation: corr } : run;
  }

  async cancelRun(os_run_id: string): Promise<{ ok: boolean; summary: string }> {
    const run = this.runs.get(os_run_id);
    if (!run) return { ok: false, summary: "unknown run" };
    run.status = "cancelled";
    run.finished_at = nowIso();
    return { ok: true, summary: "mock cancelled" };
  }

  async subscribeRun(
    os_run_id: string,
    onUpdate: (record: OsRunRecord) => void,
    opts?: { interval_ms?: number; timeout_ms?: number },
  ): Promise<OsRunRecord | null> {
    return pollSubscribeRun((id) => this.getRun(id), os_run_id, onUpdate, {
      interval_ms: opts?.interval_ms ?? 20,
      timeout_ms: opts?.timeout_ms ?? 500,
    });
  }

  /** Test helper: mutate stored run status for subscribe/poll tests. */
  setRunStatus(os_run_id: string, status: OsRunRecord["status"]): void {
    const run = this.runs.get(os_run_id);
    if (run) {
      run.status = status;
      if (status === "succeeded" || status === "failed" || status === "cancelled") {
        run.finished_at = nowIso();
      }
    }
  }
}
