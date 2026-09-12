import type { AgentRun, Goal, Objective, Task } from "../types/model.js";
import type { JarvisDb } from "../db/client.js";
import { MemoryStore } from "./memory-store.js";

/** Write-through SQLite store — same API as MemoryStore. */
export class PersistedStore extends MemoryStore {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    for (const row of this.db.prepare("SELECT json FROM goals").all() as { json: string }[]) {
      const g = JSON.parse(row.json) as Goal;
      this.goals.set(g.id, g);
    }
    for (const row of this.db.prepare("SELECT json FROM objectives").all() as { json: string }[]) {
      const o = JSON.parse(row.json) as Objective;
      this.objectives.set(o.id, o);
    }
    for (const row of this.db.prepare("SELECT json FROM tasks").all() as { json: string }[]) {
      const t = JSON.parse(row.json) as Task;
      this.tasks.set(t.id, t);
    }
    for (const row of this.db.prepare("SELECT json FROM runs").all() as { json: string }[]) {
      const r = JSON.parse(row.json) as AgentRun;
      this.runs.set(r.id, r);
      if (r.os_run_id) this.osRunMap.set(r.os_run_id, r.id);
    }
    for (const row of this.db.prepare("SELECT key, run_id FROM idempotency").all() as {
      key: string;
      run_id: string;
    }[]) {
      this.idempotency.set(row.key, row.run_id);
    }
    for (const row of this.db.prepare("SELECT os_run_id, jarvis_run_id FROM os_run_map").all() as {
      os_run_id: string;
      jarvis_run_id: string;
    }[]) {
      this.osRunMap.set(row.os_run_id, row.jarvis_run_id);
    }
  }

  override saveGoal(g: Goal): void {
    super.saveGoal(g);
    this.db
      .prepare(
        `INSERT INTO goals (id, json) VALUES (?, ?)
         ON CONFLICT(id) DO UPDATE SET json = excluded.json`,
      )
      .run(g.id, JSON.stringify(g));
  }

  override saveObjective(o: Objective): void {
    super.saveObjective(o);
    this.db
      .prepare(
        `INSERT INTO objectives (id, goal_id, json) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET goal_id = excluded.goal_id, json = excluded.json`,
      )
      .run(o.id, o.goal_id, JSON.stringify(o));
  }

  override saveTask(t: Task): void {
    super.saveTask(t);
    this.db
      .prepare(
        `INSERT INTO tasks (id, goal_id, json) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET goal_id = excluded.goal_id, json = excluded.json`,
      )
      .run(t.id, t.goal_id, JSON.stringify(t));
  }

  override saveRun(r: AgentRun): void {
    super.saveRun(r);
    this.db
      .prepare(
        `INSERT INTO runs (id, goal_id, json) VALUES (?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET goal_id = excluded.goal_id, json = excluded.json`,
      )
      .run(r.id, r.goal_id, JSON.stringify(r));
    if (r.os_run_id) {
      this.db
        .prepare(
          `INSERT INTO os_run_map (os_run_id, jarvis_run_id) VALUES (?, ?)
           ON CONFLICT(os_run_id) DO UPDATE SET jarvis_run_id = excluded.jarvis_run_id`,
        )
        .run(r.os_run_id, r.id);
    }
  }

  override rememberIdempotency(key: string, run_id: string): void {
    super.rememberIdempotency(key, run_id);
    this.db
      .prepare(
        `INSERT INTO idempotency (key, run_id) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET run_id = excluded.run_id`,
      )
      .run(key, run_id);
  }
}
