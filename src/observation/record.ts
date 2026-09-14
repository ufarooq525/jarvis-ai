import type { EvidenceChain } from "../evidence/chain.js";
import { JARVIS_PRINCIPAL } from "../trust/principals.js";
import { nowIso, newId } from "../util/ids.js";

export type ObservationKind =
  | "state_snapshot"
  | "page_loaded"
  | "page_not_visited"
  | "extract"
  | "metric"
  | "os_status";

export interface ObservationRecord {
  id: string;
  goal_id: string;
  task_id?: string;
  action_id?: string;
  capability_id: string;
  kind: ObservationKind;
  summary: string;
  at: string;
}

/** Persist an observation as evidence — action ≠ observation. */
export function recordObservation(
  evidence: EvidenceChain,
  input: Omit<ObservationRecord, "id" | "at"> & { simulated?: boolean; decision_id?: string },
): ObservationRecord {
  const rec: ObservationRecord = {
    id: newId("obs"),
    at: nowIso(),
    goal_id: input.goal_id,
    task_id: input.task_id,
    action_id: input.action_id,
    capability_id: input.capability_id,
    kind: input.kind,
    summary: input.summary,
  };
  evidence.append({
    goal_id: input.goal_id,
    task_id: input.task_id,
    action_id: input.action_id,
    kind: "observation",
    principal_id: JARVIS_PRINCIPAL,
    payload_summary: `observation:${input.kind} capability=${input.capability_id} — ${input.summary}`,
    simulated: input.simulated,
    correlation: {
      decision_id: input.decision_id,
      tool_id: input.capability_id,
      jarvis_task_id: input.task_id,
    },
  });
  return rec;
}
