import type { JarvisDb } from "../db/client.js";
import { OpportunityStore, type CreateOpportunityInput } from "./opportunity-store.js";
import type { Opportunity } from "./types.js";
import type { WmFact } from "../world-model/types.js";

export class PersistedOpportunityStore extends OpportunityStore {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    const rows = this.db.prepare("SELECT json FROM opportunities").all() as { json: string }[];
    for (const row of rows) {
      this.loadOne(JSON.parse(row.json) as Opportunity);
    }
  }

  private persist(row: Opportunity): void {
    this.db
      .prepare(
        `INSERT INTO opportunities (id, title, status, channel, json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           status = excluded.status,
           channel = excluded.channel,
           json = excluded.json`,
      )
      .run(row.id, row.title, row.status, row.channel, JSON.stringify(row));
  }

  override create(input: CreateOpportunityInput): Opportunity {
    const row = super.create(input);
    this.persist(row);
    return row;
  }

  override qualify(id: string, facts?: WmFact[]): Opportunity {
    const row = super.qualify(id, facts);
    this.persist(row);
    return row;
  }

  override draft(id: string): Opportunity {
    const row = super.draft(id);
    this.persist(row);
    return row;
  }

  override requestApproval(id: string): Opportunity {
    const row = super.requestApproval(id);
    this.persist(row);
    return row;
  }

  override retire(id: string, reason?: string): Opportunity {
    const row = super.retire(id, reason);
    this.persist(row);
    return row;
  }

  override clear(): void {
    super.clear();
    try {
      this.db.exec("DELETE FROM opportunities");
    } catch {
      /* closed */
    }
  }
}
