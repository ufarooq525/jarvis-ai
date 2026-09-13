import type { JarvisDb } from "../db/client.js";
import { EscalationStore, type Escalation } from "./store.js";

/** Write-through SQLite escalation store — same API as EscalationStore. */
export class PersistedEscalationStore extends EscalationStore {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    const rows = this.db.prepare("SELECT json FROM escalations").all() as { json: string }[];
    for (const row of rows) {
      const esc = JSON.parse(row.json) as Escalation;
      this.loadOne(esc);
    }
  }

  private persist(row: Escalation): void {
    this.db
      .prepare(
        `INSERT INTO escalations (id, goal_id, status, json) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET goal_id = excluded.goal_id, status = excluded.status, json = excluded.json`,
      )
      .run(row.id, row.goal_id, row.status, JSON.stringify(row));
  }

  override create(input: {
    goal_id: string;
    run_id?: string;
    tool_id: string;
    verdict_id: string;
    verdict_class: Escalation["verdict_class"];
    reason: string;
    title?: string;
    ttl_ms?: number;
  }): Escalation {
    const row = super.create(input);
    this.persist(row);
    return row;
  }

  override resolve(id: string, decision: "approve" | "reject"): Escalation {
    const row = super.resolve(id, decision);
    this.persist(row);
    return row;
  }

  override expireStale(): void {
    super.expireStale();
    for (const row of this.allRows()) {
      this.persist(row);
    }
  }

  override clear(): void {
    super.clear();
    try {
      this.db.exec("DELETE FROM escalations");
    } catch {
      /* DB may already be closed during runtime reset */
    }
  }
}
