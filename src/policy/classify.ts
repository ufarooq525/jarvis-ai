import type { Goal, PolicyVerdict, ToolManifest, TrustTier } from "../types/model.js";
import { newId, nowIso } from "../util/ids.js";
import { isKillSwitchEngaged } from "../kill-switch.js";

const TIER_RANK: Record<TrustTier, number> = {
  SHADOW: 0,
  LIMITED: 1,
  APPROVED: 2,
  TRUSTED: 3,
  AUTONOMOUS: 4,
};

export function classifyProposal(input: {
  goal: Goal;
  manifest: ToolManifest;
  tool_id: string;
}): PolicyVerdict {
  const at = nowIso();
  const id = newId("verdict");

  if (isKillSwitchEngaged() && input.goal.mode === "live") {
    return {
      id,
      class: "reject",
      reason: "Kill switch engaged — live dispatch blocked",
      at,
    };
  }

  if (!input.manifest) {
    return { id, class: "reject", reason: "Missing tool manifest", at };
  }

  const shadowBound = input.goal.mode === "shadow" || input.goal.trust_tier === "SHADOW";

  // Shadow path: allow simulate/noop even when Live would require higher trust.
  if (shadowBound) {
    return {
      id,
      class: "automatic",
      reason: "SHADOW mode — simulate/noop only; Live trust gates deferred",
      at,
    };
  }

  if (TIER_RANK[input.goal.trust_tier] < TIER_RANK[input.manifest.required_trust_tier]) {
    return {
      id,
      class: "reject",
      reason: `Trust tier ${input.goal.trust_tier} below required ${input.manifest.required_trust_tier}`,
      at,
    };
  }

  if (input.goal.autonomy_ceiling < input.manifest.required_autonomy) {
    return {
      id,
      class: "approval_required",
      reason: `Autonomy ceiling ${input.goal.autonomy_ceiling} < required ${input.manifest.required_autonomy}`,
      at,
    };
  }

  if (input.manifest.effects.includes("spend") || input.manifest.effects.includes("irreversible")) {
    return { id, class: "strong_confirmation", reason: "High-blast effects require strong confirm", at };
  }

  if (input.manifest.effects.includes("external") || input.manifest.effects.includes("write")) {
    return { id, class: "approval_required", reason: "Write/external requires approval at current autonomy", at };
  }

  return { id, class: "automatic", reason: "Within policy envelope", at };
}
