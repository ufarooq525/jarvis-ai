import type {
  ApprovalRequirement,
  ExecutionContext,
  Reversibility,
  RiskLevel,
  ToolManifest,
  TrustTier,
} from "../types/model.js";

/** Runtime plane a capability executes on. */
export type CapabilityRuntime = "os" | "computer" | "browser" | "knowledge" | "jarvis";

export interface Capability {
  id: string;
  name: string;
  description: string;
  category: CapabilityRuntime;
  runtime: CapabilityRuntime;
  inputs: string[];
  outputs: string[];
  risk: RiskLevel;
  trust_requirement: TrustTier;
  approval_requirement: ApprovalRequirement;
  reversible: Reversibility;
  side_effects: string[];
  execution_context: ExecutionContext;
  evidence_produced: string[];
  supported_actions: string[];
  /** Backing tool manifest id (same as id for Phase-1 tools). */
  tool_id: string;
}

export function capabilityFromManifest(m: ToolManifest): Capability {
  const runtime: CapabilityRuntime =
    m.execution_context === "os"
      ? "os"
      : m.execution_context === "computer"
        ? "computer"
        : m.execution_context === "browser"
          ? "browser"
          : m.execution_context === "knowledge"
            ? "knowledge"
            : "jarvis";

  return {
    id: m.tool_id,
    name: m.display_name,
    description: m.display_name,
    category: runtime,
    runtime,
    inputs: [...m.inputs],
    outputs: [...m.outputs],
    risk: m.risk_level,
    trust_requirement: m.required_trust_tier,
    approval_requirement: m.approval_requirement,
    reversible: m.reversibility,
    side_effects: [...m.expected_side_effects],
    execution_context: m.execution_context,
    evidence_produced: [...m.evidence_produced],
    supported_actions: [m.tool_id.split(".").pop() ?? m.tool_id],
    tool_id: m.tool_id,
  };
}
