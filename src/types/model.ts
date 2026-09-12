export type TrustTier = "SHADOW" | "LIMITED" | "APPROVED" | "TRUSTED" | "AUTONOMOUS";
export type Mode = "shadow" | "live";
export type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

export type GoalStatus = "draft" | "active" | "blocked" | "done" | "cancelled";
export type TaskStatus =
  | "pending"
  | "ready"
  | "running"
  | "waiting_approval"
  | "done"
  | "failed"
  | "cancelled";

export interface KeyResult {
  id: string;
  label: string;
  metric_ref: string;
  target: number | string;
  current?: number | string;
  last_measured_at?: string;
}

export interface Goal {
  id: string;
  title: string;
  outcome: string;
  domain: string;
  status: GoalStatus;
  priority: number;
  trust_tier: TrustTier;
  autonomy_ceiling: AutonomyLevel;
  mode: Mode;
  key_results: KeyResult[];
  owner_principal_id: string;
  created_at: string;
  updated_at: string;
}

export interface Objective {
  id: string;
  goal_id: string;
  title: string;
  success_criteria: string;
  status: GoalStatus;
  order: number;
}

export interface Task {
  id: string;
  parent_id: string;
  goal_id: string;
  title: string;
  intent: string;
  status: TaskStatus;
  assignee_kind: "os_agent" | "computer" | "human" | "jarvis_internal";
  tool_ids: string[];
  idempotency_key: string;
}

export interface AgentRun {
  id: string;
  task_id: string;
  goal_id: string;
  decision_id: string;
  os_run_id?: string;
  principal_id: string;
  delegation_chain: string[];
  mode: Mode;
  policy_verdict_id: string;
  status: "proposed" | "simulated" | "approved" | "running" | "succeeded" | "failed" | "cancelled";
  tool_invocations: string[];
}

export interface EvidenceNode {
  id: string;
  prev_id?: string;
  goal_id: string;
  run_id?: string;
  kind:
    | "stimulus"
    | "decision"
    | "policy_verdict"
    | "simulation"
    | "tool_invocation"
    | "raw_result"
    | "observation"
    | "metric"
    | "expected_vs_actual";
  at: string;
  principal_id: string;
  payload_summary: string;
  correlation?: {
    decision_id?: string;
    policy_verdict_id?: string;
    os_run_id?: string;
  };
}

export interface DecisionRecord {
  id: string;
  goal_id?: string;
  decision: string;
  why: string;
  alternatives: string[];
  evidence_head: string;
  expected?: string;
  actual?: string;
  confidence: number;
  outcome: "act" | "do_not_act" | "escalate" | "defer" | "merge_into_existing";
}

export interface PolicyVerdict {
  id: string;
  class: "automatic" | "approval_required" | "strong_confirmation" | "reject";
  reason: string;
  at: string;
}

export type Effect = "read" | "write" | "external" | "irreversible" | "spend";

export interface ToolManifest {
  tool_id: string;
  version: string;
  adapter: "umer_os" | "computer" | "knowledge" | "jarvis_internal";
  display_name: string;
  effects: Effect[];
  resources: string[];
  blast_radius: "local" | "account" | "org" | "public";
  idempotent: boolean;
  dry_run_supported: boolean;
  required_autonomy: AutonomyLevel;
  required_trust_tier: TrustTier;
  side_channels: string[];
}
