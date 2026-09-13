/** Phase 8 — Skill acquisition types (SHADOW by default). */

export type SkillStatus =
  | "candidate"
  | "practicing"
  | "verified"
  | "retired";

export type SkillTrust = "SHADOW" | "LIMITED" | "APPROVED";

export interface SkillConcept {
  id: string;
  label: string;
}

export interface SkillProcedureStep {
  order: number;
  instruction: string;
}

export interface SkillPracticeResult {
  at: string;
  ok: boolean;
  checklist: Array<{ id: string; ok: boolean; detail: string }>;
  summary: string;
  /** Always true in Phase 8 — no real side effects. */
  simulated: true;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  status: SkillStatus;
  trust_tier: SkillTrust;
  summary: string;
  concepts: SkillConcept[];
  procedure: SkillProcedureStep[];
  constraints: string[];
  examples: string[];
  /** Provenance: source label + optional URLs / fact ids */
  provenance: {
    source: string;
    source_urls: string[];
    fact_ids: string[];
    ingested_at: string;
  };
  practice?: SkillPracticeResult;
  verified_at?: string;
  retired_at?: string;
  created_at: string;
  updated_at: string;
}

export const SKILL_SIMULATED_NOTICE =
  "SIMULATED / Skill practice performed no external action";
