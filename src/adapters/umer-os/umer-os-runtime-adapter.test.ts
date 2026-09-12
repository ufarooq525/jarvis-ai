import { describe, expect, it } from "vitest";
import { UmerOsRuntimeAdapter } from "./umer-os-runtime-adapter.js";
import type { RunSpec } from "../../contracts/os-runtime-adapter.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("UmerOsRuntimeAdapter (Phase D read-only)", () => {
  it("maps dashboard + agents via GET only", async () => {
    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v1/agents")) {
        return jsonResponse({
          agents: [
            {
              agentId: "a1",
              name: "Ops Agent",
              specialistId: "ops",
              capabilityIds: ["ops.plan", "ops.report"],
              controlState: "active",
            },
          ],
        });
      }
      if (url.endsWith("/v1/dashboard")) {
        return jsonResponse({ pendingGates: 2, workPackagesAwaitingReview: 1 });
      }
      if (url.includes("/v1/agent-runs?status=running")) {
        return jsonResponse({
          agentRuns: [{ workPackageId: "wp-1", status: "running", title: "Ship weekly" }],
        });
      }
      if (url.endsWith("/v1/gates/pending")) {
        return jsonResponse({ gates: [{ waitId: "g1" }, { waitId: "g2" }] });
      }
      return jsonResponse({ error: "unexpected " + url }, 500);
    };

    const adapter = new UmerOsRuntimeAdapter({
      baseUrl: "http://control.test",
      fetchImpl,
    });

    const caps = await adapter.listCapabilities();
    expect(caps.map((c) => c.tool_id)).toEqual(["ops.plan", "ops.report"]);

    const state = await adapter.getCurrentState({
      domain: "ops",
      include_runs: true,
      include_gates: true,
    });
    expect(state.pending_gate_count).toBe(2);
    expect(state.active_run_ids).toEqual(["wp-1"]);
    expect(state.overlapping_summaries[0]).toContain("Ship weekly");

    expect(calls.every((u) => u.startsWith("http://control.test/"))).toBe(true);
    expect(calls.some((u) => u.includes("/plan"))).toBe(false);
  });

  it("shadow startRun is local noop; live POSTs plan when project_id set", async () => {
    const calls: { method: string; url: string; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      calls.push({ method, url, body: typeof init?.body === "string" ? init.body : undefined });
      if (method === "POST" && url.includes("/plan")) {
        return jsonResponse(
          {
            projectId: "proj-1",
            correlationId: "corr-plan-1",
            execId: "EXEC-1",
            readyNodeIds: ["n1"],
            message: "Planning requested",
          },
          202,
        );
      }
      throw new Error("unexpected " + method + " " + url);
    };
    const adapter = new UmerOsRuntimeAdapter({
      baseUrl: "http://control.test",
      fetchImpl,
    });
    const base: RunSpec = {
      tool_id: "os.runtime.start_run",
      input: {},
      domain: "ops",
      mode: "shadow",
      idempotency_key: "k1",
      correlation: {
        jarvis_goal_id: "g",
        jarvis_task_id: "t",
        jarvis_run_id: "r",
        decision_id: "d",
        principal_id: "human",
        delegation_chain: ["human", "jarvis"],
        mode: "shadow",
        policy_verdict_id: "v",
      },
    };
    const shadow = await adapter.startRun(base);
    expect(shadow.status).toBe("noop_shadow");
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    const live = await adapter.startRun({
      ...base,
      mode: "live",
      project_id: "proj-1",
      approver: "Human(Umer)",
      correlation: { ...base.correlation, mode: "live" },
    });
    expect(live.status).toBe("running");
    expect(live.os_run_id).toBe("corr-plan-1");
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/v1/work-graph/proj-1/plan"))).toBe(
      true,
    );
    expect(calls.find((c) => c.method === "POST")?.body).toContain("Human(Umer)");
  });

  it("proposeRun does not call Control API", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("no fetch");
    };
    const adapter = new UmerOsRuntimeAdapter({
      baseUrl: "http://control.test",
      fetchImpl,
    });
    const sim = await adapter.proposeRun({
      tool_id: "x",
      input: {},
      domain: "ops",
      mode: "shadow",
      idempotency_key: "k",
      correlation: {
        jarvis_goal_id: "g",
        jarvis_task_id: "t",
        jarvis_run_id: "r",
        decision_id: "d",
        principal_id: "human",
        delegation_chain: ["human"],
        mode: "shadow",
        policy_verdict_id: "v",
      },
    });
    expect(sim.side_effects).toBe(false);
  });
});
