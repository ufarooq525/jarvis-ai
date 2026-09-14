import type { ToolManifest } from "../types/model.js";
import type { Capability } from "../capabilities/types.js";

/** Capabilities the Orchestrator can actually execute. */
export const ROUTABLE_CAPABILITIES = new Set([
  "os.runtime.get_state",
  "os.runtime.start_run",
  "os.runtime.get_run",
  "computer.observe.snapshot",
  "computer.locate",
  "computer.open_app",
  "computer.type_text",
  "browser.research",
  "wm.facts.upsert",
  "ops.opportunity.create",
  "knowledge.pdf.read",
]);

/** Never selectable by the planner — still blocked acts. */
export const BLOCKED_CAPABILITIES = new Set([
  "computer.act.click",
  "computer.act.type",
  "computer.act.scroll",
  "computer.act.focus_window",
  "browser.act.click",
  "browser.act.publish",
  "ops.opportunity.send",
]);

export const PLANNER_SYSTEM = `You are JARVIS's planner. Output ONLY JSON matching:
{"steps":[{"capability_id":"string","inputs":{},"reason":"string","expected_result":"string","verification":"string"}]}
Rules:
- Choose an ordered list of capabilities from the catalog to accomplish the user's goal.
- Use only listed capability_id values. Do not invent ids.
- inputs keys must match the capability's input names (omit trailing ? optionals if unknown).
- Do not select click, coordinate, publish, or send capabilities.
- Prefer computer.* for opening/using local apps, knowledge.pdf.read for PDFs, browser.research for web reading, os.runtime.* only for workforce/OS runs.
- 1–8 steps. No markdown, no prose outside JSON.`;

export interface OperatorPlanStep {
  capability_id: string;
  inputs: Record<string, unknown>;
  reason: string;
  expected_result: string;
  verification: string;
}

export interface OperatorPlan {
  steps: OperatorPlanStep[];
}

export type PlanParseResult =
  | { ok: true; plan: OperatorPlan }
  | { ok: false; reason: string };

function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced?.[1]?.trim() ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("No JSON object in model output");
  }
  return JSON.parse(raw.slice(start, end + 1)) as unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function requiredInputs(manifest: ToolManifest): string[] {
  return manifest.inputs.filter((i) => !i.endsWith("?")).map((i) => i.replace(/\?$/, ""));
}

export function parseAndValidatePlan(
  text: string,
  capabilities: Capability[],
  manifestsById: Map<string, ToolManifest>,
): PlanParseResult {
  let parsed: unknown;
  try {
    parsed = extractJsonObject(text);
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "invalid JSON" };
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.steps)) {
    return { ok: false, reason: "Plan must be { steps: [...] }" };
  }
  if (parsed.steps.length === 0) {
    return { ok: false, reason: "Plan has no steps" };
  }
  if (parsed.steps.length > 10) {
    return { ok: false, reason: "Plan exceeds 10 steps" };
  }

  const allowed = new Set(capabilities.map((c) => c.id));
  const steps: OperatorPlanStep[] = [];

  for (const [i, raw] of parsed.steps.entries()) {
    if (!isRecord(raw) || typeof raw.capability_id !== "string") {
      return { ok: false, reason: `Step ${i} missing capability_id` };
    }
    const capability_id = raw.capability_id.trim();
    if (BLOCKED_CAPABILITIES.has(capability_id)) {
      return { ok: false, reason: `Step ${i} selects blocked capability ${capability_id}` };
    }
    if (!ROUTABLE_CAPABILITIES.has(capability_id) || !allowed.has(capability_id)) {
      return { ok: false, reason: `Step ${i} unknown or non-routable capability ${capability_id}` };
    }
    const manifest = manifestsById.get(capability_id);
    if (!manifest) {
      return { ok: false, reason: `Step ${i} has no manifest for ${capability_id}` };
    }
    const inputs = isRecord(raw.inputs) ? { ...raw.inputs } : {};
    for (const req of requiredInputs(manifest)) {
      if (inputs[req] == null || inputs[req] === "") {
        return { ok: false, reason: `Step ${i} missing required input '${req}'` };
      }
    }
    const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim() : "";
    if (!reason) {
      return { ok: false, reason: `Step ${i} missing reason` };
    }
    steps.push({
      capability_id,
      inputs,
      reason,
      expected_result:
        typeof raw.expected_result === "string" ? raw.expected_result : "",
      verification: typeof raw.verification === "string" ? raw.verification : "",
    });
  }

  return { ok: true, plan: { steps } };
}

export function catalogPromptLines(capabilities: Capability[]): string {
  return capabilities
    .filter((c) => ROUTABLE_CAPABILITIES.has(c.id) && !BLOCKED_CAPABILITIES.has(c.id))
    .map((c) => `- ${c.id} inputs=[${c.inputs.join(", ")}] risk=${c.risk}`)
    .join("\n");
}
