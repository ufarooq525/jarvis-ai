/** Phase 10 — Model router types (model-agnostic). */

export type ModelRole = "reason" | "code" | "vision" | "extract" | "classify";

export type ModelProviderId = "lmstudio" | "mock";

export interface ModelBackend {
  provider: ModelProviderId;
  /** OpenAI-compatible base, e.g. http://127.0.0.1:1234/v1 */
  base_url: string;
  model: string;
  version_label?: string;
}

export interface ModelCompletionRequest {
  role: ModelRole;
  prompt: string;
  system?: string;
  max_tokens?: number;
  temperature?: number;
}

export interface ModelProvenance {
  provider: ModelProviderId;
  model: string;
  role: ModelRole;
  version_label?: string;
  attempted: string[];
  at: string;
  latency_ms: number;
}

export interface ModelCompletionResult {
  ok: boolean;
  text: string;
  simulated: boolean;
  provenance: ModelProvenance;
  error?: string;
  /** Never treat as verification truth. */
  notice: string;
}

export interface ModelHealth {
  provider: ModelProviderId;
  reachable: boolean;
  base_url: string;
  models: string[];
  error?: string;
  checked_at: string;
}

export const MODEL_OUTPUT_NOTICE =
  "Model output is advisory only — not a source of truth for verification";
