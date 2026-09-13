import { newId, nowIso } from "../util/ids.js";
import { assertNoSecrets } from "../world-model/secrets.js";
import { draftApproach, qualifyFromText, scoreOpportunity } from "./pipeline.js";
import type {
  Opportunity,
  OpportunityChannel,
  OpportunityStatus,
} from "./types.js";
import { OPS_DRAFT_NOTICE } from "./types.js";
import type { WmFact } from "../world-model/types.js";

export interface CreateOpportunityInput {
  title: string;
  company?: string;
  channel?: OpportunityChannel;
  summary?: string;
  fact_ids?: string[];
  skill_ids?: string[];
  source?: string;
}

export class OpportunityStore {
  protected readonly byId = new Map<string, Opportunity>();

  create(input: CreateOpportunityInput): Opportunity {
    const title = input.title.trim();
    if (!title) throw new Error("title is required");
    assertNoSecrets(title);
    if (input.summary) assertNoSecrets(input.summary);
    const now = nowIso();
    const q = qualifyFromText({ title, summary: input.summary, company: input.company });
    const row: Opportunity = {
      id: newId("opp"),
      title,
      company: input.company?.trim(),
      channel: input.channel ?? "other",
      status: "researching",
      summary: q.summary,
      problems: q.problems,
      provenance: {
        source: input.source ?? "ops.manual",
        fact_ids: input.fact_ids ?? [],
        skill_ids: input.skill_ids ?? [],
        created_at: now,
      },
      created_at: now,
      updated_at: now,
    };
    this.byId.set(row.id, row);
    return row;
  }

  get(id: string): Opportunity | undefined {
    return this.byId.get(id);
  }

  list(filter?: { status?: OpportunityStatus; q?: string }): Opportunity[] {
    let rows = [...this.byId.values()];
    if (filter?.status) rows = rows.filter((o) => o.status === filter.status);
    if (filter?.q?.trim()) {
      const needle = filter.q.trim().toLowerCase();
      rows = rows.filter(
        (o) =>
          o.title.toLowerCase().includes(needle) ||
          (o.company ?? "").toLowerCase().includes(needle) ||
          o.summary.toLowerCase().includes(needle),
      );
    }
    return rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  }

  qualify(id: string, facts: WmFact[] = []): Opportunity {
    const row = this.require(id);
    if (row.status === "retired") throw new Error("Cannot qualify a retired opportunity");
    const q = qualifyFromText({
      title: row.title,
      summary: row.summary,
      company: row.company,
    });
    row.problems = q.problems;
    row.summary = q.summary;
    row.score = scoreOpportunity({
      title: row.title,
      summary: row.summary,
      problems: row.problems,
      facts,
    });
    row.status = "qualified";
    row.updated_at = nowIso();
    this.byId.set(row.id, row);
    return row;
  }

  draft(id: string): Opportunity {
    const row = this.require(id);
    if (row.status === "retired") throw new Error("Cannot draft a retired opportunity");
    if (row.status === "researching") {
      // Auto-qualify lightly if user jumps to draft
      row.score =
        row.score ??
        scoreOpportunity({
          title: row.title,
          summary: row.summary,
          problems: row.problems,
          facts: [],
        });
    }
    row.draft = draftApproach({
      title: row.title,
      company: row.company,
      channel: row.channel,
      problems: row.problems,
      score: row.score,
    });
    row.status = "drafted";
    row.updated_at = nowIso();
    this.byId.set(row.id, row);
    return row;
  }

  requestApproval(id: string): Opportunity {
    const row = this.require(id);
    if (!row.draft) throw new Error("Draft approach first");
    row.status = "awaiting_approval";
    row.updated_at = nowIso();
    this.byId.set(row.id, row);
    return row;
  }

  retire(id: string, reason?: string): Opportunity {
    const row = this.require(id);
    row.status = "retired";
    row.updated_at = nowIso();
    if (reason) row.summary = `${row.summary} [retired: ${reason.slice(0, 80)}]`;
    this.byId.set(row.id, row);
    return row;
  }

  /** Hard-block outbound actions. */
  assertSendBlocked(id: string): never {
    const row = this.require(id);
    throw new Error(
      `Opportunity '${row.title}' send/publish/bid blocked — ${OPS_DRAFT_NOTICE}`,
    );
  }

  clear(): void {
    this.byId.clear();
  }

  protected require(id: string): Opportunity {
    const row = this.byId.get(id);
    if (!row) throw new Error(`Opportunity not found: ${id}`);
    return row;
  }

  protected loadOne(row: Opportunity): void {
    this.byId.set(row.id, row);
  }

  protected allRows(): Opportunity[] {
    return [...this.byId.values()];
  }
}

let singleton: OpportunityStore | null = null;

export function getOpportunityStore(): OpportunityStore {
  if (!singleton) singleton = new OpportunityStore();
  return singleton;
}

export function bindOpportunityStore(store: OpportunityStore): void {
  singleton = store;
}

export function resetOpportunityStore(): void {
  singleton?.clear();
  singleton = null;
}
