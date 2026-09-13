/** Phase 7 — durable World Model memory types */

export type WmEntityType =
  | "goal"
  | "os_run"
  | "approval"
  | "specialist"
  | "person"
  | "company"
  | "project"
  | "tool"
  | "skill"
  | "source";

export type WmTrust = "trusted" | "untrusted" | "quarantined";

/** Observation = raw evidence; conclusion = derived judgment. */
export type WmFactKind = "observation" | "conclusion" | "inference" | "uncertainty";

export type WmFactStatus = "active" | "stale" | "invalidated" | "quarantined";

export interface WmEntity {
  entity_id: string;
  type: WmEntityType;
  version: number;
  title: string;
  summary: string;
  confidence: number;
  provenance: string;
  trust: WmTrust;
  last_verified_at: string;
  refs?: Record<string, string>;
}

export interface WmFact {
  id: string;
  claim: string;
  kind: WmFactKind;
  status: WmFactStatus;
  confidence: number;
  /** Provenance label, e.g. browser.research | human | adapter */
  source: string;
  source_url?: string;
  fetched_at?: string;
  verified_at: string;
  /** ISO — after this, status may become stale on touch */
  stale_after?: string;
  goal_id?: string;
  task_id?: string;
  dedupe_key: string;
  created_at: string;
  updated_at: string;
}

export interface WmLink {
  id: string;
  from_id: string;
  to_id: string;
  rel: string;
  confidence: number;
  provenance: string;
  created_at: string;
}

export interface WmNow {
  at: string;
  active_goal: WmEntity | null;
  open_approvals: WmEntity[];
  os_run_count: number;
  pending_gates: number;
  adapter: string;
  stm: {
    active_goal_id: string | null;
    open_approval_ids: string[];
    os_run_count: number;
  };
  memory?: {
    active_facts: number;
    stale_facts: number;
  };
}

export interface QuarantineRecord {
  id: string;
  source: string;
  text_hash: string;
  text_preview: string;
  created_at: string;
  status: "quarantined";
  goal_id?: string;
}
