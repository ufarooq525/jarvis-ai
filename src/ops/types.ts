/** Phase 9 — Personal Business Operator (SHADOW drafts only). */

export type OpportunityStatus =
  | "researching"
  | "qualified"
  | "drafted"
  | "awaiting_approval"
  | "closed"
  | "retired";

export type OpportunityChannel =
  | "upwork"
  | "fiverr"
  | "linkedin"
  | "email"
  | "web"
  | "other";

export interface OpportunityScore {
  fit: number;
  urgency: number;
  value: number;
  overall: number;
  rationale: string;
}

export interface ApproachDraft {
  subject: string;
  body: string;
  channel: OpportunityChannel;
  simulated: true;
  notice: string;
  created_at: string;
}

export interface Opportunity {
  id: string;
  title: string;
  company?: string;
  channel: OpportunityChannel;
  status: OpportunityStatus;
  summary: string;
  problems: string[];
  score?: OpportunityScore;
  draft?: ApproachDraft;
  provenance: {
    source: string;
    fact_ids: string[];
    skill_ids: string[];
    created_at: string;
  };
  created_at: string;
  updated_at: string;
}

export const OPS_DRAFT_NOTICE =
  "SHADOW draft only — no email/DM/bid/publish was performed";
