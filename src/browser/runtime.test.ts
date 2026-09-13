import { describe, expect, it } from "vitest";
import { EvidenceChain } from "../evidence/chain.js";
import { isAllowlistedUrl } from "./allowlist.js";
import { getBrowserSnapshot } from "./observe.js";
import { BrowserRuntime } from "./runtime.js";
import { BROWSER_SHADOW_READ_NOTICE, BROWSER_SIMULATED_NOTICE } from "./types.js";

describe("Phase 6 BrowserRuntime", () => {
  it("snapshot advertises shadow plane with click/publish blocked", () => {
    const snap = getBrowserSnapshot();
    expect(snap.plane).toBe("shadow");
    expect(snap.fetch_enabled).toBe(true);
    expect(snap.capabilities.shadow_research).toBe(true);
    expect(snap.capabilities.click).toBe(false);
    expect(snap.capabilities.publish).toBe(false);
  });

  it("allowlists example.com and rejects unknown hosts", () => {
    expect(isAllowlistedUrl("https://example.com/").ok).toBe(true);
    expect(isAllowlistedUrl("https://evil.example.net/").ok).toBe(false);
    expect(isAllowlistedUrl("javascript:alert(1)").ok).toBe(false);
  });

  it("simulate_only never claims visit", async () => {
    const runtime = new BrowserRuntime({
      fetcher: async () => {
        throw new Error("should not fetch");
      },
    });
    const result = await runtime.runShadowResearch({
      url: "https://example.com/",
      simulate_only: true,
    });
    expect(result.simulated).toBe(true);
    expect(result.notice).toBe(BROWSER_SIMULATED_NOTICE);
    expect(result.action.fetch?.visited).toBe(false);
    expect(result.action.verification?.passed).toBe(true);
  });

  it("shadow research fetches allowlisted page and extracts fact kinds", async () => {
    const evidence = new EvidenceChain();
    const runtime = new BrowserRuntime({
      evidence,
      fetcher: async () => ({
        ok: true,
        status: 200,
        content_type: "text/html",
        body: "<html><head><title>Example Domain</title></head><body><p>This domain is for use in documentation examples without needing permission. Avoid use in operations.</p></body></html>",
      }),
    });
    const result = await runtime.runShadowResearch({
      url: "https://example.com/",
      goal_id: "goal_browser_test",
    });
    expect(result.simulated).toBe(false);
    expect(result.notice).toBe(BROWSER_SHADOW_READ_NOTICE);
    expect(result.action.fetch?.visited).toBe(true);
    expect(result.facts.some((f) => f.kind === "fact")).toBe(true);
    expect(result.facts.some((f) => f.kind === "uncertainty")).toBe(true);
    expect(result.facts.every((f) => f.source_url && f.fetched_at)).toBe(true);
    expect(result.action.verification?.passed).toBe(true);

    const nodes = evidence.chainForGoal("goal_browser_test");
    expect(nodes.some((n) => n.kind === "tool_invocation")).toBe(true);
    expect(nodes.some((n) => n.kind === "expected_vs_actual")).toBe(true);
  });

  it("does not claim visit when fetch fails", async () => {
    const runtime = new BrowserRuntime({
      fetcher: async () => ({ ok: false, status: 503, body: "" }),
    });
    const result = await runtime.runShadowResearch({ url: "https://example.com/" });
    expect(result.action.fetch?.visited).toBe(false);
    expect(result.action.ok).toBe(false);
  });

  it("rejects non-allowlisted hosts without fetching", async () => {
    let fetched = false;
    const runtime = new BrowserRuntime({
      fetcher: async () => {
        fetched = true;
        return { ok: true, status: 200, body: "x" };
      },
    });
    const result = await runtime.runShadowResearch({ url: "https://not-allowed.example.net/" });
    expect(fetched).toBe(false);
    expect(result.action.fetch?.visited).toBe(false);
    expect(result.action.fetch?.error).toMatch(/not allowlisted/i);
  });

  it("dedupes repeated claims", async () => {
    const runtime = new BrowserRuntime({
      fetcher: async () => ({
        ok: true,
        status: 200,
        body: "<title>Same</title><p>Hello world paragraph that is long enough to extract as a sentence for tests.</p>",
      }),
    });
    await runtime.runShadowResearch({ url: "https://example.com/" });
    const second = await runtime.runShadowResearch({ url: "https://example.com/" });
    expect(second.duplicates_skipped).toBeGreaterThan(0);
  });

  it("blocks click/type/scroll/publish", () => {
    const runtime = new BrowserRuntime();
    expect(() => runtime.assertActAllowed("click")).toThrow(/blocked/);
    expect(() => runtime.assertActAllowed("type")).toThrow(/blocked/);
    expect(() => runtime.assertActAllowed("scroll")).toThrow(/blocked/);
    expect(() => runtime.assertActAllowed("publish")).toThrow(/blocked/);
  });
});
