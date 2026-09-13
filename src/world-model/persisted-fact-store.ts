import type { JarvisDb } from "../db/client.js";
import { FactStore, type UpsertFactInput } from "./fact-store.js";
import type { WmFact, WmLink } from "./types.js";

/** Write-through SQLite fact store. */
export class PersistedFactStore extends FactStore {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    const facts = this.db.prepare("SELECT json FROM wm_facts").all() as { json: string }[];
    for (const row of facts) {
      this.loadFact(JSON.parse(row.json) as WmFact);
    }
    const links = this.db.prepare("SELECT json FROM wm_links").all() as { json: string }[];
    for (const row of links) {
      this.loadLink(JSON.parse(row.json) as WmLink);
    }
  }

  private persistFact(row: WmFact): void {
    this.db
      .prepare(
        `INSERT INTO wm_facts (
          id, claim, kind, status, confidence, source, source_url, fetched_at,
          verified_at, stale_after, goal_id, task_id, dedupe_key, json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          claim = excluded.claim,
          kind = excluded.kind,
          status = excluded.status,
          confidence = excluded.confidence,
          source = excluded.source,
          source_url = excluded.source_url,
          fetched_at = excluded.fetched_at,
          verified_at = excluded.verified_at,
          stale_after = excluded.stale_after,
          goal_id = excluded.goal_id,
          task_id = excluded.task_id,
          dedupe_key = excluded.dedupe_key,
          json = excluded.json`,
      )
      .run(
        row.id,
        row.claim,
        row.kind,
        row.status,
        row.confidence,
        row.source,
        row.source_url ?? null,
        row.fetched_at ?? null,
        row.verified_at,
        row.stale_after ?? null,
        row.goal_id ?? null,
        row.task_id ?? null,
        row.dedupe_key,
        JSON.stringify(row),
      );
  }

  private persistLink(row: WmLink): void {
    this.db
      .prepare(
        `INSERT INTO wm_links (id, from_id, to_id, rel, confidence, provenance, json)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           from_id = excluded.from_id,
           to_id = excluded.to_id,
           rel = excluded.rel,
           confidence = excluded.confidence,
           provenance = excluded.provenance,
           json = excluded.json`,
      )
      .run(
        row.id,
        row.from_id,
        row.to_id,
        row.rel,
        row.confidence,
        row.provenance,
        JSON.stringify(row),
      );
  }

  override upsertFact(input: UpsertFactInput): WmFact {
    const row = super.upsertFact(input);
    this.persistFact(row);
    return row;
  }

  override invalidate(id: string, reason?: string): WmFact {
    const row = super.invalidate(id, reason);
    this.persistFact(row);
    return row;
  }

  override reverify(id: string): WmFact {
    const row = super.reverify(id);
    this.persistFact(row);
    return row;
  }

  override addLink(input: {
    from_id: string;
    to_id: string;
    rel: string;
    confidence?: number;
    provenance: string;
  }): WmLink {
    const row = super.addLink(input);
    this.persistLink(row);
    return row;
  }

  override touchStale(): void {
    super.touchStale();
    for (const row of this.allFacts()) {
      if (row.status === "stale") this.persistFact(row);
    }
  }

  override clear(): void {
    super.clear();
    try {
      this.db.exec("DELETE FROM wm_links; DELETE FROM wm_facts;");
    } catch {
      /* DB may already be closed */
    }
  }
}
