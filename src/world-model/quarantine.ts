import { createHash } from "node:crypto";
import { newId, nowIso } from "../util/ids.js";
import type { QuarantineRecord } from "./types.js";

const MAX_SAFE_CHARS = 240;

/** In-memory quarantine — untrusted adapter text never becomes LTM fact. */
const quarantine: QuarantineRecord[] = [];

export function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/**
 * Fail-closed sanitize for durable evidence / WM summaries.
 * Long or adapter-sourced blobs → quarantine + short safe stub.
 */
export function quarantineAdapterText(input: {
  source: string;
  text: string;
  goal_id?: string;
}): { safe_summary: string; quarantined: boolean; record?: QuarantineRecord } {
  const raw = input.text ?? "";
  const suspicious =
    raw.length > MAX_SAFE_CHARS ||
    /ignore previous|system prompt|<\/?script/i.test(raw) ||
    input.source.startsWith("adapter.");

  if (!suspicious && raw.length <= MAX_SAFE_CHARS) {
    return { safe_summary: raw, quarantined: false };
  }

  const record: QuarantineRecord = {
    id: newId("qtn"),
    source: input.source,
    text_hash: hashText(raw),
    text_preview: raw.slice(0, 80).replace(/\s+/g, " "),
    created_at: nowIso(),
    status: "quarantined",
    goal_id: input.goal_id,
  };
  quarantine.push(record);

  return {
    safe_summary: `[quarantined:${record.text_hash} from ${input.source}]`,
    quarantined: true,
    record,
  };
}

export function listQuarantine(): QuarantineRecord[] {
  return [...quarantine].reverse();
}

export function resetQuarantine(): void {
  quarantine.length = 0;
}
