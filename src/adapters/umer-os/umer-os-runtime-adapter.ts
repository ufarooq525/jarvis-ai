import type {
  CorrelationIds,
  OsCapability,
  OsRuntimeAdapter,
  OsRunRecord,
  OsStateSnapshot,
  RunSpec,
  SimulateResult,
} from "../../contracts/os-runtime-adapter.js";
import { pollSubscribeRun } from "../../contracts/os-runtime-adapter.js";
import { newId, nowIso } from "../../util/ids.js";
import { resolveControlApiBase } from "../../config.js";
import { getOsProjectId } from "../../connection.js";
import { ControlApiClient, type FetchLike } from "./http-client.js";

export interface UmerOsAdapterOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
  /** Principal used for CancelWork CEO commands (verified against OS contracts). */
  cancel_actor_id?: string;
  cancel_agent_id?: string;
}

type AgentsResponse = {
  agents?: Array<{
    agentId?: string;
    name?: string;
    specialistId?: string;
    capabilityIds?: string[];
    status?: string;
    controlState?: string;
  }>;
};

type DashboardResponse = {
  pendingGates?: number;
  workPackagesAwaitingReview?: number;
  resolvedToday?: number;
};

type AgentRunsResponse = {
  agentRuns?: Array<{
    workPackageId?: string;
    status?: string;
    summary?: string;
    title?: string;
  }>;
};

type GatesResponse = {
  gates?: Array<{ waitId?: string; workPackageId?: string; status?: string }>;
};

type AgentRunRecord = {
  workPackageId?: string;
  status?: string;
  summary?: string;
  errorMessage?: string;
  startedAt?: string;
  finishedAt?: string;
  updatedAt?: string;
};

/**
 * Umer OS adapter — Goal Engine talks only through OsRuntimeAdapter.
 *
 * Verified Control API routes (umer-ai-os apps/control-api/src/server.ts):
 * - GET  /v1/agents
 * - GET  /v1/dashboard
 * - GET  /v1/agent-runs?status=running
 * - GET  /v1/agent-runs/:workPackageId
 * - GET  /v1/gates/pending
 * - POST /v1/work-graph/:projectId/plan   (Live only)
 * - POST /v1/commands  CancelWork         (best-effort cancel)
 *
 * No OS dry-run; no NATS in JARVIS — subscribeRun uses controlled polling.
 */
export class UmerOsRuntimeAdapter implements OsRuntimeAdapter {
  readonly name = "umer-read";
  readonly client: ControlApiClient;

  /** JARVIS correlation retained across getRun polls. */
  private readonly correlationByOsRun = new Map<string, CorrelationIds>();
  /** Live idempotency_key → os_run_id (adapter-level duplicate dispatch guard). */
  private readonly liveIdempotency = new Map<string, string>();
  private readonly cancelActorId: string;
  private readonly cancelAgentId: string;

  constructor(opts: UmerOsAdapterOptions = {}) {
    this.client = new ControlApiClient(
      opts.baseUrl ?? resolveControlApiBase(),
      opts.fetchImpl,
    );
    this.cancelActorId =
      opts.cancel_actor_id ??
      process.env.JARVIS_OS_APPROVER?.trim() ??
      "human.ceo";
    this.cancelAgentId =
      opts.cancel_agent_id ?? process.env.JARVIS_OS_CANCEL_AGENT_ID?.trim() ?? "jarvis.adapter";
  }

  async listCapabilities(): Promise<OsCapability[]> {
    try {
      const data = await this.client.getJson<AgentsResponse>("/v1/agents");
      const out: OsCapability[] = [];
      for (const agent of data.agents ?? []) {
        const specialist = agent.specialistId ?? agent.agentId ?? "unknown";
        const caps = agent.capabilityIds?.length
          ? agent.capabilityIds
          : [`specialist.${specialist}`];
        for (const cap of caps) {
          out.push({
            tool_id: cap,
            display_name: agent.name ?? cap,
            specialist_id: specialist,
            summary: agent.controlState ? `control=${agent.controlState}` : undefined,
          });
        }
      }
      if (out.length === 0) {
        return [
          {
            tool_id: "os.runtime.get_state",
            display_name: "Umer OS state (no agents listed)",
            specialist_id: "umer.observe",
          },
        ];
      }
      return out;
    } catch (e) {
      return [
        {
          tool_id: "os.runtime.get_state",
          display_name: "Umer OS (unreachable)",
          specialist_id: "umer.observe",
          summary: e instanceof Error ? e.message : "unreachable",
        },
      ];
    }
  }

  async getCurrentState(query: {
    domain?: string;
    include_runs?: boolean;
    include_gates?: boolean;
  }): Promise<OsStateSnapshot> {
    const dashboard = await this.client.getJson<DashboardResponse>("/v1/dashboard");
    let active_run_ids: string[] = [];
    const overlapping_summaries: string[] = [];

    if (query.include_runs !== false) {
      try {
        const runs = await this.client.getJson<AgentRunsResponse>(
          "/v1/agent-runs?status=running",
        );
        for (const r of runs.agentRuns ?? []) {
          if (r.workPackageId) active_run_ids.push(r.workPackageId);
          const label = r.title ?? r.summary;
          if (label) overlapping_summaries.push(label);
        }
      } catch {
        /* dashboard still usable */
      }
    }

    let pending_gate_count = dashboard.pendingGates ?? 0;
    if (query.include_gates) {
      try {
        const gates = await this.client.getJson<GatesResponse>("/v1/gates/pending");
        pending_gate_count = gates.gates?.length ?? pending_gate_count;
      } catch {
        /* keep dashboard count */
      }
    }

    const raw_summary = [
      `umer-read @ ${this.client.baseUrl}`,
      `domain=${query.domain ?? "any"}`,
      `pendingGates=${pending_gate_count}`,
      `activeRuns=${active_run_ids.length}`,
      `awaitingReview=${dashboard.workPackagesAwaitingReview ?? 0}`,
    ].join("; ");

    return {
      at: nowIso(),
      active_run_ids,
      pending_gate_count,
      overlapping_summaries,
      raw_summary,
    };
  }

  async proposeRun(spec: RunSpec): Promise<SimulateResult> {
    return {
      predicted_summary: `Local simulate ${spec.tool_id} for goal ${spec.correlation.jarvis_goal_id} (OS has no dry-run)`,
      blast_radius: spec.mode === "live" ? "account" : "local",
      side_effects: false,
      conflicts: [],
    };
  }

  async startRun(spec: RunSpec): Promise<OsRunRecord> {
    if (spec.mode !== "live") {
      const os_run_id = newId("umer_shadow");
      const record: OsRunRecord = {
        os_run_id,
        status: "noop_shadow",
        summary: `SHADOW noop via umer-read — would invoke ${spec.tool_id} (no OS write)`,
        correlation: spec.correlation,
        started_at: nowIso(),
        finished_at: nowIso(),
      };
      this.correlationByOsRun.set(os_run_id, spec.correlation);
      return record;
    }

    const existingOs = this.liveIdempotency.get(spec.idempotency_key);
    if (existingOs) {
      const cached = await this.getRun(existingOs);
      if (cached) return cached;
      // Fall through if observation lost — do not double-post blindly; return stub from map.
      const corr = this.correlationByOsRun.get(existingOs) ?? spec.correlation;
      return {
        os_run_id: existingOs,
        status: "running",
        summary: "Idempotent Live replay — prior os_run_id returned",
        correlation: corr,
        started_at: nowIso(),
      };
    }

    const projectId =
      spec.project_id ||
      (typeof spec.input === "object" &&
      spec.input &&
      "project_id" in spec.input &&
      typeof (spec.input as { project_id?: string }).project_id === "string"
        ? (spec.input as { project_id: string }).project_id
        : undefined) ||
      getOsProjectId() ||
      undefined;

    if (!projectId) {
      throw new Error(
        "Live startRun requires project_id (body, Settings, or JARVIS_OS_PROJECT_ID) — fail closed",
      );
    }

    const approver =
      spec.approver ||
      process.env.JARVIS_OS_APPROVER?.trim() ||
      "human.ceo";

    const path = `/v1/work-graph/${encodeURIComponent(projectId)}/plan`;
    const accepted = await this.client.postJson<{
      projectId?: string;
      correlationId?: string;
      execId?: string;
      readyNodeIds?: string[];
      taskIdsByNodeId?: Record<string, string[]>;
      message?: string;
    }>(path, { approver });

    const os_run_id =
      accepted.correlationId ||
      accepted.execId ||
      `plan:${projectId}:${Date.now()}`;

    this.correlationByOsRun.set(os_run_id, spec.correlation);
    this.liveIdempotency.set(spec.idempotency_key, os_run_id);

    return {
      os_run_id,
      status: "running",
      summary:
        accepted.message ||
        `Live plan accepted for project ${projectId} (approver=${approver}); poll GET /v1/agent-runs/:id`,
      correlation: spec.correlation,
      started_at: nowIso(),
    };
  }

  async getRun(os_run_id: string): Promise<OsRunRecord | null> {
    const stored = this.correlationByOsRun.get(os_run_id);
    try {
      const row = await this.client.getJson<AgentRunRecord>(
        `/v1/agent-runs/${encodeURIComponent(os_run_id)}`,
      );
      return mapAgentRun(os_run_id, row, stored);
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && (e as { status?: number }).status === 404) {
        // Plan correlation ids may not appear in agent-run read model yet.
        if (stored) {
          return {
            os_run_id,
            status: "running",
            summary: "Awaiting agent-run projection (correlation retained)",
            correlation: stored,
            started_at: nowIso(),
          };
        }
        return null;
      }
      throw e;
    }
  }

  /**
   * Best-effort cancel via CEO Command Plane:
   * POST /v1/commands { name: "CancelWork", payload: { agentId, workPackageId } }
   * Verified against control-api server.ts + CancelWorkPayloadSchema.
   */
  async cancelRun(os_run_id: string): Promise<{ ok: boolean; summary: string }> {
    try {
      await this.client.postJson("/v1/commands", {
        name: "CancelWork",
        actor: { principalId: this.cancelActorId, kind: "human" },
        payload: {
          agentId: this.cancelAgentId,
          workPackageId: os_run_id,
          reason: "JARVIS cancelRun",
        },
        correlationId: `jarvis-cancel-${os_run_id}`,
        idempotencyKey: `jarvis-cancel:${os_run_id}`,
      });
      return {
        ok: true,
        summary: `CancelWork accepted for workPackageId=${os_run_id}`,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return {
        ok: false,
        summary: `CancelWork failed (OS may require a real task/workPackage id, not plan correlation): ${msg}`,
      };
    }
  }

  async subscribeRun(
    os_run_id: string,
    onUpdate: (record: OsRunRecord) => void,
    opts?: { interval_ms?: number; timeout_ms?: number },
  ): Promise<OsRunRecord | null> {
    return pollSubscribeRun((id) => this.getRun(id), os_run_id, onUpdate, opts);
  }
}

function mapAgentRun(
  os_run_id: string,
  row: AgentRunRecord,
  stored?: CorrelationIds,
): OsRunRecord {
  const statusRaw = (row.status ?? "").toLowerCase();
  let status: OsRunRecord["status"] = "running";
  if (statusRaw.includes("complete") || statusRaw === "succeeded" || statusRaw === "done") {
    status = "succeeded";
  } else if (statusRaw.includes("fail")) {
    status = "failed";
  } else if (statusRaw.includes("cancel")) {
    status = "cancelled";
  } else if (statusRaw.includes("propos") || statusRaw.includes("simulat")) {
    status = "simulated";
  }

  const placeholder: CorrelationIds = stored ?? {
    jarvis_goal_id: "unknown",
    jarvis_task_id: "unknown",
    jarvis_run_id: "unknown",
    decision_id: "unknown",
    principal_id: "umer.os",
    delegation_chain: ["umer.os"],
    mode: "live",
    policy_verdict_id: "observed",
  };

  return {
    os_run_id: row.workPackageId ?? os_run_id,
    status,
    summary: row.summary ?? row.errorMessage ?? statusRaw ?? "observed",
    correlation: placeholder,
    started_at: row.startedAt ?? row.updatedAt ?? nowIso(),
    finished_at: row.finishedAt,
  };
}
