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
import { getFactStore } from "../../../src/world-model/fact-store.js";
import { ingestBrowserResearch } from "../../../src/world-model/ingest-research.js";
import { getSkillStore } from "../../../src/skills/skill-store.js";
import { ingestFactsToSkill, ingestTextToSkill } from "../../../src/skills/ingest.js";
import { getOpportunityStore } from "../../../src/ops/opportunity-store.js";
import { createOpportunityFromFacts } from "../../../src/ops/from-facts.js";
import { getModelRouter } from "../../../src/model-router/router.js";
import { buildPortfolio } from "../../../src/portfolio/project.js";
import { computerActBlocked, getComputerSnapshot } from "../../../src/computer/observe.js";
import { ComputerRuntime } from "../../../src/computer/runtime.js";
import { browserActBlocked, getBrowserSnapshot } from "../../../src/browser/observe.js";
import { BrowserRuntime } from "../../../src/browser/runtime.js";
import { newId } from "../../../src/util/ids.js";

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
      phase: "12",
      adapter: adapterName,
      mode_default: "shadow",
      kill_switch: killSwitchStatus(),
      persistence: dbPath === ":memory:" ? "memory" : "sqlite",
      control_api: controlApiBase,
      project_id: projectId,
      observation_only: adapterName === "mock",
      computer_plane: "shadow",
      browser_plane: "shadow",
      memory_plane: "facts",
      skills_plane: "shadow",
      ops_plane: "shadow",
      model_plane: "router",
      voice_plane: "opt-in",
      ui_plane: "command-center",
    });
  });

  app.get("/v1/meta", (c) => {
    const { adapterName, dbPath, controlApiBase } = getJarvisRuntime();
    return c.json({
      product: "JARVIS",
      phase: "12",
      adapter: adapterName,
      note: "Phase 11–12 + Voice: Attention UI, reliability status, opt-in push-to-talk",
      computer_plane: "shadow",
      browser_plane: "shadow",
      memory_plane: "facts",
      skills_plane: "shadow",
      ops_plane: "shadow",
      model_plane: "router",
      voice_plane: "opt-in",
      ui_plane: "command-center",
      control_api: controlApiBase,
      persistence: dbPath === ":memory:" ? "memory" : "sqlite",
      observation_only: adapterName === "mock",
    });
  });

  app.get("/v1/system/status", (c) => {
    const { adapterName, dbPath, controlApiBase, projectId, engine } = getJarvisRuntime();
    const kill = killSwitchStatus();
    const pending = getEscalationStore().list({ status: "pending" }).length;
    const memory = getFactStore().counts();
    return c.json({
      ok: true,
      phase: "12",
      adapter: adapterName,
      kill_switch: kill,
      control_api: controlApiBase,
      project_id: projectId,
      persistence: dbPath === ":memory:" ? "memory" : "sqlite",
      goals: engine.store.listGoals().length,
      escalations_pending: pending,
      memory,
      planes: {
        computer: "shadow",
        browser: "shadow",
        skills: "shadow",
        ops: "shadow",
        model: "router",
        voice: "opt-in",
        ui: "command-center",
      },
      verification: {
        unit: "pnpm verify",
        live: "pnpm verify:live",
        all: "pnpm verify:all",
        demo_escalations_are_truth: false,
      },
      note: "Local verify is source of truth. Demo escalations are practice only.",
    });
  });

  app.get("/v1/voice/status", (c) => {
    return c.json({
      plane: "opt-in",
      always_on: false,
      wake_word: false,
      executes: false,
      bypasses_live_confirm: false,
      note: "Browser push-to-talk fills Composer text only. Enable in Settings. Shadow default.",
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
    const title = body.title?.trim();
    const domain = body.domain?.trim();

    const { engine, adapterName } = getJarvisRuntime();
    const result = await engine.runShadowLoop({
      title: title || undefined,
      outcome,
      domain: domain || undefined,
    });
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
      simulated: result.simulated,
      simulated_notice: result.simulated_notice,
      verification: result.verification,
      normalized: result.normalized,
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

  // ——— Phase 1: cancel / replan ———

  app.post("/v1/goals/:id/cancel", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    const { engine, adapterName } = getJarvisRuntime();
    try {
      const result = await engine.cancelGoal(c.req.param("id"), body.reason ?? "api cancel");
      return c.json({
        adapter: adapterName,
        ...result,
        detail: getGoalDetail(engine, result.goal.id),
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "cancel failed" }, 400);
    }
  });

  app.post("/v1/goals/:id/replan", async (c) => {
    const { engine, adapterName } = getJarvisRuntime();
    try {
      const result = await engine.replanGoal(c.req.param("id"));
      return c.json({
        adapter: adapterName,
        message: result.message,
        decision_outcome: result.decision_outcome,
        decision_id: result.decision_id,
        goal: result.goal,
        runs: result.runs,
        simulated: result.simulated,
        simulated_notice: result.simulated_notice,
        verification: result.verification,
        partial: result.partial,
        detail: getGoalDetail(engine, result.goal.id),
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "replan failed" }, 400);
    }
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
    const { engine, adapterName } = getJarvisRuntime();
    const id = c.req.param("id");
    try {
      const synced = await engine.syncLiveRun(id);
      return c.json({
        adapter: adapterName,
        goal_id: id,
        goal_mode: synced.goal.mode,
        trust_tier: synced.goal.trust_tier,
        goal_status: synced.goal.status,
        run: synced.run,
        os_run: synced.os_run,
        updated: synced.updated,
        message: synced.message,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "live-status failed";
      if (msg === "goal not found") return c.json({ error: msg }, 404);
      return c.json({ error: msg }, 400);
    }
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

  // ——— Phase 7: durable WM facts ———

  app.get("/v1/wm/facts", (c) => {
    const store = getFactStore();
    const facts = store.listFacts({
      goal_id: c.req.query("goal_id") || undefined,
      task_id: c.req.query("task_id") || undefined,
      q: c.req.query("q") || undefined,
      kind: (c.req.query("kind") as "observation" | "conclusion" | "inference" | "uncertainty") || undefined,
      status: (c.req.query("status") as "active" | "stale" | "invalidated" | "quarantined") || undefined,
    });
    return c.json({ facts, counts: store.counts() });
  });

  app.post("/v1/wm/facts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      claim?: string;
      kind?: "observation" | "conclusion" | "inference" | "uncertainty";
      confidence?: number;
      source?: string;
      source_url?: string;
      goal_id?: string;
      task_id?: string;
    };
    if (!body.claim?.trim()) return c.json({ error: "claim is required" }, 400);
    try {
      const fact = getFactStore().upsertFact({
        claim: body.claim.trim(),
        kind: body.kind ?? "observation",
        confidence: typeof body.confidence === "number" ? body.confidence : 0.7,
        source: body.source?.trim() || "human",
        source_url: body.source_url,
        goal_id: body.goal_id,
        task_id: body.task_id,
      });
      return c.json({ fact });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "upsert failed" }, 400);
    }
  });

  app.post("/v1/wm/facts/:id/invalidate", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    try {
      const fact = getFactStore().invalidate(c.req.param("id"), body.reason);
      return c.json({ fact });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "invalidate failed" }, 400);
    }
  });

  app.post("/v1/wm/facts/:id/reverify", async (c) => {
    try {
      const fact = getFactStore().reverify(c.req.param("id"));
      return c.json({ fact });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "reverify failed" }, 400);
    }
  });

  app.get("/v1/wm/links", (c) => {
    const links = getFactStore().listLinks({
      from_id: c.req.query("from_id") || undefined,
      to_id: c.req.query("to_id") || undefined,
    });
    return c.json({ links });
  });

  app.post("/v1/wm/links", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      from_id?: string;
      to_id?: string;
      rel?: string;
      confidence?: number;
      provenance?: string;
    };
    if (!body.from_id?.trim() || !body.to_id?.trim()) {
      return c.json({ error: "from_id and to_id are required" }, 400);
    }
    const link = getFactStore().addLink({
      from_id: body.from_id.trim(),
      to_id: body.to_id.trim(),
      rel: body.rel?.trim() || "related",
      confidence: body.confidence,
      provenance: body.provenance?.trim() || "human",
    });
    return c.json({ link });
  });

  // ——— Phase 8: SHADOW skill library ———

  app.get("/v1/skills", (c) => {
    const skills = getSkillStore().list({
      status: c.req.query("status") as "candidate" | "practicing" | "verified" | "retired" | undefined,
      q: c.req.query("q") || undefined,
    });
    return c.json({ skills });
  });

  app.get("/v1/skills/:id", (c) => {
    const skill = getSkillStore().get(c.req.param("id"));
    if (!skill) return c.json({ error: "skill not found" }, 404);
    return c.json({ skill });
  });

  app.post("/v1/skills/ingest", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      text?: string;
      title?: string;
      source?: string;
      source_urls?: string[];
    };
    if (!body.text?.trim()) return c.json({ error: "text is required" }, 400);
    try {
      const skill = ingestTextToSkill({
        text: body.text,
        title: body.title,
        source: body.source,
        source_urls: body.source_urls,
      });
      return c.json({ skill, message: "Candidate skill created (SHADOW)" });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "ingest failed" }, 400);
    }
  });

  app.post("/v1/skills/from-facts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      fact_ids?: string[];
      title?: string;
    };
    if (!body.fact_ids?.length) return c.json({ error: "fact_ids required" }, 400);
    try {
      const skill = ingestFactsToSkill({
        fact_ids: body.fact_ids,
        title: body.title,
      });
      return c.json({ skill, message: "Candidate skill derived from WM facts (SHADOW)" });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "from-facts failed" }, 400);
    }
  });

  app.post("/v1/skills/:id/practice", async (c) => {
    try {
      const skill = getSkillStore().practice(c.req.param("id"));
      return c.json({ skill, simulated: true });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "practice failed" }, 400);
    }
  });

  app.post("/v1/skills/:id/verify", async (c) => {
    try {
      const skill = getSkillStore().verify(c.req.param("id"));
      return c.json({
        skill,
        note: "Verified into library — still SHADOW; not executable",
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "verify failed" }, 400);
    }
  });

  app.post("/v1/skills/:id/retire", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    try {
      const skill = getSkillStore().retire(c.req.param("id"), body.reason);
      return c.json({ skill });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "retire failed" }, 400);
    }
  });

  app.post("/v1/skills/:id/execute", async (c) => {
    try {
      getSkillStore().assertNotExecutable(c.req.param("id"));
      return c.json({ error: "unreachable" }, 500);
    } catch (e) {
      return c.json(
        { error: e instanceof Error ? e.message : "execute blocked", executable: false },
        403,
      );
    }
  });

  // ——— Phase 9: Personal Business Operator (SHADOW) ———

  app.get("/v1/ops/opportunities", (c) => {
    const rows = getOpportunityStore().list({
      status: c.req.query("status") as
        | "researching"
        | "qualified"
        | "drafted"
        | "awaiting_approval"
        | "closed"
        | "retired"
        | undefined,
      q: c.req.query("q") || undefined,
    });
    return c.json({ opportunities: rows });
  });

  app.post("/v1/ops/opportunities", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      title?: string;
      company?: string;
      channel?: "upwork" | "fiverr" | "linkedin" | "email" | "web" | "other";
      summary?: string;
    };
    if (!body.title?.trim()) return c.json({ error: "title is required" }, 400);
    try {
      const opportunity = getOpportunityStore().create({
        title: body.title,
        company: body.company,
        channel: body.channel,
        summary: body.summary,
      });
      return c.json({ opportunity });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "create failed" }, 400);
    }
  });

  app.post("/v1/ops/opportunities/from-facts", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      fact_ids?: string[];
      title?: string;
      company?: string;
      channel?: "upwork" | "fiverr" | "linkedin" | "email" | "web" | "other";
    };
    if (!body.fact_ids?.length) return c.json({ error: "fact_ids required" }, 400);
    try {
      const opportunity = createOpportunityFromFacts({
        fact_ids: body.fact_ids,
        title: body.title,
        company: body.company,
        channel: body.channel,
      });
      return c.json({ opportunity });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "from-facts failed" }, 400);
    }
  });

  app.post("/v1/ops/opportunities/:id/qualify", async (c) => {
    try {
      const opp = getOpportunityStore().get(c.req.param("id"));
      if (!opp) return c.json({ error: "not found" }, 404);
      const facts = opp.provenance.fact_ids
        .map((id) => getFactStore().getFact(id))
        .filter((f): f is NonNullable<typeof f> => Boolean(f));
      const opportunity = getOpportunityStore().qualify(c.req.param("id"), facts);
      return c.json({ opportunity });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "qualify failed" }, 400);
    }
  });

  app.post("/v1/ops/opportunities/:id/draft", async (c) => {
    try {
      const opportunity = getOpportunityStore().draft(c.req.param("id"));
      return c.json({ opportunity, notice: opportunity.draft?.notice });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "draft failed" }, 400);
    }
  });

  app.post("/v1/ops/opportunities/:id/request-approval", async (c) => {
    try {
      const opportunity = getOpportunityStore().requestApproval(c.req.param("id"));
      return c.json({
        opportunity,
        note: "Marked awaiting_approval — still no send",
      });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "request-approval failed" }, 400);
    }
  });

  app.post("/v1/ops/opportunities/:id/retire", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    try {
      const opportunity = getOpportunityStore().retire(c.req.param("id"), body.reason);
      return c.json({ opportunity });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "retire failed" }, 400);
    }
  });

  for (const action of ["send", "publish", "bid"] as const) {
    app.post(`/v1/ops/opportunities/:id/${action}`, async (c) => {
      try {
        getOpportunityStore().assertSendBlocked(c.req.param("id"));
      } catch (e) {
        return c.json(
          {
            error: e instanceof Error ? e.message : `${action} blocked`,
            action,
            blocked: true,
          },
          403,
        );
      }
    });
  }

  // ——— Phase 10: Model router ———

  app.get("/v1/models/roles", (c) => {
    return c.json({ roles: getModelRouter().listRoles() });
  });

  app.get("/v1/models/health", async (c) => {
    const health = await getModelRouter().health();
    return c.json({ health });
  });

  app.post("/v1/models/complete", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      role?: "reason" | "code" | "vision" | "extract" | "classify";
      prompt?: string;
      system?: string;
    };
    if (!body.prompt?.trim()) return c.json({ error: "prompt is required" }, 400);
    if (!body.role) return c.json({ error: "role is required" }, 400);
    try {
      const result = await getModelRouter().complete({
        role: body.role,
        prompt: body.prompt,
        system: body.system,
      });
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "complete failed" }, 400);
    }
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

  // ——— Phase 5: computer observe / locate / shadow-open ———

  app.get("/v1/computer/snapshot", (c) => {
    return c.json(getComputerSnapshot());
  });

  app.get("/v1/computer/targets", (c) => {
    const runtime = new ComputerRuntime();
    return c.json({
      targets: runtime.listTargets(),
      note: "Read-only locate — does not launch applications",
    });
  });

  app.post("/v1/computer/shadow-open", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      target?: string;
      goal_id?: string;
    };
    if (!body.target?.trim()) {
      return c.json({ error: "target is required (e.g. vscode, browser, terminal)" }, 400);
    }
    const { engine } = getJarvisRuntime();
    const runtime = new ComputerRuntime(engine.evidence);
    try {
      const result = await runtime.runShadowOpen({
        target: body.target.trim(),
        goal_id: body.goal_id,
      });
      return c.json(result);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "shadow-open failed" }, 400);
    }
  });

  app.post("/v1/computer/live-open", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      target?: string;
      confirm?: string;
      goal_id?: string;
    };
    if (!body.target?.trim()) {
      return c.json({ error: "target is required (e.g. notepad, vscode, browser)" }, 400);
    }
    const { engine } = getJarvisRuntime();
    const runtime = new ComputerRuntime(engine.evidence);
    try {
      const confirmed = body.confirm?.trim() === "OPEN";
      let goal_id = body.goal_id?.trim();
      if (confirmed) {
        if (!goal_id) {
          goal_id = newId("goal");
          const now = new Date().toISOString();
          engine.store.saveGoal({
            id: goal_id,
            title: `Live open ${body.target.trim()}`,
            outcome: `Open allowlisted app ${body.target.trim()} on host`,
            domain: "ops",
            status: "done",
            priority: 1,
            trust_tier: "APPROVED",
            autonomy_ceiling: 2,
            mode: "live",
            key_results: [],
            owner_principal_id: HUMAN_PRINCIPAL,
            created_at: now,
            updated_at: now,
          });
        }
      }

      const result = await runtime.runLiveOpen({
        target: body.target.trim(),
        confirm: body.confirm,
        goal_id,
      });

      if ("need_confirm" in result) {
        return c.json(
          {
            ...result,
            error: `Strong confirmation required — type ${result.confirm_token}`,
          },
          428,
        );
      }

      const live = result;
      const decision_id = newId("dec");
      const gid = goal_id!;
      const head = engine.evidence.head(gid);
      if (head) {
        engine.journal.append({
          id: decision_id,
          goal_id: gid,
          decision: live.action.ok ? "computer_live_open" : "computer_live_open_failed",
          why: live.message,
          alternatives: ["shadow_open", "do_not_act"],
          evidence_head: head,
          confidence: live.action.ok ? 0.9 : 0.4,
          outcome: live.action.ok ? "act" : "do_not_act",
        });
      }

      const esc = getEscalationStore().create({
        goal_id: gid,
        tool_id: "computer.open_app",
        verdict_id: newId("verdict"),
        verdict_class: "strong_confirmation",
        reason: `Live open ${live.target_id} after typing OPEN`,
        title: `Computer Live open: ${live.target_id}`,
      });
      getEscalationStore().resolve(esc.id, live.action.ok ? "approve" : "reject");

      return c.json({ ...live, goal_id: gid, escalation_id: esc.id, decision_id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "live-open failed";
      const status = /Kill switch/i.test(msg) ? 403 : 400;
      return c.json({ error: msg }, status);
    }
  });

  app.post("/v1/computer/act", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: string };
    const action = body.action ?? "unknown";
    try {
      new ComputerRuntime().assertActAllowed(action as "click");
      computerActBlocked(action);
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "act blocked", act_enabled: false }, 403);
    }
  });

  // ——— Phase 6: browser SHADOW research ———

  app.get("/v1/browser/snapshot", (c) => {
    return c.json(getBrowserSnapshot());
  });

  app.get("/v1/browser/allowlist", (c) => {
    const runtime = new BrowserRuntime();
    return c.json({
      allowlist: runtime.listAllowlist(),
      note: "SHADOW read-only GET — hosts only; click/type/publish blocked",
    });
  });

  app.post("/v1/browser/shadow-research", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      url?: string;
      goal_id?: string;
      simulate_only?: boolean;
    };
    if (!body.url?.trim()) {
      return c.json({ error: "url is required (allowlisted host, e.g. https://example.com)" }, 400);
    }
    const { engine } = getJarvisRuntime();
    const runtime = new BrowserRuntime(engine.evidence);
    try {
      const result = await runtime.runShadowResearch({
        url: body.url.trim(),
        goal_id: body.goal_id,
        simulate_only: body.simulate_only === true,
      });
      let memory = null;
      if (!result.simulated && result.facts.length > 0) {
        memory = ingestBrowserResearch({
          facts: result.facts,
          goal_id: body.goal_id,
          url: result.url,
        });
      }
      return c.json({ ...result, memory });
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : "shadow-research failed" }, 400);
    }
  });

  app.post("/v1/browser/act", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { action?: string };
    const action = body.action ?? "unknown";
    try {
      new BrowserRuntime().assertActAllowed(action as "click");
      browserActBlocked(action);
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

      const decision_id = newId("dec");
      engine.evidence.append({
        goal_id: row.goal_id,
        run_id: row.run_id,
        kind: "decision",
        principal_id: HUMAN_PRINCIPAL,
        payload_summary: `Escalation ${body.decision}: ${row.tool_id} — ${row.reason}`,
        correlation: { decision_id, policy_verdict_id: row.verdict_id },
      });
      const head = engine.evidence.head(row.goal_id);
      if (head) {
        engine.journal.append({
          id: decision_id,
          goal_id: row.goal_id,
          decision: body.decision === "approve" ? "escalation_approved" : "escalation_rejected",
          why: row.reason,
          alternatives: ["stay_pending", "promote_live"],
          evidence_head: head,
          confidence: 1,
          outcome: body.decision === "approve" ? "act" : "do_not_act",
        });
      }

      // Approve records intent only — Live OS dispatch remains Strong-confirm promoteToLive.
      return c.json({
        escalation: row,
        decision_id,
        note:
          body.decision === "approve"
            ? "Recorded approve in journal. Live OS startRun still requires Strong-confirm promote (type LIVE)."
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
