import type { OsRuntimeAdapter, OsStateSnapshot } from "../contracts/index.js";
import type { Goal } from "../types/model.js";
import type { MemoryStore } from "../store/memory-store.js";

export interface StateInspection {
  overlapping_goals: Goal[];
  os_active_runs: string[];
  pending_gates: number;
  os_summary: string;
  duplicate_risk: boolean;
  os_reachable: boolean;
}

export async function inspectState(
  store: MemoryStore,
  adapter: OsRuntimeAdapter,
  outcome: string,
  domain: string,
): Promise<StateInspection> {
  const overlapping_goals = store.findOverlappingGoals(outcome, domain);
  let os: OsStateSnapshot;
  let os_reachable = true;
  try {
    os = await adapter.getCurrentState({
      domain,
      include_runs: true,
      include_gates: true,
    });
  } catch (e) {
    os_reachable = false;
    os = {
      at: new Date().toISOString(),
      active_run_ids: [],
      pending_gate_count: 0,
      overlapping_summaries: [],
      raw_summary: `OS observe unavailable: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const duplicate_risk =
    overlapping_goals.length > 0 ||
    os.overlapping_summaries.some((s) =>
      s.toLowerCase().includes(outcome.toLowerCase().slice(0, 24)),
    );

  return {
    overlapping_goals,
    os_active_runs: os.active_run_ids,
    pending_gates: os.pending_gate_count,
    os_summary: os.raw_summary,
    duplicate_risk,
    os_reachable,
  };
}
