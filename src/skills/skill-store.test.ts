import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { FactStore, bindFactStore, getFactStore, resetFactStore } from "../world-model/fact-store.js";
import { extractSkillDraft } from "./extract.js";
import { ingestFactsToSkill, ingestTextToSkill } from "./ingest.js";
import { SkillStore, bindSkillStore, getSkillStore, resetSkillStore } from "./skill-store.js";

describe("Phase 8 SkillStore", () => {
  beforeEach(() => {
    resetSkillStore();
    resetFactStore();
    bindSkillStore(new SkillStore());
    bindFactStore(new FactStore());
  });

  afterEach(() => {
    resetSkillStore();
    resetFactStore();
  });

  it("extracts numbered steps into a procedure", () => {
    const draft = extractSkillDraft(
      [
        "Qualify a SaaS lead",
        "1. Read the brief",
        "2. Check budget signals",
        "3. Score fit 1-5",
        "Never send pricing without approval",
        "Example: Upwork proposal checklist",
      ].join("\n"),
    );
    expect(draft.procedure.length).toBeGreaterThanOrEqual(3);
    expect(draft.constraints.some((c) => /never/i.test(c))).toBe(true);
  });

  it("ingests text → practice → verify (still SHADOW)", () => {
    const skill = ingestTextToSkill({
      text: "Research competitor\n1. Open allowlisted page\n2. Extract title\n3. Store fact",
      title: "Competitor page skim",
    });
    expect(skill.status).toBe("candidate");
    expect(skill.trust_tier).toBe("SHADOW");

    const practiced = getSkillStore().practice(skill.id);
    expect(practiced.practice?.ok).toBe(true);
    expect(practiced.practice?.simulated).toBe(true);

    const verified = getSkillStore().verify(skill.id);
    expect(verified.status).toBe("verified");
    expect(verified.trust_tier).toBe("SHADOW");
  });

  it("blocks verify before practice", () => {
    const skill = ingestTextToSkill({
      text: "1. Do thing\n2. Check thing",
      title: "Tiny",
    });
    expect(() => getSkillStore().verify(skill.id)).toThrow(/Practice must succeed/);
  });

  it("blocks execute always", () => {
    const skill = ingestTextToSkill({
      text: "1. A\n2. B",
      title: "X",
    });
    getSkillStore().practice(skill.id);
    getSkillStore().verify(skill.id);
    expect(() => getSkillStore().assertNotExecutable(skill.id)).toThrow(/not executable/);
  });

  it("derives candidate from WM facts", () => {
    const f = getFactStore().upsertFact({
      claim: "Example Domain is for documentation examples",
      kind: "observation",
      confidence: 0.9,
      source: "browser.research",
      source_url: "https://example.com/",
    });
    const skill = ingestFactsToSkill({ fact_ids: [f.id], title: "Use example.com safely" });
    expect(skill.provenance.fact_ids).toContain(f.id);
    expect(skill.provenance.source).toBe("wm.facts");
  });

  it("rejects secrets in ingest text", () => {
    expect(() =>
      ingestTextToSkill({
        text: "1. Use password=supersecretvalue123456",
        title: "Bad",
      }),
    ).toThrow(/secret/);
  });

  it("retires a skill", () => {
    const skill = ingestTextToSkill({ text: "1. A\n2. B", title: "Old" });
    const retired = getSkillStore().retire(skill.id, "obsolete");
    expect(retired.status).toBe("retired");
  });
});
