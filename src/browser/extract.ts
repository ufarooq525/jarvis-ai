import { createHash } from "node:crypto";
import { newId } from "../util/ids.js";
import type { BrowserFetchRecord, ResearchFact } from "./types.js";

export function extractFactsFromFetch(
  fetchRec: BrowserFetchRecord,
  seenKeys: Set<string> = new Set(),
): { facts: ResearchFact[]; duplicates_skipped: number } {
  const facts: ResearchFact[] = [];
  let duplicates_skipped = 0;

  const add = (partial: Omit<ResearchFact, "id" | "dedupe_key">) => {
    const fact = makeFact(partial);
    if (seenKeys.has(fact.dedupe_key)) {
      duplicates_skipped += 1;
      return;
    }
    seenKeys.add(fact.dedupe_key);
    facts.push(fact);
  };

  if (!fetchRec.visited || !fetchRec.ok) {
    add({
      claim: `Source was not visited successfully: ${fetchRec.error ?? "unknown"}`,
      kind: "uncertainty",
      source_url: fetchRec.url,
      fetched_at: fetchRec.fetched_at,
      confidence: 0.9,
    });
    return { facts, duplicates_skipped };
  }

  if (fetchRec.title) {
    add({
      claim: `Page title: ${fetchRec.title}`,
      kind: "fact",
      source_url: fetchRec.url,
      fetched_at: fetchRec.fetched_at,
      confidence: 0.95,
    });
    add({
      claim: `This page appears related to: ${fetchRec.title}`,
      kind: "inference",
      source_url: fetchRec.url,
      fetched_at: fetchRec.fetched_at,
      confidence: 0.4,
    });
  }

  const preview = fetchRec.text_preview?.trim() ?? "";
  if (preview) {
    const sentence =
      preview.split(/(?<=[.!?])\s+/).find((s) => s.length > 40) ?? preview.slice(0, 180);
    add({
      claim: sentence.slice(0, 240),
      kind: "fact",
      source_url: fetchRec.url,
      fetched_at: fetchRec.fetched_at,
      confidence: 0.7,
    });
  }

  add({
    claim: "Further claims from this page are unverified without additional sources",
    kind: "uncertainty",
    source_url: fetchRec.url,
    fetched_at: fetchRec.fetched_at,
    confidence: 0.8,
  });

  return { facts, duplicates_skipped };
}

function makeFact(partial: Omit<ResearchFact, "id" | "dedupe_key">): ResearchFact {
  const dedupe_key = createHash("sha256")
    .update(`${partial.claim}|${partial.source_url}`)
    .digest("hex")
    .slice(0, 16);
  return {
    id: newId("fact"),
    dedupe_key,
    ...partial,
  };
}
