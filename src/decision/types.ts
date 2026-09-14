import type { NormalizedOutcome } from "../goal-engine/normalize.js";
import type {
  AgentRun,
  DecisionRecord,
  EvidenceNode,
  Goal,
  Objective,
  Task,
} from "../types/model.js";
import type { WmFact } from "../world-model/types.js";
import type { Capability } from "../capabilities/types.js";

export type OperatorDecisionKind =
  | "execute"
  | "complete"
  | "block"
  | "replan"
  | "do_not_act"
  | "escalate";

export interface OperatorDecision {
  decision: OperatorDecisionKind;
  reason: string;
  selected_capability?: string;
  selected_action?: string;
  expected_result?: string;
  risk?: string;
  authorization_requirement?: string;
  next_verification_condition?: string;
  /** Task to run when executing an existing decomposed task. */
  task_id?: string;
  input?: Record<string, unknown>;
}

export interface OperatorContext {
  goal: Goal;
  objectives: Objective[];
  tasks: Task[];
  runs: AgentRun[];
  evidence: EvidenceNode[];
  facts: WmFact[];
  opportunity_count: number;
  capabilities: Capability[];
  previous_decisions: OperatorDecision[];
  journal: DecisionRecord[];
  normalized: NormalizedOutcome;
  attempted_capability_ids: string[];
}
