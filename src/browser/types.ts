/** Browser plane types — separate from Goal Engine / ComputerRuntime. */

export type BrowserActionKind =
  | "observe"
  | "list_allowlist"
  | "fetch"
  | "extract"
  | "research"
  | "click"
  | "type"
  | "scroll"
  | "publish";

export type ResearchClaimKind = "fact" | "inference" | "uncertainty";

export interface ResearchFact {
  id: string;
  claim: string;
  kind: ResearchClaimKind;
  source_url: string;
  fetched_at: string;
  confidence: number;
  /** Dedup key: hash(claim + source_url) */
  dedupe_key: string;
}

export interface BrowserFetchRecord {
  url: string;
  ok: boolean;
  status?: number;
  fetched_at: string;
  /** True only when HTTP GET succeeded and body was read. */
  visited: boolean;
  content_type?: string;
  title?: string;
  text_preview?: string;
  error?: string;
  bytes?: number;
}

export interface BrowserObservation {
  at: string;
  kind: "before" | "after" | "standalone";
  snapshot_summary: string;
}

export interface BrowserActionRecord {
  id: string;
  action: BrowserActionKind;
  mode: "shadow" | "live";
  /** False when a real allowlisted GET succeeded; true only for pure no-network simulate. */
  simulated: boolean;
  simulated_notice: string;
  started_at: string;
  finished_at: string;
  ok: boolean;
  summary: string;
  before?: BrowserObservation;
  after?: BrowserObservation;
  fetch?: BrowserFetchRecord;
  facts?: ResearchFact[];
  verification?: {
    passed: boolean;
    checks: Array<{ id: string; ok: boolean; detail: string }>;
    summary: string;
  };
}

export const BROWSER_SIMULATED_NOTICE =
  "SIMULATED / No external browser action was performed";

export const BROWSER_SHADOW_READ_NOTICE =
  "SHADOW read-only / Allowlisted GET only — click/type/publish blocked";
