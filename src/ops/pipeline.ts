import type { WmFact } from "../world-model/types.js";
import type { OpportunityScore } from "./types.js";

export function scoreOpportunity(input: {
  title: string;
  summary: string;
  problems: string[];
  facts: WmFact[];
}): OpportunityScore {
  const text = `${input.title} ${input.summary} ${input.problems.join(" ")}`.toLowerCase();
  let fit = 0.4;
  if (/laravel|php|saas|api|react|node/.test(text)) fit += 0.25;
  if (input.facts.some((f) => f.kind === "observation")) fit += 0.1;
  if (input.problems.length >= 2) fit += 0.1;
  fit = Math.min(1, fit);

  let urgency = 0.35;
  if (/urgent|asap|immediately|this week/.test(text)) urgency += 0.3;
  if (input.facts.some((f) => /hiring|looking for|need/.test(f.claim.toLowerCase()))) {
    urgency += 0.15;
  }
  urgency = Math.min(1, urgency);

  let value = 0.4;
  if (/enterprise|retainer|long[- ]term|series/.test(text)) value += 0.25;
  if (/budget|\$|usd|sar/.test(text)) value += 0.15;
  value = Math.min(1, value);

  const overall = Math.round(((fit + urgency + value) / 3) * 100) / 100;
  return {
    fit: Math.round(fit * 100) / 100,
    urgency: Math.round(urgency * 100) / 100,
    value: Math.round(value * 100) / 100,
    overall,
    rationale: `fit=${fit.toFixed(2)} urgency=${urgency.toFixed(2)} value=${value.toFixed(2)} from title/summary/facts`,
  };
}

export function qualifyFromText(input: {
  title: string;
  summary?: string;
  company?: string;
}): { problems: string[]; summary: string } {
  const summary = (input.summary ?? input.title).trim();
  const problems: string[] = [];
  const lower = summary.toLowerCase();
  if (/laravel|php/.test(lower)) problems.push("Likely needs Laravel/PHP delivery capacity");
  if (/saas|subscription/.test(lower)) problems.push("SaaS product or growth workflow gap");
  if (/api|integration/.test(lower)) problems.push("Integration / API work indicated");
  if (/design|ui|ux/.test(lower)) problems.push("UI/UX or frontend polish may be needed");
  if (!problems.length) problems.push("Unclear pain — needs discovery call");
  return { problems, summary: summary.slice(0, 400) };
}

export function draftApproach(input: {
  title: string;
  company?: string;
  channel: import("./types.js").OpportunityChannel;
  problems: string[];
  score?: OpportunityScore;
}): import("./types.js").ApproachDraft {
  const who = input.company ?? "there";
  const problemLine = input.problems[0] ?? "a delivery bottleneck";
  const subject = `Quick idea for ${who}: ${input.title.slice(0, 60)}`;
  const body = [
    `Hi ${who},`,
    "",
    `I noticed a signal around “${input.title}”.`,
    `Hypothesis: ${problemLine}.`,
    input.score
      ? `Internal fit score ${input.score.overall} (SHADOW — not sent).`
      : "Internal scoring pending.",
    "",
    "If useful, I can share a short plan (no commitment).",
    "",
    "— JARVIS draft (not sent)",
  ].join("\n");

  return {
    subject,
    body,
    channel: input.channel,
    simulated: true,
    notice: "SHADOW draft only — no email/DM/bid/publish was performed",
    created_at: new Date().toISOString(),
  };
}
