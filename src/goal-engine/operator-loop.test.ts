import { describe, expect, it, beforeEach } from "vitest";
import { GoalEngine } from "./engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { BrowserRuntime } from "../browser/runtime.js";
import { resetFactStore } from "../world-model/fact-store.js";
import { resetOpportunityStore } from "../ops/opportunity-store.js";
import { getOpportunityStore } from "../ops/opportunity-store.js";

describe("operator loop — research observations", () => {
  beforeEach(() => {
    resetFactStore();
    resetOpportunityStore();
  });

  it("creates an opportunity only from a qualifying observed candidate", async () => {
    const adapter = new MockOsRuntimeAdapter();
    const browser = new BrowserRuntime({
      fetcher: async () => ({
        ok: true,
        status: 200,
        content_type: "text/html",
        body: `<html><head><title>Directory</title></head><body>
          <p>Riyadh Laravel Labs is a Saudi SaaS company building subscription products.</p>
        </body></html>`,
      }),
    });
    const engine = new GoalEngine(adapter, {
      browser,
      execution: { browser_fetch: true, timeout_ms: 2000, max_attempts: 2 },
    });

    const result = await engine.runShadowLoop({
      outcome: "Find 1 Laravel SaaS opportunity in Saudi Arabia.",
    });

    expect(result.normalized.plan_kind).toBe("research");
    expect(result.runs.some((r) => r.tool_invocations.includes("browser.research"))).toBe(true);
    expect(result.runs.some((r) => r.tool_invocations.includes("ops.opportunity.create"))).toBe(true);

    const researchKr = result.goal.key_results.find(
      (kr) => kr.metric_ref === "research.opportunity_count",
    );
    expect(researchKr?.target).toBe(1);
    expect(researchKr?.current).toBe(1);
    expect(getOpportunityStore().list().length).toBe(1);
    expect(result.verification.passed).toBe(true);
    expect(result.goal.status).toBe("done");
    expect(result.decision_outcome).toBe("act");
  });
});
