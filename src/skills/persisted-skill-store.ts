import type { JarvisDb } from "../db/client.js";
import { SkillStore, type CreateSkillInput } from "./skill-store.js";
import type { Skill } from "./types.js";

export class PersistedSkillStore extends SkillStore {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    const rows = this.db.prepare("SELECT json FROM skills").all() as { json: string }[];
    for (const row of rows) {
      this.loadOne(JSON.parse(row.json) as Skill);
    }
  }

  private persist(row: Skill): void {
    this.db
      .prepare(
        `INSERT INTO skills (id, name, status, version, json) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           status = excluded.status,
           version = excluded.version,
           json = excluded.json`,
      )
      .run(row.id, row.name, row.status, row.version, JSON.stringify(row));
  }

  override createCandidate(input: CreateSkillInput): Skill {
    const row = super.createCandidate(input);
    this.persist(row);
    return row;
  }

  override practice(id: string): Skill {
    const row = super.practice(id);
    this.persist(row);
    return row;
  }

  override verify(id: string): Skill {
    const row = super.verify(id);
    this.persist(row);
    return row;
  }

  override retire(id: string, reason?: string): Skill {
    const row = super.retire(id, reason);
    this.persist(row);
    return row;
  }

  override clear(): void {
    super.clear();
    try {
      this.db.exec("DELETE FROM skills");
    } catch {
      /* closed */
    }
  }
}
