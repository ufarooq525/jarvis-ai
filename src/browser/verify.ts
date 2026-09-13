import type { BrowserActionRecord, BrowserFetchRecord, ResearchFact } from "./types.js";
import { BROWSER_SHADOW_READ_NOTICE, BROWSER_SIMULATED_NOTICE } from "./types.js";

export function verifyShadowResearch(input: {
  action: BrowserActionRecord;
  fetch: BrowserFetchRecord;
  facts: ResearchFact[];
}): BrowserActionRecord["verification"] {
  const checks: NonNullable<BrowserActionRecord["verification"]>["checks"] = [];

  checks.push({
    id: "before_observation",
    ok: Boolean(input.action.before?.snapshot_summary),
    detail: input.action.before ? "Before snapshot captured" : "Missing before observation",
  });

  checks.push({
    id: "after_observation",
    ok: Boolean(input.action.after?.snapshot_summary),
    detail: input.action.after ? "After snapshot captured" : "Missing after observation",
  });

  checks.push({
    id: "visited_iff_ok",
    ok: input.fetch.visited === input.fetch.ok,
    detail: input.fetch.visited
      ? `Visited ${input.fetch.url} at ${input.fetch.fetched_at}`
      : `Not visited (${input.fetch.error ?? "fetch failed"}) — no false visit claim`,
  });

  checks.push({
    id: "facts_have_source",
    ok: input.facts.every((f) => Boolean(f.source_url) && Boolean(f.fetched_at)),
    detail: "Every fact has source_url + fetched_at",
  });

  checks.push({
    id: "claim_kinds_present",
    ok:
      input.action.simulated ||
      input.facts.some((f) => f.kind === "fact" || f.kind === "uncertainty"),
    detail: input.action.simulated
      ? "Simulate-only path — no claims required"
      : "Facts distinguish fact / inference / uncertainty where applicable",
  });

  checks.push({
    id: "shadow_no_click",
    ok: input.action.mode === "shadow",
    detail: BROWSER_SHADOW_READ_NOTICE,
  });

  checks.push({
    id: "no_simulated_visit_lie",
    ok: !(input.action.simulated && input.fetch.visited),
    detail: input.action.simulated
      ? BROWSER_SIMULATED_NOTICE
      : "Fetch path is not labeled SIMULATED when visited",
  });

  const passed = checks.every((c) => c.ok);
  return {
    passed,
    checks,
    summary: passed
      ? `Shadow research verified — ${BROWSER_SHADOW_READ_NOTICE}`
      : `Shadow research verification failed: ${checks
          .filter((c) => !c.ok)
          .map((c) => c.id)
          .join(", ")}`,
  };
}
