import { describe, expect, it, beforeEach, afterEach } from "vitest";
import type { ResearchFact } from "../browser/types.js";
import { FactStore, bindFactStore, getFactStore, resetFactStore } from "./fact-store.js";
import { ingestBrowserResearch } from "./ingest-research.js";
import { detectSecrets } from "./secrets.js";

describe("Phase 7 FactStore", () => {
  beforeEach(() => {
    resetFactStore();
    bindFactStore(new FactStore());
  });

  afterEach(() => {
    resetFactStore();
  });

  it("stores facts with provenance and retrieves by goal", () => {
    const store = getFactStore();
    store.upsertFact({
      claim: "Example Domain is for documentation",
      kind: "observation",
      confidence: 0.9,
      source: "browser.research",
      source_url: "https://example.com/",
      goal_id: "goal_1",
    });
    const rows = store.listFacts({ goal_id: "goal_1" });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.source_url).toBe("https://example.com/");
    expect(rows[0]!.kind).toBe("observation");
  });

  it("dedupes on claim+url", () => {
    const store = getFactStore();
    const a = store.upsertFact({
      claim: "Same claim",
      kind: "observation",
      confidence: 0.5,
      source: "test",
      source_url: "https://example.com/",
    });
    const b = store.upsertFact({
      claim: "Same claim",
      kind: "observation",
      confidence: 0.8,
      source: "test",
      source_url: "https://example.com/",
    });
    expect(a.id).toBe(b.id);
    expect(store.listFacts()).toHaveLength(1);
    expect(b.confidence).toBe(0.8);
  });

  it("invalidates and blocks reverify of invalidated", () => {
    const store = getFactStore();
    const f = store.upsertFact({
      claim: "Temp",
      kind: "inference",
      confidence: 0.4,
      source: "test",
    });
    store.invalidate(f.id, "wrong");
    expect(store.getFact(f.id)?.status).toBe("invalidated");
    expect(() => store.reverify(f.id)).toThrow(/Cannot reverify/);
  });

  it("reverifies stale/active facts", () => {
    const store = getFactStore();
    const f = store.upsertFact({
      claim: "Fresh later",
      kind: "observation",
      confidence: 0.7,
      source: "test",
      stale_after_ms: -1000,
    });
    expect(store.getFact(f.id)?.status).toBe("stale");
    const r = store.reverify(f.id);
    expect(r.status).toBe("active");
  });

  it("blocks secrets", () => {
    expect(detectSecrets("password=supersecretvalue123456").blocked).toBe(true);
    expect(() =>
      getFactStore().upsertFact({
        claim: "api_key=ABCDEFGHIJKLMNOPQRSTUV",
        kind: "observation",
        confidence: 1,
        source: "test",
      }),
    ).toThrow(/secret/);
  });

  it("ingests browser research into observations not conclusions", () => {
    const facts: ResearchFact[] = [
      {
        id: "f1",
        claim: "Page title: Example Domain",
        kind: "fact",
        source_url: "https://example.com/",
        fetched_at: new Date().toISOString(),
        confidence: 0.95,
        dedupe_key: "abc123",
      },
      {
        id: "f2",
        claim: "Maybe related",
        kind: "inference",
        source_url: "https://example.com/",
        fetched_at: new Date().toISOString(),
        confidence: 0.4,
        dedupe_key: "def456",
      },
    ];
    const out = ingestBrowserResearch({
      facts,
      goal_id: "goal_research",
      url: "https://example.com/",
    });
    expect(out.stored).toHaveLength(2);
    expect(out.stored.every((f) => f.kind !== "conclusion")).toBe(true);
    expect(out.links).toBe(2);
    expect(getFactStore().listFacts({ goal_id: "goal_research" }).length).toBe(2);
  });
});
