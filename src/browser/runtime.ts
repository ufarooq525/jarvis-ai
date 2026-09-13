import type { EvidenceChain } from "../evidence/chain.js";
import { JARVIS_PRINCIPAL } from "../trust/principals.js";
import { quarantineAdapterText } from "../world-model/quarantine.js";
import { newId, nowIso } from "../util/ids.js";
import { listAllowlist } from "./allowlist.js";
import { extractFactsFromFetch } from "./extract.js";
import { fetchAllowlistedPage, type PageFetcher } from "./fetch.js";
import { getBrowserSnapshot } from "./observe.js";
import type {
  BrowserActionKind,
  BrowserActionRecord,
  BrowserObservation,
  ResearchFact,
} from "./types.js";
import { BROWSER_SHADOW_READ_NOTICE, BROWSER_SIMULATED_NOTICE } from "./types.js";
import { verifyShadowResearch } from "./verify.js";

export interface BrowserShadowResearchResult {
  url: string;
  action: BrowserActionRecord;
  facts: ResearchFact[];
  duplicates_skipped: number;
  message: string;
  simulated: boolean;
  notice: string;
}

export interface BrowserRuntimeOptions {
  evidence?: EvidenceChain;
  fetcher?: PageFetcher;
}

/**
 * BrowserRuntime — capability layer separate from Goal Engine / Computer.
 * Phase 6: observe + allowlist + SHADOW read-only research.
 * Click/type/scroll/publish remain blocked.
 */
export class BrowserRuntime {
  private readonly evidence?: EvidenceChain;
  private readonly fetcher?: PageFetcher;
  private readonly seenFactKeys = new Set<string>();

  constructor(evidenceOrOpts?: EvidenceChain | BrowserRuntimeOptions) {
    if (evidenceOrOpts && "append" in evidenceOrOpts) {
      this.evidence = evidenceOrOpts;
    } else {
      this.evidence = evidenceOrOpts?.evidence;
      this.fetcher = evidenceOrOpts?.fetcher;
    }
  }

  observe(kind: BrowserObservation["kind"] = "standalone"): BrowserObservation {
    const snap = getBrowserSnapshot();
    return {
      at: snap.at,
      kind,
      snapshot_summary: `${snap.host.hostname} ${snap.host.platform}; plane=${snap.plane}; fetch=${snap.fetch_enabled}`,
    };
  }

  listAllowlist() {
    return listAllowlist();
  }

  async runShadowResearch(input: {
    url: string;
    goal_id?: string;
    /** When true, do not network — return SIMULATED plan only. */
    simulate_only?: boolean;
  }): Promise<BrowserShadowResearchResult> {
    const url = input.url.trim();
    if (!url) throw new Error("url is required");

    const before = this.observe("before");
    const started_at = nowIso();
    const action_id = newId("bact");

    if (input.simulate_only) {
      const after = this.observe("after");
      const action: BrowserActionRecord = {
        id: action_id,
        action: "research",
        mode: "shadow",
        simulated: true,
        simulated_notice: BROWSER_SIMULATED_NOTICE,
        started_at,
        finished_at: nowIso(),
        ok: true,
        summary: `SHADOW would research ${url} — ${BROWSER_SIMULATED_NOTICE}`,
        before,
        after,
        fetch: {
          url,
          ok: false,
          fetched_at: nowIso(),
          visited: false,
          error: "simulate_only — no network",
        },
        facts: [],
      };
      action.verification = verifyShadowResearch({
        action,
        fetch: action.fetch!,
        facts: [],
      });
      // simulate_only: visited false + simulated true is ok for no_simulated_visit_lie
      if (input.goal_id && this.evidence) this.appendEvidence(input.goal_id, action);
      return {
        url,
        action,
        facts: [],
        duplicates_skipped: 0,
        message: action.summary,
        simulated: true,
        notice: BROWSER_SIMULATED_NOTICE,
      };
    }

    const fetchRec = await fetchAllowlistedPage(url, this.fetcher);
    const { facts, duplicates_skipped } = extractFactsFromFetch(fetchRec, this.seenFactKeys);

    // Quarantine long previews before evidence summaries
    if (fetchRec.text_preview) {
      const q = quarantineAdapterText({
        source: "adapter.browser.page",
        text: fetchRec.text_preview,
        goal_id: input.goal_id,
      });
      fetchRec.text_preview = q.safe_summary;
    }

    const after = this.observe("after");
    const action: BrowserActionRecord = {
      id: action_id,
      action: "research",
      mode: "shadow",
      simulated: false,
      simulated_notice: BROWSER_SHADOW_READ_NOTICE,
      started_at,
      finished_at: nowIso(),
      ok: fetchRec.visited,
      summary: fetchRec.visited
        ? `SHADOW researched ${url} (visited=${fetchRec.visited}) — ${facts.length} claims — ${BROWSER_SHADOW_READ_NOTICE}`
        : `SHADOW research did not visit ${url}: ${fetchRec.error ?? "failed"}`,
      before,
      after,
      fetch: fetchRec,
      facts,
    };

    action.verification = verifyShadowResearch({ action, fetch: fetchRec, facts });
    action.ok = Boolean(action.verification?.passed) && fetchRec.visited;

    if (input.goal_id && this.evidence) {
      this.appendEvidence(input.goal_id, action);
    }

    return {
      url,
      action,
      facts,
      duplicates_skipped,
      message: action.summary,
      simulated: false,
      notice: BROWSER_SHADOW_READ_NOTICE,
    };
  }

  assertActAllowed(action: BrowserActionKind): void {
    const blocked: BrowserActionKind[] = ["click", "type", "scroll", "publish"];
    if (blocked.includes(action)) {
      throw new Error(
        `Browser act '${action}' blocked — Phase 6 is SHADOW read-only research only`,
      );
    }
  }

  private appendEvidence(goal_id: string, action: BrowserActionRecord): void {
    if (!this.evidence) return;
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "observation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `browser before: ${action.before?.snapshot_summary ?? "-"}`,
      simulated: action.simulated,
      correlation: { tool_id: "browser.research" },
    });
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "tool_invocation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: action.summary,
      simulated: action.simulated,
      correlation: { tool_id: "browser.research" },
    });
    const factLine = (action.facts ?? [])
      .slice(0, 3)
      .map((f) => `[${f.kind}] ${f.claim.slice(0, 80)}`)
      .join("; ");
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "observation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `browser facts: ${factLine || "(none)"}`,
      simulated: action.simulated,
      correlation: { tool_id: "browser.extract" },
    });
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `browser verify: ${action.verification?.summary ?? "n/a"}`,
      simulated: action.simulated,
      correlation: { tool_id: "browser.research" },
    });
  }
}
