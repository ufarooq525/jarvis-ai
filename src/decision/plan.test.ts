import { describe, expect, it } from "vitest";
import { PHASE1_MANIFESTS } from "../tools/registry.js";
import { CapabilityCatalog } from "../capabilities/catalog.js";
import { BLOCKED_CAPABILITIES, parseAndValidatePlan } from "./plan.js";

const catalog = new CapabilityCatalog();
const byId = new Map(PHASE1_MANIFESTS.map((m) => [m.tool_id, m]));

describe("operator plan parse/validate", () => {
  it("accepts a routable computer plan", () => {
    const text = JSON.stringify({
      steps: [
        {
          capability_id: "computer.observe.snapshot",
          inputs: {},
          reason: "See machine state",
          expected_result: "snapshot",
          verification: "snapshot recorded",
        },
        {
          capability_id: "computer.open_app",
          inputs: { target_id: "notepad" },
          reason: "Open Notepad",
          expected_result: "app located",
          verification: "locate.found",
        },
      ],
    });
    const parsed = parseAndValidatePlan(text, catalog.list(), byId);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.plan.steps.map((s) => s.capability_id)).toEqual([
        "computer.observe.snapshot",
        "computer.open_app",
      ]);
    }
  });

  it("rejects blocked click and prose", () => {
    expect(
      parseAndValidatePlan(
        JSON.stringify({
          steps: [
            {
              capability_id: "computer.act.click",
              inputs: {},
              reason: "click",
              expected_result: "x",
              verification: "y",
            },
          ],
        }),
        catalog.list(),
        byId,
      ).ok,
    ).toBe(false);
    expect(BLOCKED_CAPABILITIES.has("computer.act.click")).toBe(true);
    expect(parseAndValidatePlan("not json at all", catalog.list(), byId).ok).toBe(false);
  });

  it("rejects missing required target_id", () => {
    const parsed = parseAndValidatePlan(
      JSON.stringify({
        steps: [
          {
            capability_id: "computer.locate",
            inputs: {},
            reason: "find app",
            expected_result: "located",
            verification: "found",
          },
        ],
      }),
      catalog.list(),
      byId,
    );
    expect(parsed.ok).toBe(false);
  });
});
