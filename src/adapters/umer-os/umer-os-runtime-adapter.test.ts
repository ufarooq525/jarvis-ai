import { describe, expect, it } from "vitest";
import { UmerOsRuntimeAdapter } from "./umer-os-runtime-adapter.js";
import type { RunSpec } from "../../contracts/os-runtime-adapter.js";

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function baseSpec(over: Partial<RunSpec> = {}): RunSpec {
  return {
    tool_id: "os.runtime.start_run",
    input: {},
    domain: "ops",
    mode: "shadow",
    idempotency_key: "k1",
    correlation: {
      jarvis_goal_id: "goal_g",
      jarvis_task_id: "task_t",
      jarvis_run_id: "run_r",
      decision_id: "dec_d",
      principal_id: "human",
      delegation_chain: ["human", "jarvis"],
      mode: "shadow",
      policy_verdict_id: "v",
    },
    ...over,
  };
}

describe("UmerOsRuntimeAdapter (Phase 4)", () => {
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
    const shadow = await adapter.startRun(baseSpec());
    expect(shadow.status).toBe("noop_shadow");
    expect(calls.some((c) => c.method === "POST")).toBe(false);

    const live = await adapter.startRun(
      baseSpec({
        mode: "live",
        project_id: "proj-1",
        approver: "Human(Umer)",
        correlation: { ...baseSpec().correlation, mode: "live" },
      }),
    );
    expect(live.status).toBe("running");
    expect(live.os_run_id).toBe("corr-plan-1");
    expect(live.correlation.jarvis_goal_id).toBe("goal_g");
    expect(calls.some((c) => c.method === "POST" && c.url.includes("/v1/work-graph/proj-1/plan"))).toBe(
      true,
    );
  });

  it("Live startRun is idempotent at adapter boundary", async () => {
    let posts = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && String(input).includes("/plan")) {
        posts += 1;
        return jsonResponse({ correlationId: "corr-once", message: "ok" }, 202);
      }
      if (method === "GET" && String(input).includes("/v1/agent-runs/")) {
        return jsonResponse({ error: "missing" }, 404);
      }
      throw new Error("unexpected");
    };
    const adapter = new UmerOsRuntimeAdapter({ baseUrl: "http://control.test", fetchImpl });
    const spec = baseSpec({
      mode: "live",
      project_id: "proj-1",
      idempotency_key: "live-dup-1",
      correlation: { ...baseSpec().correlation, mode: "live" },
    });
    const a = await adapter.startRun(spec);
    const b = await adapter.startRun(spec);
    expect(a.os_run_id).toBe("corr-once");
    expect(b.os_run_id).toBe(a.os_run_id);
    expect(posts).toBe(1);
  });

  it("getRun restores JARVIS correlation from adapter map", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const method = (init?.method ?? "GET").toUpperCase();
      const url = String(input);
      if (method === "POST" && url.includes("/plan")) {
        return jsonResponse({ correlationId: "corr-map-1" }, 202);
      }
      if (method === "GET" && url.includes("/v1/agent-runs/corr-map-1")) {
        return jsonResponse({
          workPackageId: "corr-map-1",
          status: "running",
          summary: "still going",
        });
      }
      throw new Error("unexpected " + method + " " + url);
    };
    const adapter = new UmerOsRuntimeAdapter({ baseUrl: "http://control.test", fetchImpl });
    await adapter.startRun(
      baseSpec({
        mode: "live",
        project_id: "proj-1",
        idempotency_key: "map-1",
        correlation: {
          ...baseSpec().correlation,
          mode: "live",
          jarvis_goal_id: "goal_mapped",
          decision_id: "dec_mapped",
        },
      }),
    );
    const got = await adapter.getRun("corr-map-1");
    expect(got?.correlation.jarvis_goal_id).toBe("goal_mapped");
    expect(got?.correlation.decision_id).toBe("dec_mapped");
    expect(got?.status).toBe("running");
  });

  it("cancelRun POSTs CancelWork CEO command (verified route)", async () => {
    const bodies: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (method === "POST" && url.endsWith("/v1/commands")) {
        bodies.push(String(init?.body ?? ""));
        return jsonResponse({ status: "applied" }, 201);
      }
      throw new Error("unexpected");
    };
    const adapter = new UmerOsRuntimeAdapter({
      baseUrl: "http://control.test",
      fetchImpl,
      cancel_actor_id: "human.ceo",
      cancel_agent_id: "agent-1",
    });
    const result = await adapter.cancelRun("wp-99");
    expect(result.ok).toBe(true);
    expect(bodies[0]).toContain("CancelWork");
    expect(bodies[0]).toContain("wp-99");
    expect(bodies[0]).toContain("agent-1");
  });

  it("subscribeRun polls getRun until terminal", async () => {
    let n = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/v1/agent-runs/wp-sub")) {
        n += 1;
        return jsonResponse({
          workPackageId: "wp-sub",
          status: n < 2 ? "running" : "completed",
          summary: n < 2 ? "working" : "done",
        });
      }
      return jsonResponse({ error: "no" }, 404);
    };
    const adapter = new UmerOsRuntimeAdapter({ baseUrl: "http://control.test", fetchImpl });
    // Seed correlation so getRun path is used with retained ids if needed
    (adapter as unknown as { correlationByOsRun: Map<string, unknown> }).correlationByOsRun.set(
      "wp-sub",
      baseSpec().correlation,
    );

    const updates: string[] = [];
    const final = await adapter.subscribeRun!(
      "wp-sub",
      (r) => updates.push(r.status),
      { interval_ms: 5, timeout_ms: 500 },
    );
    expect(final?.status).toBe("succeeded");
    expect(updates.length).toBeGreaterThanOrEqual(2);
  });

  it("proposeRun does not call Control API", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("no fetch");
    };
    const adapter = new UmerOsRuntimeAdapter({
      baseUrl: "http://control.test",
      fetchImpl,
    });
    const sim = await adapter.proposeRun(baseSpec());
    expect(sim.side_effects).toBe(false);
  });
});
