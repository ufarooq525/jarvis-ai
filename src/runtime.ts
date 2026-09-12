import type { GoalEngine } from "./goal-engine/engine.js";
import type { AgentRun, DecisionRecord, EvidenceNode, Goal, Objective, Task } from "./types/model.js";
import type { OsRuntimeAdapter } from "./contracts/os-runtime-adapter.js";
import { GoalEngine as GoalEngineCtor } from "./goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "./adapters/mock/mock-os-runtime-adapter.js";
import { UmerOsRuntimeAdapter } from "./adapters/umer-os/umer-os-runtime-adapter.js";
import { resetEscalationStore } from "./escalation/store.js";
import { resetKillSwitchState } from "./trust/kill-switch-control.js";
import { resetQuarantine } from "./world-model/quarantine.js";
import { openJarvisDb, type JarvisDb, resolveJarvisDbPath } from "./db/client.js";
import { PersistedStore } from "./store/persisted-store.js";
import { PersistedEvidenceChain } from "./evidence/persisted-chain.js";
import { PersistedDecisionJournal } from "./journal/persisted-journal.js";
import {
  type AdapterKind,
} from "./config.js";
import {
  getActiveAdapterKind,
  getConnectionConfig,
  getControlApiBase,
  getOsProjectId,
  resetConnectionOverrides,
  setConnectionOverrides,
  bindConnectionDb,
} from "./connection.js";

export type { AdapterKind };

/** Process-wide runtime — mock or umer-read; SQLite sidecar. */
export interface JarvisRuntime {
  engine: GoalEngine;
  adapter: OsRuntimeAdapter;
  adapterName: AdapterKind;
  controlApiBase: string | null;
  projectId: string | null;
  db: JarvisDb;
  dbPath: string;
}

let singleton: JarvisRuntime | null = null;

function createAdapter(kind: AdapterKind): OsRuntimeAdapter {
  if (kind === "umer-read") {
    return new UmerOsRuntimeAdapter({ baseUrl: getControlApiBase() });
  }
  return new MockOsRuntimeAdapter();
}

function buildRuntime(
  dbPath = resolveJarvisDbPath(),
  kind?: AdapterKind,
): JarvisRuntime {
  const db = openJarvisDb(dbPath);
  bindConnectionDb(db, dbPath);
  const resolved = kind ?? getActiveAdapterKind();
  const adapter = createAdapter(resolved);
  const conn = getConnectionConfig();
  return {
    engine: new GoalEngineCtor(adapter, {
      store: new PersistedStore(db),
      evidence: new PersistedEvidenceChain(db),
      journal: new PersistedDecisionJournal(db),
    }),
    adapter,
    adapterName: resolved,
    controlApiBase: resolved === "umer-read" ? conn.control_api_base : null,
    projectId: conn.project_id,
    db,
    dbPath,
  };
}

export function getJarvisRuntime(): JarvisRuntime {
  if (!singleton) singleton = buildRuntime();
  return singleton;
}

/**
 * Swap adapter / Control API / project while keeping the same SQLite file.
 */
export function setJarvisAdapter(
  kind: AdapterKind,
  opts?: { control_api_base?: string; project_id?: string },
): JarvisRuntime {
  setConnectionOverrides({
    adapter: kind,
    control_api_base: opts?.control_api_base,
    project_id: opts?.project_id,
  });
  const path = singleton?.dbPath ?? resolveJarvisDbPath();
  try {
    singleton?.db.close();
  } catch {
    /* already closed */
  }
  singleton = buildRuntime(path, kind);
  return singleton;
}

/** Update project id without rebuilding stores when possible — still rebuild adapter if base changes. */
export function setJarvisConnection(opts: {
  adapter?: AdapterKind;
  control_api_base?: string;
  project_id?: string;
}): JarvisRuntime {
  const kind = opts.adapter ?? getActiveAdapterKind();
  return setJarvisAdapter(kind, {
    control_api_base: opts.control_api_base ?? getControlApiBase(),
    project_id: opts.project_id ?? getOsProjectId() ?? undefined,
  });
}

/** Test helper — drop process singleton (fresh :memory: under Vitest). */
export function resetJarvisRuntime(opts?: { dbPath?: string; adapter?: AdapterKind }): void {
  try {
    singleton?.db.close();
  } catch {
    /* already closed */
  }
  singleton = null;
  resetConnectionOverrides();
  if (opts?.adapter) setConnectionOverrides({ adapter: opts.adapter });
  resetEscalationStore();
  resetKillSwitchState();
  resetQuarantine();
  if (opts?.dbPath || opts?.adapter) {
    singleton = buildRuntime(opts?.dbPath ?? resolveJarvisDbPath(), getActiveAdapterKind());
  }
}

/** Simulate API restart — reopen the same DB path; durable rows remain. */
export function reopenJarvisRuntime(): void {
  const path = singleton?.dbPath ?? resolveJarvisDbPath();
  const kind = getActiveAdapterKind();
  try {
    singleton?.db.close();
  } catch {
    /* already closed */
  }
  singleton = null;
  singleton = buildRuntime(path, kind);
}

export interface GoalDetail {
  goal: Goal;
  objectives: Objective[];
  tasks: Task[];
  runs: AgentRun[];
  adapter: AdapterKind;
  mode: Goal["mode"];
  trust_tier: Goal["trust_tier"];
}

export function listGoalSummaries(engine: GoalEngine) {
  return engine.store.listGoals().map((g) => ({
    id: g.id,
    title: g.title,
    outcome: g.outcome,
    domain: g.domain,
    status: g.status,
    mode: g.mode,
    trust_tier: g.trust_tier,
    updated_at: g.updated_at,
  }));
}

export function getGoalDetail(engine: GoalEngine, id: string): GoalDetail | null {
  const goal = engine.store.goals.get(id);
  if (!goal) return null;
  const { adapterName } = getJarvisRuntime();
  const objectives = [...engine.store.objectives.values()].filter((o) => o.goal_id === id);
  const tasks = [...engine.store.tasks.values()].filter((t) => t.goal_id === id);
  const runs = [...engine.store.runs.values()].filter((r) => r.goal_id === id);
  return {
    goal,
    objectives,
    tasks,
    runs,
    adapter: adapterName,
    mode: goal.mode,
    trust_tier: goal.trust_tier,
  };
}

export interface ReplayBundle {
  decision: DecisionRecord;
  goal: Goal | null;
  evidence: EvidenceNode[];
  runs: AgentRun[];
  replay_json: string;
}

export function buildReplay(engine: GoalEngine, decision_id: string): ReplayBundle | null {
  const decision = engine.journal.get(decision_id);
  if (!decision) return null;
  const goal = decision.goal_id ? (engine.store.goals.get(decision.goal_id) ?? null) : null;
  const evidence = decision.goal_id
    ? engine.evidence.chainForGoal(decision.goal_id)
    : engine.evidence.all().filter((n) => n.correlation?.decision_id === decision_id);
  const runs = [...engine.store.runs.values()].filter((r) => r.decision_id === decision_id);
  const bundle = { decision, goal, evidence, runs };
  return { ...bundle, replay_json: JSON.stringify(bundle, null, 2) };
}

export interface OsSnapshotDto {
  adapter: AdapterKind;
  control_api: string | null;
  project_id: string | null;
  observation_only: boolean;
  reachable: boolean;
  error?: string;
  state?: {
    at: string;
    active_run_ids: string[];
    pending_gate_count: number;
    overlapping_summaries: string[];
    raw_summary: string;
  };
  capabilities?: { tool_id: string; display_name: string; specialist_id?: string }[];
}

export async function buildOsSnapshot(): Promise<OsSnapshotDto> {
  const { adapter, adapterName, controlApiBase, projectId } = getJarvisRuntime();
  if (adapterName === "mock") {
    const state = await adapter.getCurrentState({
      include_runs: true,
      include_gates: true,
    });
    const capabilities = await adapter.listCapabilities();
    return {
      adapter: "mock",
      control_api: null,
      project_id: projectId,
      observation_only: true,
      reachable: true,
      state,
      capabilities,
    };
  }

  try {
    const [state, capabilities] = await Promise.all([
      adapter.getCurrentState({ include_runs: true, include_gates: true }),
      adapter.listCapabilities(),
    ]);
    return {
      adapter: "umer-read",
      control_api: controlApiBase,
      project_id: projectId,
      observation_only: false,
      reachable: true,
      state,
      capabilities: capabilities.slice(0, 40),
    };
  } catch (e) {
    return {
      adapter: "umer-read",
      control_api: controlApiBase,
      project_id: projectId,
      observation_only: false,
      reachable: false,
      error: e instanceof Error ? e.message : "OS snapshot failed",
    };
  }
}
