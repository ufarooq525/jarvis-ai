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

const HIGH_BLAST_EFFECTS = new Set(["spend", "irreversible", "publish", "send", "security"]);

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

  const effects = input.manifest.effects ?? [];
  const highBlast =
    effects.some((e) => HIGH_BLAST_EFFECTS.has(e)) ||
    input.manifest.approval_requirement === "strong_confirmation" ||
    input.manifest.risk_level === "critical";

  if (highBlast) {
    return {
      id,
      class: "strong_confirmation",
      reason: "High-blast / irreversible / publish-send-security requires strong confirm",
      at,
    };
  }

  if (
    input.manifest.approval_requirement === "approval" ||
    effects.includes("external") ||
    effects.includes("write")
  ) {
    return {
      id,
      class: "approval_required",
      reason: "Write/external or manifest approval_requirement needs approval",
      at,
    };
  }

  return { id, class: "automatic", reason: "Within policy envelope", at };
}
