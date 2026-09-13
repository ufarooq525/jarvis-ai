import { newId, nowIso } from "../util/ids.js";
import { assertNoSecrets } from "../world-model/secrets.js";
import type { ExtractedSkillDraft } from "./extract.js";
import type { Skill, SkillPracticeResult, SkillStatus, SkillTrust } from "./types.js";
import { SKILL_SIMULATED_NOTICE } from "./types.js";

export interface CreateSkillInput {
  draft: ExtractedSkillDraft;
  source: string;
  source_urls?: string[];
  fact_ids?: string[];
  version?: string;
}

/** In-memory skill library — base for PersistedSkillStore. */
export class SkillStore {
  protected readonly byId = new Map<string, Skill>();

  createCandidate(input: CreateSkillInput): Skill {
    assertNoSecrets(input.draft.name);
    assertNoSecrets(input.draft.summary);
    for (const step of input.draft.procedure) assertNoSecrets(step.instruction);

    const now = nowIso();
    const row: Skill = {
      id: newId("skl"),
      name: input.draft.name,
      version: input.version ?? "0.1.0",
      status: "candidate",
      trust_tier: "SHADOW",
      summary: input.draft.summary,
      concepts: input.draft.concepts,
      procedure: input.draft.procedure,
      constraints: input.draft.constraints,
      examples: input.draft.examples,
      provenance: {
        source: input.source,
        source_urls: input.source_urls ?? [],
        fact_ids: input.fact_ids ?? [],
        ingested_at: now,
      },
      created_at: now,
      updated_at: now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  get(id: string): Skill | undefined {
    return this.byId.get(id);
  }

  list(filter?: { status?: SkillStatus; q?: string }): Skill[] {
    let rows = [...this.byId.values()];
    if (filter?.status) rows = rows.filter((s) => s.status === filter.status);
    if (filter?.q?.trim()) {
      const needle = filter.q.trim().toLowerCase();
      rows = rows.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.summary.toLowerCase().includes(needle) ||
          s.provenance.source.toLowerCase().includes(needle),
      );
    }
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  /** Sandbox practice stub — checklist only, no side effects. */
  practice(id: string): Skill {
    const row = this.require(id);
    if (row.status === "retired") throw new Error("Cannot practice a retired skill");
    if (row.status === "verified") {
      // Allow re-practice without demoting
    } else {
      row.status = "practicing";
    }

    const checklist: SkillPracticeResult["checklist"] = [];
    checklist.push({
      id: "has_name",
      ok: Boolean(row.name.trim()),
      detail: row.name ? "Name present" : "Missing name",
    });
    checklist.push({
      id: "has_procedure",
      ok: row.procedure.length > 0,
      detail: `${row.procedure.length} procedure step(s)`,
    });
    checklist.push({
      id: "has_provenance",
      ok: Boolean(row.provenance.source),
      detail: `Source: ${row.provenance.source}`,
    });
    checklist.push({
      id: "shadow_trust",
      ok: row.trust_tier === "SHADOW",
      detail: "Practice stays SHADOW — no Live execute",
    });
    checklist.push({
      id: "no_side_effects",
      ok: true,
      detail: SKILL_SIMULATED_NOTICE,
    });

    const ok = checklist.every((c) => c.ok);
    row.practice = {
      at: nowIso(),
      ok,
      checklist,
      summary: ok
        ? `Practice passed — ${SKILL_SIMULATED_NOTICE}`
        : `Practice failed: ${checklist
            .filter((c) => !c.ok)
            .map((c) => c.id)
            .join(", ")}`,
      simulated: true,
    };
    row.updated_at = nowIso();
    this.byId.set(row.id, row);
    return row;
  }

  /**
   * Promote to verified library entry only after successful practice.
   * Trust remains SHADOW — never auto-registers Live tools.
   */
  verify(id: string): Skill {
    const row = this.require(id);
    if (row.status === "retired") throw new Error("Cannot verify a retired skill");
    if (!row.practice?.ok) {
      throw new Error("Practice must succeed before verify — call POST …/practice first");
    }
    if (row.procedure.length === 0) {
      throw new Error("Cannot verify skill with empty procedure");
    }
    row.status = "verified";
    row.trust_tier = "SHADOW";
    row.verified_at = nowIso();
    row.updated_at = row.verified_at;
    this.byId.set(row.id, row);
    return row;
  }

  retire(id: string, reason?: string): Skill {
    const row = this.require(id);
    row.status = "retired";
    row.retired_at = nowIso();
    row.updated_at = row.retired_at;
    if (reason) {
      row.summary = `${row.summary} [retired: ${reason.slice(0, 80)}]`;
    }
    this.byId.set(row.id, row);
    return row;
  }

  /** Hard block — skills never raise trust via this store. */
  assertNotExecutable(id: string): void {
    const row = this.require(id);
    if (row.trust_tier !== "SHADOW" || row.status !== "verified") {
      // Even verified stays non-executable in Phase 8
    }
    throw new Error(
      `Skill '${row.name}' is not executable — Phase 8 library is SHADOW-only (status=${row.status})`,
    );
  }

  bumpTrustBlocked(_id: string, _tier: SkillTrust): never {
    throw new Error("Skill trust elevation blocked — requires human + harness (not Phase 8)");
  }

  clear(): void {
    this.byId.clear();
  }

  protected require(id: string): Skill {
    const row = this.byId.get(id);
    if (!row) throw new Error(`Skill not found: ${id}`);
    return row;
  }

  protected loadOne(row: Skill): void {
    this.byId.set(row.id, row);
  }

  protected allRows(): Skill[] {
    return [...this.byId.values()];
  }
}

let singleton: SkillStore | null = null;

export function getSkillStore(): SkillStore {
  if (!singleton) singleton = new SkillStore();
  return singleton;
}

export function bindSkillStore(store: SkillStore): void {
  singleton = store;
}

export function resetSkillStore(): void {
  singleton?.clear();
  singleton = null;
}
