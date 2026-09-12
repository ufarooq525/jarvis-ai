import type {
  OsCapability,
  OsRuntimeAdapter,
  OsRunRecord,
  OsStateSnapshot,
  RunSpec,
  SimulateResult,
} from "../../contracts/os-runtime-adapter.js";
import { newId, nowIso } from "../../util/ids.js";

/**
 * Mock adapter for §16 Shadow Loop.
 * Never talks to Umer AI OS. Simulates state/runs in-process.
 */
export class MockOsRuntimeAdapter implements OsRuntimeAdapter {
  readonly name = "mock";

  private runs = new Map<string, OsRunRecord>();
  private byIdempotency = new Map<string, string>();

  /** Optional canned overlapping summaries for StateInspector tests */
  overlappingSummaries: string[] = [];

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
    const existingId = this.byIdempotency.get(spec.idempotency_key);
    if (existingId) {
      const existing = this.runs.get(existingId);
      if (existing) return existing;
    }

    // Shadow / mock: never real side effects
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
    return record;
  }

  async getRun(os_run_id: string): Promise<OsRunRecord | null> {
    return this.runs.get(os_run_id) ?? null;
  }

  async cancelRun(os_run_id: string): Promise<{ ok: boolean; summary: string }> {
    const run = this.runs.get(os_run_id);
    if (!run) return { ok: false, summary: "unknown run" };
    run.status = "cancelled";
    run.finished_at = nowIso();
    return { ok: true, summary: "mock cancelled" };
  }
}
