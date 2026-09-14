import type { WmFact } from "../world-model/types.js";
import type { NormalizedOutcome } from "../goal-engine/normalize.js";
import { getFactStore } from "../world-model/fact-store.js";
import { getOpportunityStore } from "./opportunity-store.js";

/**
 * A fact is a qualifying opportunity candidate only when it looks like a
 * named company/prospect in the requested market — never encyclopedia titles.
 */
export function countOpportunitiesForGoal(goalId: string): number {
  const factIds = new Set(
    getFactStore()
      .listFacts({ goal_id: goalId })
      .map((f) => f.id),
  );
  if (factIds.size === 0) return 0;
  return getOpportunityStore()
    .list()
    .filter(
      (o) => o.status !== "retired" && o.provenance.fact_ids.some((id) => factIds.has(id)),
    ).length;
}

export function isQualifyingOpportunityFact(
  fact: WmFact,
  normalized: NormalizedOutcome,
): boolean {
  if (fact.kind !== "observation") return false;
  if (fact.status !== "active") return false;
  const claim = fact.claim.trim();
  if (claim.length < 12) return false;
  if (/^Page title:/i.test(claim)) return false;
  if (/appears related to:/i.test(claim)) return false;
  if (/unverified without additional/i.test(claim)) return false;
  if (/source was not visited/i.test(claim)) return false;

  const companyLike =
    /\b(inc\.?|ltd\.?|llc|gmbh|corp\.?|company|labs|software|technologies)\b/i.test(claim) ||
    /\b[A-Z][A-Za-z0-9&.-]{2,}\s+(SaaS|Labs|Software)\b/.test(claim);
  if (!companyLike) return false;

  const hay = claim.toLowerCase();
  if (normalized.geography) {
    const geo = normalized.geography.toLowerCase();
    const geoHit = hay.includes(geo) || (geo.includes("saudi") && hay.includes("saudi"));
    if (!geoHit) return false;
  }
  return true;
}
