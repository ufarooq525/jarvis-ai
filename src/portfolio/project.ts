import type { GoalEngine } from "../goal-engine/engine.js";
import { getEscalationStore } from "../escalation/store.js";
import { defaultDomainTrustTier } from "../trust/principals.js";
import { nowIso } from "../util/ids.js";

export interface PortfolioDomainRow {
  domain: string;
  trust_tier: string;
  goal_count: number;
  active: number;
  shadow: number;
  live: number;
  kr: { total: number; met: number; miss: number };
  promotion_candidate: boolean;
}

export interface PortfolioDto {
  at: string;
  domains: PortfolioDomainRow[];
  escalations: {
    pending: number;
    breached: number;
    avg_age_ms: number | null;
    soonest_expires_at: string | null;
  };
  journal: {
    decisions: number;
    by_outcome: Record<string, number>;
    avg_confidence: number | null;
  };
  evidence: { goals_with_chain: number; nodes: number };
  os: { reachable: boolean; run_count: number; pending_gates: number };
  links: {
    goals: string;
    approvals: string;
    journal: string;
    os: string;
  };
}

export function buildPortfolio(input: {
  engine: GoalEngine;
  os: { reachable: boolean; run_count: number; pending_gates: number };
  domainFilter?: string;
}): PortfolioDto {
  const goals = input.engine.store.listGoals();
  const domainsMap = new Map<string, PortfolioDomainRow>();

  const ensure = (domain: string): PortfolioDomainRow => {
    let row = domainsMap.get(domain);
    if (!row) {
      row = {
        domain,
        trust_tier: defaultDomainTrustTier(),
        goal_count: 0,
        active: 0,
        shadow: 0,
        live: 0,
        kr: { total: 0, met: 0, miss: 0 },
        promotion_candidate: false,
      };
      domainsMap.set(domain, row);
    }
    return row;
  };

  // Seed known domains so trust board is never empty
  for (const d of ["general", "ops", "comms", "finance", "data", "engineering", "growth"]) {
    ensure(d);
  }

  for (const g of goals) {
    const row = ensure(g.domain);
    row.goal_count += 1;
    if (g.status === "active") row.active += 1;
    if (g.mode === "shadow") row.shadow += 1;
    if (g.mode === "live") row.live += 1;
    for (const kr of g.key_results) {
      row.kr.total += 1;
      const cur = Number(kr.current ?? 0);
      const tgt = Number(kr.target ?? 0);
      if (tgt > 0 && cur >= tgt) row.kr.met += 1;
      else row.kr.miss += 1;
    }
  }

  const pendingEsc = getEscalationStore().list({ status: "pending" });
  const now = Date.now();
  let ageSum = 0;
  let breached = 0;
  let soonest: string | null = null;
  for (const e of pendingEsc) {
    const created = Date.parse(e.created_at);
    if (!Number.isNaN(created)) ageSum += now - created;
    const exp = Date.parse(e.expires_at);
    if (!Number.isNaN(exp) && exp < now) breached += 1;
    if (!soonest || e.expires_at < soonest) soonest = e.expires_at;
  }

  for (const row of domainsMap.values()) {
    row.promotion_candidate =
      row.shadow > 0 &&
      row.kr.met > 0 &&
      row.trust_tier === "SHADOW" &&
      pendingEsc.filter((e) => {
        const g = input.engine.store.goals.get(e.goal_id);
        return g?.domain === row.domain;
      }).length === 0;
  }

  let domains = [...domainsMap.values()].sort((a, b) => a.domain.localeCompare(b.domain));
  if (input.domainFilter) {
    domains = domains.filter((d) => d.domain === input.domainFilter);
  }

  const journalRows = input.engine.journal.all();
  const by_outcome: Record<string, number> = {};
  let confSum = 0;
  for (const j of journalRows) {
    by_outcome[j.outcome] = (by_outcome[j.outcome] ?? 0) + 1;
    confSum += j.confidence;
  }

  let goals_with_chain = 0;
  let nodes = 0;
  for (const g of goals) {
    const chain = input.engine.evidence.chainForGoal(g.id);
    if (chain.length) {
      goals_with_chain += 1;
      nodes += chain.length;
    }
  }

  return {
    at: nowIso(),
    domains,
    escalations: {
      pending: pendingEsc.length,
      breached,
      avg_age_ms: pendingEsc.length ? Math.round(ageSum / pendingEsc.length) : null,
      soonest_expires_at: soonest,
    },
    journal: {
      decisions: journalRows.length,
      by_outcome,
      avg_confidence: journalRows.length ? confSum / journalRows.length : null,
    },
    evidence: { goals_with_chain, nodes },
    os: input.os,
    links: {
      goals: "/v1/goals",
      approvals: "/v1/escalations?status=pending",
      journal: "/v1/journal",
      os: "/v1/os/snapshot",
    },
  };
}
