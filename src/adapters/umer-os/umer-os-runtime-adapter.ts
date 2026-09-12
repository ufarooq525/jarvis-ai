import type {
  CorrelationIds,
  OsCapability,
  OsRuntimeAdapter,
  OsRunRecord,
  OsStateSnapshot,
  RunSpec,
  SimulateResult,
} from "../../contracts/os-runtime-adapter.js";
import { newId, nowIso } from "../../util/ids.js";
import { resolveControlApiBase } from "../../config.js";
import { ControlApiClient, type FetchLike } from "./http-client.js";

export interface UmerOsAdapterOptions {
  baseUrl?: string;
  fetchImpl?: FetchLike;
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
 * Read-only Umer OS adapter (Phase D).
 * GETs only against Control API. Shadow startRun stays local noop.
 * Live startRun is NotImplemented until Phase E.
 */
export class UmerOsRuntimeAdapter implements OsRuntimeAdapter {
  readonly name = "umer-read";
  readonly client: ControlApiClient;

  constructor(opts: UmerOsAdapterOptions = {}) {
    this.client = new ControlApiClient(
      opts.baseUrl ?? resolveControlApiBase(),
      opts.fetchImpl,
    );
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
    // OS has no dry-run — local prediction only (no HTTP).
    return {
      predicted_summary: `Observe-only simulate ${spec.tool_id} (no OS dry-run; Phase D)`,
      blast_radius: "local",
      side_effects: false,
      conflicts: [],
    };
  }

  async startRun(spec: RunSpec): Promise<OsRunRecord> {
    if (spec.mode !== "live") {
      // Shadow: local noop — must not call Control API writes.
      return {
        os_run_id: newId("umer_shadow"),
        status: "noop_shadow",
        summary: `SHADOW noop via umer-read — would invoke ${spec.tool_id} (no OS write)`,
        correlation: spec.correlation,
        started_at: nowIso(),
        finished_at: nowIso(),
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
      process.env.JARVIS_OS_PROJECT_ID?.trim();

    if (!projectId) {
      throw new Error(
        "Live startRun requires project_id (body or JARVIS_OS_PROJECT_ID) — fail closed",
      );
    }

    const approver =
      spec.approver ||
      spec.correlation.principal_id ||
      process.env.JARVIS_OS_APPROVER?.trim() ||
      "Human(Umer)";

    const path = `/v1/work-graph/${encodeURIComponent(projectId)}/plan`;
    const accepted = await this.client.postJson<{
      projectId?: string;
      correlationId?: string;
      execId?: string;
      readyNodeIds?: string[];
      taskIdsByNodeId?: Record<string, string[]>;
      message?: string;
    }>(path, { approver });

    // 202 body has no workPackageId — use correlation/exec as interim os_run_id handle.
    const os_run_id =
      accepted.correlationId ||
      accepted.execId ||
      `plan:${projectId}:${Date.now()}`;

    return {
      os_run_id,
      status: "running",
      summary:
        accepted.message ||
        `Live plan accepted for project ${projectId} (approver=${approver}); poll work-graph / agent-runs`,
      correlation: spec.correlation,
      started_at: nowIso(),
    };
  }

  async getRun(os_run_id: string): Promise<OsRunRecord | null> {
    try {
      const row = await this.client.getJson<AgentRunRecord>(
        `/v1/agent-runs/${encodeURIComponent(os_run_id)}`,
      );
      return mapAgentRun(os_run_id, row);
    } catch (e) {
      if (e && typeof e === "object" && "status" in e && (e as { status?: number }).status === 404) {
        return null;
      }
      throw e;
    }
  }

  async cancelRun(_os_run_id: string): Promise<{ ok: boolean; summary: string }> {
    return {
      ok: false,
      summary: "cancelRun not available in Phase D (observation only)",
    };
  }
}

function mapAgentRun(os_run_id: string, row: AgentRunRecord): OsRunRecord {
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

  const placeholder: CorrelationIds = {
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
