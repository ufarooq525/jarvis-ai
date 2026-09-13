import { getFactStore } from "../world-model/fact-store.js";
import { extractSkillDraft } from "./extract.js";
import { getSkillStore } from "./skill-store.js";
import type { Skill } from "./types.js";

export function ingestTextToSkill(input: {
  text: string;
  title?: string;
  source?: string;
  source_urls?: string[];
}): Skill {
  const draft = extractSkillDraft(input.text, input.title);
  return getSkillStore().createCandidate({
    draft,
    source: input.source ?? "text.ingest",
    source_urls: input.source_urls,
  });
}

/** Build a candidate skill from durable WM facts (observations preferred). */
export function ingestFactsToSkill(input: {
  fact_ids: string[];
  title?: string;
}): Skill {
  if (!input.fact_ids.length) throw new Error("fact_ids required");
  const store = getFactStore();
  const facts = input.fact_ids
    .map((id) => store.getFact(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f));
  if (!facts.length) throw new Error("No matching facts found");

  const lines: string[] = [];
  if (input.title) lines.push(input.title);
  for (const f of facts) {
    lines.push(`- ${f.claim}`);
    if (f.kind === "uncertainty") {
      lines.push(`Constraint: treat as uncertain — ${f.claim.slice(0, 120)}`);
    }
  }

  const draft = extractSkillDraft(lines.join("\n"), input.title ?? facts[0]!.claim.slice(0, 60));
  const skill = getSkillStore().createCandidate({
    draft,
    source: "wm.facts",
    source_urls: facts.map((f) => f.source_url).filter((u): u is string => Boolean(u)),
    fact_ids: facts.map((f) => f.id),
  });

  for (const f of facts) {
    store.addLink({
      from_id: skill.id,
      to_id: f.id,
      rel: "derived_from",
      confidence: f.confidence,
      provenance: "skills.from-facts",
    });
  }

  return skill;
}
