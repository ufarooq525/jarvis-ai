import type { AgentRun, Goal, Objective, Task } from "../types/model.js";

/** In-memory JARVIS sidecar store (not OS MySQL). */
export class MemoryStore {
  goals = new Map<string, Goal>();
  objectives = new Map<string, Objective>();
  tasks = new Map<string, Task>();
  runs = new Map<string, AgentRun>();
  /** idempotency_key → jarvis_run_id */
  idempotency = new Map<string, string>();
  /** os_run_id → jarvis_run_id */
  osRunMap = new Map<string, string>();

  saveGoal(g: Goal): void {
    this.goals.set(g.id, g);
  }

  listGoals(): Goal[] {
    return [...this.goals.values()].filter((g) => g.status !== "cancelled");
  }

  findOverlappingGoals(outcome: string, domain: string): Goal[] {
    const needle = outcome.toLowerCase().trim();
    return this.listGoals().filter((g) => {
      if (g.domain !== domain) return false;
      // Only in-flight plans are duplicates. Blocked/done/cancelled must not
      // swallow a new Shadow plan (e.g. retry after a failed Live type).
      if (g.status !== "active" && g.status !== "draft") return false;
      const hay = `${g.title} ${g.outcome}`.toLowerCase();
      return hay.includes(needle) || needle.includes(hay) || tokenizeOverlap(needle, hay);
    });
  }

  saveObjective(o: Objective): void {
    this.objectives.set(o.id, o);
  }

  saveTask(t: Task): void {
    this.tasks.set(t.id, t);
  }

  saveRun(r: AgentRun): void {
    this.runs.set(r.id, r);
    if (r.os_run_id) this.osRunMap.set(r.os_run_id, r.id);
  }

  getRunByIdempotency(key: string): AgentRun | undefined {
    const id = this.idempotency.get(key);
    return id ? this.runs.get(id) : undefined;
  }

  rememberIdempotency(key: string, run_id: string): void {
    this.idempotency.set(key, run_id);
  }

  clearIdempotency(key: string): void {
    this.idempotency.delete(key);
  }
}

function tokenizeOverlap(a: string, b: string): boolean {
  const stop = new Set(["a", "an", "the", "to", "for", "and", "or", "of", "in", "on"]);
  const ta = new Set(a.split(/\W+/).filter((t) => t.length > 2 && !stop.has(t)));
  const tb = b.split(/\W+/).filter((t) => t.length > 2 && !stop.has(t));
  let hits = 0;
  for (const t of tb) if (ta.has(t)) hits++;
  return hits >= 2;
}
