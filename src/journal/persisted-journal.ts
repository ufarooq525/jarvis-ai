import type { DecisionRecord } from "../types/model.js";
import type { JarvisDb } from "../db/client.js";
import { DecisionJournal } from "./decision-journal.js";

/** Write-through decision journal backed by SQLite. */
export class PersistedDecisionJournal extends DecisionJournal {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    const rows = this.db
      .prepare("SELECT json FROM decision_records ORDER BY seq ASC")
      .all() as { json: string }[];
    this.loadSnapshot(rows.map((row) => JSON.parse(row.json) as DecisionRecord));
  }

  override append(record: DecisionRecord): DecisionRecord {
    super.append(record);
    this.db
      .prepare("INSERT INTO decision_records (id, goal_id, json) VALUES (?, ?, ?)")
      .run(record.id, record.goal_id ?? null, JSON.stringify(record));
    return record;
  }
}
