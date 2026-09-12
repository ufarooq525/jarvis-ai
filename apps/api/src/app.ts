import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  buildOsSnapshot,
  buildReplay,
  getGoalDetail,
  getJarvisRuntime,
  listGoalSummaries,
  setJarvisAdapter,
  setJarvisConnection,
  type AdapterKind,
} from "../../../src/runtime.js";
import { getEscalationStore } from "../../../src/escalation/store.js";
import { createLiveApprovalDemo } from "../../../src/escalation/demo-live.js";
import { killSwitchStatus, setKillSwitch } from "../../../src/trust/kill-switch-control.js";
import {
  HUMAN_PRINCIPAL,
  JARVIS_PRINCIPAL,
  defaultDomainTrustTier,
} from "../../../src/trust/principals.js";
import { classifyProposal } from "../../../src/policy/classify.js";
import { PHASE1_MANIFESTS } from "../../../src/tools/registry.js";
import { getControlApiBase, getOsProjectId } from "../../../src/connection.js";
import {
  buildWmNow,
  listSpecialistStubs,
  listWmEntities,
} from "../../../src/world-model/project.js";
import { listQuarantine } from "../../../src/world-model/quarantine.js";
import { buildPortfolio } from "../../../src/portfolio/project.js";
import { computerActBlocked, getComputerSnapshot } from "../../../src/computer/observe.js";

export function createApp() {
  const app = new Hono();

  app.use(
    "*",
    cors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:3021"],
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => {
    const { adapterName, dbPath, controlApiBase, projectId } = getJarvisRuntime();
    return c.json({
      ok: true,
      service: "jarvis-api",
      phase: "H",
      adapter: adapterName,
      mode_default: "shadow",
      kill_switch: killSwitchStatus(),
      persistence: dbPath === ":memory:" ? "memory" : "sqlite",
      control_api: controlApiBase,
      project_id: projectId,
      observation_only: adapterName === "mock",
      computer_plane: "observe",
    });
  });

  app.get("/v1/meta", (c) => {
    const { adapterName, dbPath, controlApiBase } = getJarvisRuntime();
    return c.json({
      product: "JARVIS",
      phase: "H",
      adapter: adapterName,
      note: "Phase H: computer observe-only (no click/type/shell)",
      computer_plane: "observe",
      control_api: controlApiBase,
      persistence: dbPath === ":memory:" ? "memory" : "sqlite",
      observation_only: adapterName === "mock",
    });
  });

  app.get("/v1/goals", (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    return c.json({
      adapter: adapterName,
      goals: listGoalSummaries(engine),
    });
  });

  app.post("/v1/goals/shadow-loop", async (c) => {
    const body = await c.req.json<{ title?: string; outcome?: string; domain?: string }>();
    const outcome = body.outcome?.trim();
    if (!outcome) {
      return c.json({ error: "outcome is required" }, 400);
    }
    const title = body.title?.trim() || outcome.slice(0, 80);
    const domain = body.domain?.trim() || "general";

    const { engine, adapterName } = getJarvisRuntime();
    const result = await engine.runShadowLoop({ title, outcome, domain });
    const detail = getGoalDetail(engine, result.goal.id);

    return c.json({
      adapter: adapterName,
      message: result.message,
      decision_outcome: result.decision_outcome,
      decision_id: result.decision_id,
      goal: result.goal,
      runs: result.runs,
      detail,
      evidence: JSON.parse(result.evidence_json) as unknown[],
    });
  });

  app.get("/v1/goals/:id", (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    const detail = getGoalDetail(engine, c.req.param("id"));
    if (!detail) return c.json({ error: "goal not found" }, 404);
    return c.json({ ...detail, adapter: adapterName });
  });

  app.get("/v1/goals/:id/evidence", (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    const id = c.req.param("id");
    if (!engine.store.goals.has(id)) return c.json({ error: "goal not found" }, 404);
    const nodes = engine.evidence.chainForGoal(id);
    return c.json({
      adapter: adapterName,
      goal_id: id,
      evidence: nodes,
      evidence_json: engine.evidence.exportJson(id),
    });
  });

  // ——— Phase E: Strong-confirm → Live ———

  app.post("/v1/goals/:id/promote-live", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      confirm?: string;
      project_id?: string;
      approver?: string;
    };
    const { engine, adapterName } = getJarvisRuntime();
    try {
      const result = await engine.promoteToLive({
        goalId: c.req.param("id"),
        confirm: body.confirm ?? "",
        project_id: body.project_id || getOsProjectId() || undefined,
        approver: body.approver,
      });
      return c.json({
        adapter: adapterName,
        ...result,
        detail: getGoalDetail(engine, result.goal.id),
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "promote failed" }, 400);
    }
  });

  app.get("/v1/goals/:id/live-status", async (c) => {
    const { engine, adapter, adapterName } = getJarvisRuntime();
    const id = c.req.param("id");
    const goal = engine.store.goals.get(id);
    if (!goal) return c.json({ error: "goal not found" }, 404);
    const runs = [...engine.store.runs.values()].filter((r) => r.goal_id === id && r.mode === "live");
    const latest = runs[runs.length - 1];
    let os: Awaited<ReturnType<typeof adapter.getRun>> = null;
    if (latest?.os_run_id) {
      try {
        os = await adapter.getRun(latest.os_run_id);
      } catch (e) {
        return c.json({
          adapter: adapterName,
          goal_id: id,
          run: latest,
          os_run: null,
          error: e instanceof Error ? e.message : "getRun failed",
        });
      }
    }
    return c.json({
      adapter: adapterName,
      goal_id: id,
      goal_mode: goal.mode,
      trust_tier: goal.trust_tier,
      run: latest ?? null,
      os_run: os,
    });
  });

  // ——— Phase C: journal + replay ———

  app.get("/v1/journal", (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    const goalId = c.req.query("goal_id");
    const records = goalId ? engine.journal.byGoal(goalId) : engine.journal.all();
    return c.json({
      adapter: adapterName,
      journal: [...records].reverse(),
    });
  });

  app.get("/v1/replay/:decision_id", (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    const replay = buildReplay(engine, c.req.param("decision_id"));
    if (!replay) return c.json({ error: "decision not found" }, 404);
    return c.json({ adapter: adapterName, ...replay });
  });

  // ——— Phase D: observe OS (read-only) ———

  app.get("/v1/os/snapshot", async (c) => {
    const snap = await buildOsSnapshot();
    return c.json(snap, snap.reachable ? 200 : 503);
  });

  // ——— Phase F: World Model ———

  app.get("/v1/wm/now", async (c) => {
    const { engine, adapter, adapterName } = getJarvisRuntime();
    const snap = await buildOsSnapshot();
    const now = buildWmNow({
      engine,
      adapter,
      adapterName,
      os_run_count: snap.state?.active_run_ids.length ?? 0,
      pending_gates: snap.state?.pending_gate_count ?? 0,
    });
    return c.json({ ...now, os_reachable: snap.reachable });
  });

  app.get("/v1/wm/entities", async (c) => {
    const { engine, adapter, adapterName } = getJarvisRuntime();
    const q = c.req.query("q") ?? undefined;
    const types = c.req.query("types")?.split(",").filter(Boolean);
    const entities = listWmEntities({ engine, adapter, q, types });
    if (!types || types.includes("specialist")) {
      const specs = await listSpecialistStubs(adapter);
      const needle = (q ?? "").trim().toLowerCase();
      for (const s of specs) {
        if (
          !needle ||
          s.title.toLowerCase().includes(needle) ||
          s.entity_id.toLowerCase().includes(needle)
        ) {
          entities.push(s);
        }
      }
    }
    return c.json({
      adapter: adapterName,
      entities,
      quarantine: listQuarantine().slice(0, 20),
    });
  });

  app.get("/v1/portfolio", async (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    const snap = await buildOsSnapshot();
    const domain = c.req.query("domain") ?? undefined;
    const portfolio = buildPortfolio({
      engine,
      domainFilter: domain,
      os: {
        reachable: snap.reachable,
        run_count: snap.state?.active_run_ids.length ?? 0,
        pending_gates: snap.state?.pending_gate_count ?? 0,
      },
    });
    return c.json({ adapter: adapterName, ...portfolio });
  });

  // ——— Phase H: computer observe ———

  app.get("/v1/computer/snapshot", (c) => {
    return c.json(getComputerSnapshot());
  });

  app.post("/v1/computer/act", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: string };
    try {
      computerActBlocked(body.action ?? "unknown");
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "act blocked", act_enabled: false }, 403);
    }
  });

  app.post("/v1/adapter", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      adapter?: string;
      control_api_base?: string;
      project_id?: string;
    };
    const raw = body.adapter?.trim().toLowerCase();
    let kind: AdapterKind | null = null;
    if (raw === "mock") kind = "mock";
    if (raw === "umer-read" || raw === "umer") kind = "umer-read";
    if (!kind && (body.control_api_base || body.project_id)) {
      kind = getJarvisRuntime().adapterName;
    }
    if (!kind) return c.json({ error: "adapter must be mock|umer-read" }, 400);
    const rt = setJarvisConnection({
      adapter: kind,
      control_api_base: body.control_api_base,
      project_id: body.project_id,
    });
    return c.json({
      adapter: rt.adapterName,
      control_api: rt.controlApiBase,
      project_id: rt.projectId,
      observation_only: rt.adapterName === "mock",
      note:
        kind === "umer-read"
          ? `Connected to ${getControlApiBase()}${rt.projectId ? `; Live project=${rt.projectId}` : " — set project_id for Live"}`
          : "Mock adapter — no Control API calls",
    });
  });

  app.get("/v1/connection", (c) => {
    const { adapterName, controlApiBase, projectId } = getJarvisRuntime();
    return c.json({
      adapter: adapterName,
      control_api: controlApiBase,
      control_api_base: getControlApiBase(),
      project_id: projectId,
    });
  });

  app.get("/v1/os/projects", async (c) => {
    const base = getControlApiBase();
    try {
      const [catalogRes, workRes] = await Promise.all([
        fetch(`${base}/v1/projects`),
        fetch(`${base}/v1/work-projects`),
      ]);
      const catalog = catalogRes.ok
        ? ((await catalogRes.json()) as { projects?: Array<Record<string, unknown>> })
        : { projects: [] };
      const work = workRes.ok
        ? ((await workRes.json()) as { projects?: Array<Record<string, unknown>> })
        : { projects: [] };

      const work_projects = (work.projects ?? []).map((p) => ({
        project_id: String(p.projectId ?? p.id ?? ""),
        name: String(p.name ?? p.projectId ?? ""),
        status: String(p.status ?? ""),
        registry_project_id: p.registryProjectId ? String(p.registryProjectId) : undefined,
        source: "work-projects" as const,
        use_for_live: true,
      }));

      const catalog_projects = (catalog.projects ?? []).map((p) => ({
        project_id: String(p.projectId ?? ""),
        name: String(p.name ?? p.projectId ?? ""),
        status: String(p.status ?? ""),
        on_disk: Boolean(p.onDisk),
        source: "catalog" as const,
        use_for_live: false,
        note: "Catalog id — prefer a work-projects id for POST /work-graph/.../plan",
      }));

      return c.json({
        control_api: base,
        selected_project_id: getOsProjectId(),
        work_projects,
        catalog_projects,
        hint: "Use work_projects[].project_id for Live promote (work-graph plan).",
      });
    } catch (e) {
      return c.json(
        {
          error: e instanceof Error ? e.message : "Failed to list OS projects",
          control_api: base,
          work_projects: [],
          catalog_projects: [],
        },
        503,
      );
    }
  });

  // ——— Phase B: tools / trust / escalations ———

  app.get("/v1/tools", (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    return c.json({ adapter: adapterName, tools: engine.tools.list() });
  });

  app.get("/v1/tools/:tool_id", (c) => {
    const { engine } = getJarvisRuntime();
    const tool = engine.tools.get(c.req.param("tool_id"));
    if (!tool) return c.json({ error: "tool not registered" }, 404);
    return c.json({ tool });
  });

  app.get("/v1/trust/status", (c) => {
    const domains = ["general", "ops", "comms", "finance", "data", "engineering", "growth"];
    const domain_tiers = Object.fromEntries(domains.map((d) => [d, defaultDomainTrustTier()]));
    return c.json({
      principals: [
        { id: HUMAN_PRINCIPAL, role: "human_owner" },
        { id: JARVIS_PRINCIPAL, role: "control_plane" },
      ],
      domain_tiers,
      kill_switch: killSwitchStatus(),
      autonomy_defaults: { shadow_ceiling: 1, live_requires_approval_below: 2 },
      note: "New domains default SHADOW. Live writes need APPROVED path + human confirm.",
    });
  });

  app.post("/v1/trust/kill-switch", async (c) => {
    const body = await c.req.json<{ action?: string; reason?: string }>();
    if (body.action !== "engage" && body.action !== "clear") {
      return c.json({ error: "action must be engage|clear" }, 400);
    }
    const status = setKillSwitch(body.action, body.reason);
    return c.json({ kill_switch: status });
  });

  app.post("/v1/policy/preview", async (c) => {
    const body = await c.req.json<{
      tool_id?: string;
      mode?: "shadow" | "live";
      trust_tier?: "SHADOW" | "LIMITED" | "APPROVED" | "TRUSTED" | "AUTONOMOUS";
      autonomy_ceiling?: 0 | 1 | 2 | 3 | 4;
    }>();
    const tool_id = body.tool_id?.trim();
    if (!tool_id) return c.json({ error: "tool_id is required" }, 400);
    const { engine } = getJarvisRuntime();
    let manifest;
    try {
      manifest = engine.tools.require(tool_id);
    } catch {
      return c.json({ error: `Tool not registered: ${tool_id}` }, 400);
    }
    const now = new Date().toISOString();
    const verdict = classifyProposal({
      tool_id,
      manifest,
      goal: {
        id: "preview",
        title: "preview",
        outcome: "preview",
        domain: "general",
        status: "active",
        priority: 1,
        trust_tier: body.trust_tier ?? "SHADOW",
        autonomy_ceiling: body.autonomy_ceiling ?? 0,
        mode: body.mode ?? "shadow",
        key_results: [],
        owner_principal_id: HUMAN_PRINCIPAL,
        created_at: now,
        updated_at: now,
      },
    });
    return c.json({ verdict, manifest });
  });

  app.get("/v1/escalations", (c) => {
    const status = c.req.query("status") as "pending" | "approved" | "rejected" | "expired" | undefined;
    const store = getEscalationStore();
    return c.json({
      escalations: store.list(status ? { status } : undefined),
    });
  });

  app.post("/v1/escalations/demo", async (c) => {
    const body = await c.req.json<{ title?: string; outcome?: string }>().catch(() => ({}));
    const { engine, adapterName } = getJarvisRuntime();
    const demo = createLiveApprovalDemo(engine, body as { title?: string; outcome?: string });
    return c.json({
      adapter: adapterName,
      message:
        demo.verdict.class === "reject"
          ? "Live path rejected by policy (often kill switch). Inbox updated."
          : "Live-shaped start_run queued for human approval — no OS call.",
      ...demo,
    });
  });

  app.post("/v1/escalations/:id/resolve", async (c) => {
    const body = await c.req.json<{ decision?: string }>();
    if (body.decision !== "approve" && body.decision !== "reject") {
      return c.json({ error: "decision must be approve|reject" }, 400);
    }
    try {
      const row = getEscalationStore().resolve(c.req.param("id"), body.decision);
      const { engine } = getJarvisRuntime();
      const run = row.run_id ? engine.store.runs.get(row.run_id) : undefined;
      if (run) {
        run.status = body.decision === "approve" ? "approved" : "cancelled";
        engine.store.saveRun(run);
      }
      const task = run ? engine.store.tasks.get(run.task_id) : undefined;
      if (task) {
        task.status = body.decision === "approve" ? "ready" : "cancelled";
        engine.store.saveTask(task);
      }
      // Still no OS startRun — Phase E. Approve records intent only.
      return c.json({
        escalation: row,
        note:
          body.decision === "approve"
            ? "Recorded approve. Live OS startRun waits until Phase E."
            : "Rejected — no Live dispatch.",
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "resolve failed" }, 400);
    }
  });

  // Sanity: manifests catalog matches package constant
  void PHASE1_MANIFESTS;

  return app;
}
