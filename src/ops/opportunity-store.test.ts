import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { FactStore, bindFactStore, getFactStore, resetFactStore } from "../world-model/fact-store.js";
import { createOpportunityFromFacts } from "./from-facts.js";
import {
  OpportunityStore,
  bindOpportunityStore,
  getOpportunityStore,
  resetOpportunityStore,
} from "./opportunity-store.js";

describe("Phase 9 OpportunityStore", () => {
  beforeEach(() => {
    resetOpportunityStore();
    resetFactStore();
    bindOpportunityStore(new OpportunityStore());
    bindFactStore(new FactStore());
  });

  afterEach(() => {
    resetOpportunityStore();
    resetFactStore();
  });

  it("creates, qualifies, drafts without sending", () => {
    const opp = getOpportunityStore().create({
      title: "Laravel SaaS rebuild for Riyadh startup",
      company: "NomadCo",
      channel: "upwork",
      summary: "Urgent Laravel API and SaaS billing work",
    });
    expect(opp.status).toBe("researching");
    const q = getOpportunityStore().qualify(opp.id);
    expect(q.status).toBe("qualified");
    expect(q.score?.overall).toBeGreaterThan(0);
    const d = getOpportunityStore().draft(opp.id);
    expect(d.status).toBe("drafted");
    expect(d.draft?.simulated).toBe(true);
    expect(d.draft?.body).toContain("not sent");
  });

  it("blocks send/publish/bid", () => {
    const opp = getOpportunityStore().create({ title: "Need React help", channel: "email" });
    getOpportunityStore().draft(opp.id);
    expect(() => getOpportunityStore().assertSendBlocked(opp.id)).toThrow(/blocked/);
  });

  it("builds opportunity from WM facts", () => {
    const f = getFactStore().upsertFact({
      claim: "Company seeks Laravel SaaS developer in KSA",
      kind: "observation",
      confidence: 0.8,
      source: "browser.research",
      source_url: "https://example.com/",
    });
    const opp = createOpportunityFromFacts({
      fact_ids: [f.id],
      title: "KSA Laravel lead",
      channel: "web",
    });
    expect(opp.provenance.fact_ids).toContain(f.id);
    expect(opp.status).toBe("qualified");
  });
});
