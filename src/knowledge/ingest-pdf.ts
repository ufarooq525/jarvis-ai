import { quarantineAdapterText } from "../world-model/quarantine.js";
import { getFactStore } from "../world-model/fact-store.js";
import type { WmFact } from "../world-model/types.js";
import { pdfTextToClaims, type PdfExtractResult } from "./pdf.js";

export function ingestPdfExtract(input: {
  extract: PdfExtractResult;
  goal_id?: string;
  task_id?: string;
}): { stored: WmFact[]; skipped: number } {
  const store = getFactStore();
  const stored: WmFact[] = [];
  let skipped = 0;
  const claims = pdfTextToClaims(input.extract.text);

  for (const claim of claims) {
    const q = quarantineAdapterText({
      source: "knowledge.pdf.read",
      text: claim,
      goal_id: input.goal_id,
    });
    try {
      const row = store.upsertFact({
        claim: q.safe_summary,
        kind: "observation",
        confidence: 0.7,
        source: "knowledge.pdf.read",
        source_url: input.extract.source,
        fetched_at: new Date().toISOString(),
        goal_id: input.goal_id,
        task_id: input.task_id,
        status: q.quarantined ? "quarantined" : "active",
      });
      stored.push(row);
      if (input.goal_id) {
        store.addLink({
          from_id: input.goal_id,
          to_id: row.id,
          rel: "informed_by",
          confidence: 0.7,
          provenance: "knowledge.pdf.read",
        });
      }
    } catch {
      skipped += 1;
    }
  }

  return { stored, skipped };
}
