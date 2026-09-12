import { newId, nowIso } from "../util/ids.js";

export type EscalationStatus = "pending" | "approved" | "rejected" | "expired";

export interface Escalation {
  id: string;
  goal_id: string;
  run_id?: string;
  tool_id: string;
  verdict_id: string;
  verdict_class: "approval_required" | "strong_confirmation" | "reject" | "inform";
  reason: string;
  status: EscalationStatus;
  created_at: string;
  expires_at: string;
  resolved_at?: string;
  title?: string;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000;

/** In-memory confirm/inform queue — Phase B. */
export class EscalationStore {
  private readonly byId = new Map<string, Escalation>();

  create(input: {
    goal_id: string;
    run_id?: string;
    tool_id: string;
    verdict_id: string;
    verdict_class: Escalation["verdict_class"];
    reason: string;
    title?: string;
    ttl_ms?: number;
  }): Escalation {
    const created_at = nowIso();
    const ttl = input.ttl_ms ?? DEFAULT_TTL_MS;
    const row: Escalation = {
      id: newId("esc"),
      goal_id: input.goal_id,
      run_id: input.run_id,
      tool_id: input.tool_id,
      verdict_id: input.verdict_id,
      verdict_class: input.verdict_class,
      reason: input.reason,
      status: "pending",
      created_at,
      expires_at: new Date(Date.now() + ttl).toISOString(),
      title: input.title,
    };
    this.byId.set(row.id, row);
    return row;
  }

  get(id: string): Escalation | undefined {
    this.expireStale();
    return this.byId.get(id);
  }

  list(filter?: { status?: EscalationStatus }): Escalation[] {
    this.expireStale();
    let rows = [...this.byId.values()];
    if (filter?.status) rows = rows.filter((r) => r.status === filter.status);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  resolve(id: string, decision: "approve" | "reject"): Escalation {
    this.expireStale();
    const row = this.byId.get(id);
    if (!row) throw new Error(`Escalation not found: ${id}`);
    if (row.status !== "pending") throw new Error(`Escalation is ${row.status}`);
    row.status = decision === "approve" ? "approved" : "rejected";
    row.resolved_at = nowIso();
    return row;
  }

  expireStale(): void {
    const now = Date.now();
    for (const row of this.byId.values()) {
      if (row.status === "pending" && Date.parse(row.expires_at) <= now) {
        row.status = "expired";
        row.resolved_at = nowIso();
      }
    }
  }

  clear(): void {
    this.byId.clear();
  }
}

let singleton: EscalationStore | null = null;

export function getEscalationStore(): EscalationStore {
  if (!singleton) singleton = new EscalationStore();
  return singleton;
}

export function resetEscalationStore(): void {
  singleton?.clear();
  singleton = null;
}
