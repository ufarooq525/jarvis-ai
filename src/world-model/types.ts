/** Phase F — thin World Model entity stubs */

export type WmEntityType = "goal" | "os_run" | "approval" | "specialist";
export type WmTrust = "trusted" | "untrusted" | "quarantined";

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
