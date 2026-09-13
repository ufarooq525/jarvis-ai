import { getFactStore } from "../world-model/fact-store.js";
import { getOpportunityStore } from "./opportunity-store.js";
import type { Opportunity, OpportunityChannel } from "./types.js";

export function createOpportunityFromFacts(input: {
  fact_ids: string[];
  title?: string;
  company?: string;
  channel?: OpportunityChannel;
}): Opportunity {
  if (!input.fact_ids.length) throw new Error("fact_ids required");
  const facts = input.fact_ids
    .map((id) => getFactStore().getFact(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
  if (!facts.length) throw new Error("No matching facts");

  const summary = facts.map((f) => f.claim).join(" · ").slice(0, 400);
  const title = input.title?.trim() || facts[0]!.claim.slice(0, 80);
  const opp = getOpportunityStore().create({
    title,
    company: input.company,
    channel: input.channel ?? "web",
    summary,
    fact_ids: facts.map((f) => f.id),
    source: "wm.facts",
  });

  for (const f of facts) {
    getFactStore().addLink({
      from_id: opp.id,
      to_id: f.id,
      rel: "informed_by",
      confidence: f.confidence,
      provenance: "ops.from-facts",
    });
  }

  return getOpportunityStore().qualify(
    opp.id,
    facts,
  );
}
