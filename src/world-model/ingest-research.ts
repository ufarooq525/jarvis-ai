import type { ResearchFact } from "../browser/types.js";
import { quarantineAdapterText } from "./quarantine.js";
import { getFactStore } from "./fact-store.js";
import type { WmFact, WmFactKind } from "./types.js";

function mapKind(kind: ResearchFact["kind"]): WmFactKind {
  if (kind === "fact") return "observation";
  if (kind === "inference") return "inference";
  return "uncertainty";
}

/**
 * Ingest browser research claims into durable WM facts.
 * Observations/inferences only — never auto-promote to conclusion.
 * Quarantined text is stored as quarantined status or skipped if secret-like.
 */
export function ingestBrowserResearch(input: {
  facts: ResearchFact[];
  goal_id?: string;
  task_id?: string;
  url: string;
}): { stored: WmFact[]; skipped: number; links: number } {
  const store = getFactStore();
  const stored: WmFact[] = [];
  let skipped = 0;
  let links = 0;

  for (const f of input.facts) {
    const q = quarantineAdapterText({
      source: "browser.research",
      text: f.claim,
      goal_id: input.goal_id,
    });

    try {
      const row = store.upsertFact({
        claim: q.safe_summary,
        kind: mapKind(f.kind),
        confidence: f.confidence,
        source: "browser.research",
        source_url: f.source_url || input.url,
        fetched_at: f.fetched_at,
        goal_id: input.goal_id,
        task_id: input.task_id,
        dedupe_key: f.dedupe_key,
        status: q.quarantined ? "quarantined" : "active",
      });
      stored.push(row);

      if (input.goal_id) {
        store.addLink({
          from_id: input.goal_id,
          to_id: row.id,
          rel: "informed_by",
          confidence: f.confidence,
          provenance: "browser.research",
        });
        links += 1;
      }
    } catch {
      skipped += 1;
    }
  }

  return { stored, skipped, links };
}
