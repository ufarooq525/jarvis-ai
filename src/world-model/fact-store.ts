import { createHash } from "node:crypto";
import { newId, nowIso } from "../util/ids.js";
import { assertNoSecrets } from "./secrets.js";
import type { WmFact, WmFactKind, WmFactStatus, WmLink } from "./types.js";

const DEFAULT_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function factDedupeKey(claim: string, source_url?: string): string {
  return createHash("sha256")
    .update(`${claim}|${source_url ?? ""}`)
    .digest("hex")
    .slice(0, 16);
}

export interface UpsertFactInput {
  claim: string;
  kind: WmFactKind;
  confidence: number;
  source: string;
  source_url?: string;
  fetched_at?: string;
  goal_id?: string;
  task_id?: string;
  dedupe_key?: string;
  stale_after_ms?: number;
  status?: WmFactStatus;
}

/** In-memory fact/link store — base for PersistedFactStore. */
export class FactStore {
  protected readonly facts = new Map<string, WmFact>();
  protected readonly byDedupe = new Map<string, string>();
  protected readonly links = new Map<string, WmLink>();

  upsertFact(input: UpsertFactInput): WmFact {
    const claim = input.claim.trim();
    if (!claim) throw new Error("claim is required");
    assertNoSecrets(claim);
    if (input.source_url) assertNoSecrets(input.source_url, "source_url");

    const now = nowIso();
    const dedupe_key = input.dedupe_key ?? factDedupeKey(claim, input.source_url);
    const existingId = this.byDedupe.get(dedupe_key);
    const stale_after = new Date(
      Date.now() + (input.stale_after_ms ?? DEFAULT_STALE_MS),
    ).toISOString();

    if (existingId) {
      const prev = this.facts.get(existingId)!;
      const updated: WmFact = {
        ...prev,
        claim,
        kind: input.kind,
        confidence: input.confidence,
        source: input.source,
        source_url: input.source_url,
        fetched_at: input.fetched_at ?? prev.fetched_at,
        verified_at: now,
        stale_after,
        goal_id: input.goal_id ?? prev.goal_id,
        task_id: input.task_id ?? prev.task_id,
        status: input.status ?? (prev.status === "invalidated" ? "invalidated" : "active"),
        updated_at: now,
      };
      this.facts.set(updated.id, updated);
      return updated;
    }

    const row: WmFact = {
      id: newId("wmf"),
      claim,
      kind: input.kind,
      status: input.status ?? "active",
      confidence: input.confidence,
      source: input.source,
      source_url: input.source_url,
      fetched_at: input.fetched_at,
      verified_at: now,
      stale_after,
      goal_id: input.goal_id,
      task_id: input.task_id,
      dedupe_key,
      created_at: now,
      updated_at: now,
    };
    this.facts.set(row.id, row);
    this.byDedupe.set(dedupe_key, row.id);
    return row;
  }

  getFact(id: string): WmFact | undefined {
    this.touchStale();
    return this.facts.get(id);
  }

  listFacts(filter?: {
    goal_id?: string;
    task_id?: string;
    q?: string;
    kind?: WmFactKind;
    status?: WmFactStatus;
  }): WmFact[] {
    this.touchStale();
    let rows = [...this.facts.values()];
    if (filter?.goal_id) rows = rows.filter((f) => f.goal_id === filter.goal_id);
    if (filter?.task_id) rows = rows.filter((f) => f.task_id === filter.task_id);
    if (filter?.kind) rows = rows.filter((f) => f.kind === filter.kind);
    if (filter?.status) rows = rows.filter((f) => f.status === filter.status);
    if (filter?.q?.trim()) {
      const needle = filter.q.trim().toLowerCase();
      rows = rows.filter(
        (f) =>
          f.claim.toLowerCase().includes(needle) ||
          (f.source_url ?? "").toLowerCase().includes(needle) ||
          f.source.toLowerCase().includes(needle),
      );
    }
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  invalidate(id: string, reason?: string): WmFact {
    const row = this.facts.get(id);
    if (!row) throw new Error(`Fact not found: ${id}`);
    row.status = "invalidated";
    row.updated_at = nowIso();
    if (reason) {
      row.source = `${row.source}|invalidated:${reason.slice(0, 80)}`;
    }
    this.facts.set(id, row);
    return row;
  }

  reverify(id: string): WmFact {
    const row = this.facts.get(id);
    if (!row) throw new Error(`Fact not found: ${id}`);
    if (row.status === "invalidated") {
      throw new Error("Cannot reverify invalidated fact — create a new observation");
    }
    const now = nowIso();
    row.status = "active";
    row.verified_at = now;
    row.stale_after = new Date(Date.now() + DEFAULT_STALE_MS).toISOString();
    row.updated_at = now;
    this.facts.set(id, row);
    return row;
  }

  addLink(input: {
    from_id: string;
    to_id: string;
    rel: string;
    confidence?: number;
    provenance: string;
  }): WmLink {
    const row: WmLink = {
      id: newId("wml"),
      from_id: input.from_id,
      to_id: input.to_id,
      rel: input.rel.trim() || "related",
      confidence: input.confidence ?? 0.7,
      provenance: input.provenance,
      created_at: nowIso(),
    };
    this.links.set(row.id, row);
    return row;
  }

  listLinks(filter?: { from_id?: string; to_id?: string }): WmLink[] {
    let rows = [...this.links.values()];
    if (filter?.from_id) rows = rows.filter((l) => l.from_id === filter.from_id);
    if (filter?.to_id) rows = rows.filter((l) => l.to_id === filter.to_id);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  counts(): { active: number; stale: number; invalidated: number } {
    this.touchStale();
    let active = 0;
    let stale = 0;
    let invalidated = 0;
    for (const f of this.facts.values()) {
      if (f.status === "active") active += 1;
      else if (f.status === "stale") stale += 1;
      else if (f.status === "invalidated") invalidated += 1;
    }
    return { active, stale, invalidated };
  }

  clear(): void {
    this.facts.clear();
    this.byDedupe.clear();
    this.links.clear();
  }

  /** Mark past stale_after as stale (not invalidated). */
  touchStale(): void {
    const now = Date.now();
    for (const f of this.facts.values()) {
      if (f.status === "active" && f.stale_after && Date.parse(f.stale_after) <= now) {
        f.status = "stale";
        f.updated_at = nowIso();
        this.facts.set(f.id, f);
      }
    }
  }

  protected loadFact(row: WmFact): void {
    this.facts.set(row.id, row);
    this.byDedupe.set(row.dedupe_key, row.id);
  }

  protected loadLink(row: WmLink): void {
    this.links.set(row.id, row);
  }

  protected allFacts(): WmFact[] {
    return [...this.facts.values()];
  }

  protected allLinks(): WmLink[] {
    return [...this.links.values()];
  }
}

let singleton: FactStore | null = null;

export function getFactStore(): FactStore {
  if (!singleton) singleton = new FactStore();
  return singleton;
}

export function bindFactStore(store: FactStore): void {
  singleton = store;
}

export function resetFactStore(): void {
  singleton?.clear();
  singleton = null;
}
