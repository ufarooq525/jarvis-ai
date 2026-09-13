import type { GoalEngine } from "../goal-engine/engine.js";
import type { OsRuntimeAdapter } from "../contracts/os-runtime-adapter.js";
import { getEscalationStore } from "../escalation/store.js";
import { nowIso } from "../util/ids.js";
import { getFactStore } from "./fact-store.js";
import { quarantineAdapterText } from "./quarantine.js";
import type { WmEntity, WmNow } from "./types.js";

function journalConfidence(engine: GoalEngine, goalId: string): number {
  const rows = engine.journal.byGoal(goalId);
  if (!rows.length) return 0.5;
  return rows[rows.length - 1]!.confidence;
}

export function projectGoalEntity(engine: GoalEngine, goalId: string): WmEntity | null {
  const g = engine.store.goals.get(goalId);
  if (!g) return null;
  return {
    entity_id: g.id,
    type: "goal",
    version: 1,
    title: g.title,
    summary: g.outcome,
    confidence: journalConfidence(engine, g.id),
    provenance: `jarvis.goal:${g.mode}/${g.trust_tier}`,
    trust: "trusted",
    last_verified_at: g.updated_at,
    refs: { status: g.status, mode: g.mode, domain: g.domain },
  };
}

export function buildWmNow(input: {
  engine: GoalEngine;
  adapter: OsRuntimeAdapter;
  adapterName: string;
  os_run_count: number;
  pending_gates: number;
}): WmNow {
  const goals = input.engine.store.listGoals();
  const active =
    [...goals]
      .filter((g) => g.status === "active" || g.mode === "live")
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ??
    [...goals].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ??
    null;

  const open = getEscalationStore()
    .list({ status: "pending" })
    .map(
      (e): WmEntity => ({
        entity_id: e.id,
        type: "approval",
        version: 1,
        title: e.title || e.tool_id,
        summary: quarantineAdapterText({
          source: "adapter.escalation",
          text: e.reason,
          goal_id: e.goal_id,
        }).safe_summary,
        confidence: 0.7,
        provenance: `escalation:${e.verdict_class}`,
        trust: "untrusted",
        last_verified_at: e.created_at,
        refs: { goal_id: e.goal_id, status: e.status },
      }),
    );

  return {
    at: nowIso(),
    active_goal: active ? projectGoalEntity(input.engine, active.id) : null,
    open_approvals: open,
    os_run_count: input.os_run_count,
    pending_gates: input.pending_gates,
    adapter: input.adapterName,
    stm: {
      active_goal_id: active?.id ?? null,
      open_approval_ids: open.map((o) => o.entity_id),
      os_run_count: input.os_run_count,
    },
    memory: {
      active_facts: getFactStore().counts().active,
      stale_facts: getFactStore().counts().stale,
    },
  };
}

export function listWmEntities(input: {
  engine: GoalEngine;
  adapter: OsRuntimeAdapter;
  q?: string;
  types?: string[];
}): WmEntity[] {
  const want = new Set(
    (input.types?.length ? input.types : ["goal", "os_run", "approval", "specialist"]).map((t) =>
      t.toLowerCase(),
    ),
  );
  const needle = (input.q ?? "").trim().toLowerCase();
  const out: WmEntity[] = [];

  if (want.has("goal")) {
    for (const g of input.engine.store.listGoals()) {
      const e = projectGoalEntity(input.engine, g.id);
      if (e) out.push(e);
    }
  }

  if (want.has("os_run")) {
    for (const r of input.engine.store.runs.values()) {
      if (!r.os_run_id) continue;
      const safe = quarantineAdapterText({
        source: "adapter.run",
        text: `${r.status} ${r.tool_invocations.join(",")}`,
        goal_id: r.goal_id,
      });
      out.push({
        entity_id: r.os_run_id,
        type: "os_run",
        version: 1,
        title: r.os_run_id,
        summary: safe.safe_summary,
        confidence: r.mode === "live" ? 0.75 : 0.55,
        provenance: `jarvis.run:${r.mode}/${r.status}`,
        trust: safe.quarantined ? "quarantined" : "untrusted",
        last_verified_at: nowIso(),
        refs: { goal_id: r.goal_id, run_id: r.id, mode: r.mode },
      });
    }
  }

  if (want.has("approval")) {
    for (const e of getEscalationStore().list()) {
      const safe = quarantineAdapterText({
        source: "adapter.escalation",
        text: e.reason,
        goal_id: e.goal_id,
      });
      out.push({
        entity_id: e.id,
        type: "approval",
        version: 1,
        title: e.title || e.tool_id,
        summary: safe.safe_summary,
        confidence: 0.65,
        provenance: `escalation:${e.status}`,
        trust: safe.quarantined ? "quarantined" : "untrusted",
        last_verified_at: e.created_at,
        refs: { goal_id: e.goal_id, status: e.status },
      });
    }
  }

  // Specialists are stubs from adapter capabilities — never LTM facts.
  if (want.has("specialist")) {
    // sync projection only if already cached would be ideal; caller may pass prefetched
  }

  return out.filter((e) => {
    if (!needle) return true;
    return (
      e.title.toLowerCase().includes(needle) ||
      e.summary.toLowerCase().includes(needle) ||
      e.entity_id.toLowerCase().includes(needle)
    );
  });
}

export async function listSpecialistStubs(adapter: OsRuntimeAdapter): Promise<WmEntity[]> {
  try {
    const caps = await adapter.listCapabilities();
    return caps.slice(0, 40).map((c) => {
      const raw = c.summary ?? c.display_name;
      const safe = quarantineAdapterText({
        source: "adapter.capability",
        text: raw,
      });
      return {
        entity_id: c.specialist_id ?? c.tool_id,
        type: "specialist" as const,
        version: 1,
        title: c.display_name,
        summary: safe.safe_summary,
        confidence: 0.4,
        provenance: "adapter.listCapabilities",
        trust: safe.quarantined ? ("quarantined" as const) : ("untrusted" as const),
        last_verified_at: nowIso(),
        refs: { tool_id: c.tool_id },
      };
    });
  } catch {
    return [];
  }
}
