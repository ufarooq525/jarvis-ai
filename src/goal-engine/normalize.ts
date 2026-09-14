import type { KeyResult } from "../types/model.js";
import { newId } from "../util/ids.js";
import {
  COMPUTER_TYPE_PLAN_KIND,
  extractComputerTargetId,
  extractTypeText,
  isComputerTypeOutcome,
} from "./computer-type.js";

/** Structured fields extracted from a natural-language outcome (no LLM). */
export interface NormalizedOutcome {
  title: string;
  outcome: string;
  domain: string;
  /** Optional geography / market scope when detected. */
  geography?: string;
  /** Optional countable target (e.g. "10 opportunities"). */
  target_count?: number;
  /** Text to type when plan_kind is computer_type. */
  type_text?: string;
  computer_target_id?: "notepad" | "cursor";
  /** Short constraint phrases preserved for decomposition / KRs. */
  constraints: string[];
  key_results: KeyResult[];
  /** Kind hint for deterministic decomposer templates. */
  plan_kind: "research" | "ops" | "general" | "computer_type";
}

const GEO_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bsaudi\s+arabia\b/i, label: "Saudi Arabia" },
  { re: /\buae\b|\bunited\s+arab\s+emirates\b/i, label: "UAE" },
  { re: /\buk\b|\bunited\s+kingdom\b/i, label: "United Kingdom" },
  { re: /\busa\b|\bunited\s+states\b/i, label: "United States" },
];

function inferDomain(outcome: string, explicit?: string): string {
  if (explicit && explicit !== "general") return explicit;
  const o = outcome.toLowerCase();
  if (/\b(opportunit\w*|prospects?|leads?|clients?|outreach|sales)\b/.test(o)) return "sales";
  if (/\b(research|find|discover|survey|competitors?)\b/.test(o)) return "research";
  if (/\b(overview|ops|operations|weekly|company)\b/.test(o)) return "ops";
  return explicit ?? "general";
}

function inferPlanKind(domain: string, outcome: string): NormalizedOutcome["plan_kind"] {
  if (isComputerTypeOutcome(outcome)) return COMPUTER_TYPE_PLAN_KIND;
  if (domain === "sales" || domain === "research") return "research";
  if (domain === "ops") return "ops";
  if (/\b(find|research|opportunit|prospect|lead)\b/i.test(outcome)) return "research";
  return "general";
}

function extractTargetCount(outcome: string): number | undefined {
  const m = outcome.match(/\b(\d{1,4})\b/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function extractGeography(outcome: string): string | undefined {
  for (const { re, label } of GEO_PATTERNS) {
    if (re.test(outcome)) return label;
  }
  const inMatch = outcome.match(/\bin\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)*)/);
  return inMatch?.[1];
}

function buildTitle(outcome: string, title?: string): string {
  if (title?.trim()) return title.trim();
  const cleaned = outcome.replace(/\s+/g, " ").trim();
  return cleaned.length > 80 ? `${cleaned.slice(0, 77)}...` : cleaned;
}

/**
 * Normalize a natural-language outcome into a structured goal draft.
 * Deterministic heuristics only — does not invent a second planner.
 */
export function normalizeOutcome(input: {
  outcome: string;
  title?: string;
  domain?: string;
}): NormalizedOutcome {
  const outcome = input.outcome.replace(/\s+/g, " ").trim();
  if (!outcome) {
    throw new Error("outcome is required");
  }

  const domain = inferDomain(outcome, input.domain?.trim());
  const geography = extractGeography(outcome);
  const target_count = extractTargetCount(outcome);
  const plan_kind = inferPlanKind(domain, outcome);
  const type_text = plan_kind === COMPUTER_TYPE_PLAN_KIND ? extractTypeText(outcome) : undefined;
  const computer_target_id =
    plan_kind === COMPUTER_TYPE_PLAN_KIND ? extractComputerTargetId(outcome) ?? "notepad" : undefined;

  const constraints: string[] = [];
  if (geography) constraints.push(`geography:${geography}`);
  if (target_count != null) constraints.push(`target_count:${target_count}`);
  if (/\blaravel\b/i.test(outcome)) constraints.push("stack:Laravel");
  if (/\bsaas\b/i.test(outcome)) constraints.push("product:SaaS");
  if (computer_target_id) constraints.push(`computer:${computer_target_id}`);

  const key_results: KeyResult[] = [
    {
      id: newId("kr"),
      label: "Shadow plan produced with evidence",
      metric_ref: "evidence.chain.length",
      target: 1,
    },
  ];

  if (plan_kind === "research" && target_count != null) {
    key_results.push({
      id: newId("kr"),
      label: `Identify ${target_count} qualifying opportunities (shadow)`,
      metric_ref: "research.opportunity_count",
      target: target_count,
      // Shadow: measured as planned target only until Live research exists
      current: 0,
    });
  }

  if (plan_kind === COMPUTER_TYPE_PLAN_KIND) {
    const app = computer_target_id === "cursor" ? "Cursor" : "Notepad";
    key_results.push({
      id: newId("kr"),
      label: `Type into identified ${app} window and verify resulting state`,
      metric_ref: "computer.type_verified",
      target: 1,
      current: 0,
    });
  }

  return {
    title: buildTitle(outcome, input.title),
    outcome,
    domain,
    geography,
    target_count,
    type_text,
    computer_target_id,
    constraints,
    key_results,
    plan_kind,
  };
}
