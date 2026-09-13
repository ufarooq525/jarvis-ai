import { newId } from "../util/ids.js";
import { assertNoSecrets } from "../world-model/secrets.js";
import type { SkillConcept, SkillProcedureStep } from "./types.js";

export interface ExtractedSkillDraft {
  name: string;
  summary: string;
  concepts: SkillConcept[];
  procedure: SkillProcedureStep[];
  constraints: string[];
  examples: string[];
}

/**
 * Heuristic extract from permitted plain text / tutorial notes.
 * Not an LLM — structured enough for candidate skills in SHADOW.
 */
export function extractSkillDraft(text: string, titleHint?: string): ExtractedSkillDraft {
  assertNoSecrets(text);
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  if (!cleaned) throw new Error("Empty text — nothing to learn");

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const name =
    titleHint?.trim() ||
    lines[0]!.replace(/^#+\s*/, "").slice(0, 80) ||
    "Untitled skill";

  const procedure: SkillProcedureStep[] = [];
  const constraints: string[] = [];
  const examples: string[] = [];
  const conceptLabels = new Set<string>();

  for (const line of lines) {
    const step = line.match(/^(?:step\s*)?(\d+)[.)]\s+(.+)$/i) || line.match(/^[-*]\s+(.+)$/);
    if (step) {
      const instruction = (step[2] ?? step[1]!).trim();
      assertNoSecrets(instruction);
      procedure.push({ order: procedure.length + 1, instruction: instruction.slice(0, 240) });
      continue;
    }
    if (/^(must|never|do not|don't|always|constraint)\b/i.test(line)) {
      assertNoSecrets(line);
      constraints.push(line.slice(0, 200));
      continue;
    }
    if (/^example\b/i.test(line) || /^e\.g\./i.test(line)) {
      assertNoSecrets(line);
      examples.push(line.slice(0, 200));
      continue;
    }
    // Noun-ish phrases as soft concepts
    const words = line.split(/\s+/).filter((w) => w.length > 4);
    for (const w of words.slice(0, 3)) {
      conceptLabels.add(w.replace(/[^a-zA-Z0-9_-]/g, "").toLowerCase());
    }
  }

  if (procedure.length === 0) {
    // Fallback: treat paragraphs as ordered soft steps
    for (const line of lines.slice(0, 5)) {
      procedure.push({
        order: procedure.length + 1,
        instruction: line.slice(0, 240),
      });
    }
  }

  const concepts: SkillConcept[] = [...conceptLabels]
    .filter(Boolean)
    .slice(0, 8)
    .map((label) => ({ id: newId("sc"), label }));

  return {
    name: name.slice(0, 80),
    summary: lines.slice(0, 2).join(" ").slice(0, 280),
    concepts,
    procedure,
    constraints: constraints.slice(0, 8),
    examples: examples.slice(0, 5),
  };
}
