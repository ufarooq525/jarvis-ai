#!/usr/bin/env node
/**
 * JARVIS full Live verification — real paths, not Shadow/demo.
 *
 * Prerequisites: pnpm dev:api, Umer Control API, JARVIS_OS_PROJECT_ID
 *
 *   pnpm verify:live              # real OS promote + Live computer open
 *   set VERIFY_LIVE_DRY=1         # gates only (no OS write / no app launch)
 *   set VERIFY_LIVE_SKIP_COMPUTER=1
 *   set VERIFY_LIVE_SKIP_OS=1
 */
const JARVIS = (process.env.JARVIS_API_BASE ?? "http://127.0.0.1:3020").replace(/\/$/, "");
const CONTROL = (process.env.CONTROL_API_BASE ?? "http://127.0.0.1:4000").replace(/\/$/, "");
const PROJECT = process.env.JARVIS_OS_PROJECT_ID?.trim() || "";
const DRY = process.env.VERIFY_LIVE_DRY === "1" || process.argv.includes("--dry");
const SKIP_OS = DRY || process.env.VERIFY_LIVE_SKIP_OS === "1";
const SKIP_COMPUTER = DRY || process.env.VERIFY_LIVE_SKIP_COMPUTER === "1";

async function getJson(url) {
  try {
    const res = await fetch(url);
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

async function postJson(url, payload) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let body = text;
    try {
      body = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

function fail(msg) {
  console.error(`\nFAIL: ${msg}`);
  console.error("See docs/LIVE_VERIFICATION.md\n");
  process.exit(1);
}

function info(msg) {
  console.log(`  ✓ ${msg}`);
}

function detail(body) {
  return typeof body === "string" ? body : JSON.stringify(body);
}

async function main() {
  console.log("JARVIS Live verification (real paths)");
  console.log(`  JARVIS_API_BASE=${JARVIS}`);
  console.log(`  CONTROL_API_BASE=${CONTROL}`);
  console.log(`  JARVIS_OS_PROJECT_ID=${PROJECT || "(auto-detect)"}`);
  console.log(`  mode=${DRY ? "DRY (gates only)" : "LIVE"}`);
  console.log(`  skip_os=${SKIP_OS}  skip_computer=${SKIP_COMPUTER}`);
  console.log("---");

  // ——— Health / connection ———
  const health = await getJson(`${JARVIS}/health`);
  if (!health.ok) {
    fail(
      `JARVIS API unreachable at ${JARVIS} (${health.status || "network"}: ${detail(health.body)}). Start: pnpm dev:api`,
    );
  }
  info(`JARVIS /health ok (phase=${health.body.phase ?? "?"})`);

  const controlProbe = await getJson(`${CONTROL}/health`);
  const controlAlt = controlProbe.ok ? controlProbe : await getJson(`${CONTROL}/v1/dashboard`);
  if (!controlAlt.ok) {
    fail(`Control API unreachable at ${CONTROL}. Detail: ${detail(controlAlt.body)}`);
  }
  info("Control API reachable");

  let projectId = PROJECT;
  if (!projectId) {
    const projects = await getJson(`${JARVIS}/v1/os/projects`);
    if (projects.ok && typeof projects.body === "object") {
      const selected = projects.body.selected_project_id;
      const work = projects.body.work_projects || [];
      if (typeof selected === "string" && selected.trim()) {
        projectId = selected.trim();
        info(`Using selected_project_id=${projectId}`);
      } else if (work[0]?.project_id) {
        projectId = String(work[0].project_id);
        info(`Using first work_projects id=${projectId}`);
      }
    }
  }
  if (!projectId) {
    fail(
      "project_id missing. Set JARVIS_OS_PROJECT_ID or save a work-graph project in Settings → Connection.",
    );
  }

  const switched = await postJson(`${JARVIS}/v1/adapter`, {
    adapter: "umer-read",
    control_api_base: CONTROL,
    project_id: projectId,
  });
  if (!switched.ok) {
    fail(`Could not switch adapter to umer-read: ${detail(switched.body)}`);
  }
  if (switched.body.adapter !== "umer-read") {
    fail(`Expected adapter umer-read, got ${String(switched.body.adapter)}`);
  }
  info(`Adapter umer-read + project_id=${projectId}`);

  // ——— Trust / tools (Live catalog, not demo) ———
  const trust = await getJson(`${JARVIS}/v1/trust/status`);
  if (!trust.ok) fail(`trust/status failed: ${detail(trust.body)}`);
  if (trust.body.kill_switch?.engaged) {
    fail("Kill switch is engaged — clear it before Live verification");
  }
  info("Kill switch clear");

  const tools = await getJson(`${JARVIS}/v1/tools`);
  if (!tools.ok) fail(`tools list failed: ${detail(tools.body)}`);
  const toolIds = (tools.body.tools || []).map((t) => t.tool_id);
  for (const id of [
    "os.runtime.start_run",
    "computer.open_app",
    "computer.locate",
    "computer.observe.snapshot",
  ]) {
    if (!toolIds.includes(id)) fail(`Missing tool manifest: ${id}`);
  }
  info("Live tool manifests present");

  const osSnap = await getJson(`${JARVIS}/v1/os/snapshot`);
  if (!osSnap.ok) fail(`os/snapshot failed: ${detail(osSnap.body)}`);
  info("OS snapshot reachable via adapter");

  // ——— Goal intake → Live promote (not demo escalation) ———
  // Intake still creates a structured goal; Live is the promote path under test.
  const intake = await postJson(`${JARVIS}/v1/goals/shadow-loop`, {
    outcome: `Live verify ${new Date().toISOString()} — research ops smoke`,
    domain: "ops",
  });
  if (!intake.ok) fail(`Goal intake failed: ${detail(intake.body)}`);
  const goalId = String(intake.body.goal?.id ?? "");
  if (!goalId) fail("Intake returned no goal id");
  info(`Goal ready ${goalId}`);

  const noConfirm = await postJson(`${JARVIS}/v1/goals/${goalId}/promote-live`, {
    confirm: "nope",
  });
  if (noConfirm.ok) fail("Promote without LIVE succeeded — Strong-confirm bypass");
  info("Promote without LIVE correctly rejected");

  if (!SKIP_OS) {
    const promote = await postJson(`${JARVIS}/v1/goals/${goalId}/promote-live`, {
      confirm: "LIVE",
      project_id: projectId,
    });
    if (!promote.ok) fail(`Live promote failed: ${detail(promote.body)}`);
    const osRunId = promote.body.os_run_id ?? promote.body.run?.os_run_id;
    if (!osRunId) fail(`Live promote returned no os_run_id: ${detail(promote.body)}`);
    info(`Live promote os_run_id=${osRunId}`);

    const status = await getJson(`${JARVIS}/v1/goals/${goalId}/live-status`);
    if (!status.ok) fail(`live-status failed: ${detail(status.body)}`);
    info("live-status reachable after promote");

    const evidence = await getJson(`${JARVIS}/v1/goals/${goalId}/evidence`);
    if (!evidence.ok) fail(`evidence failed: ${detail(evidence.body)}`);
    const nodes = evidence.body.evidence || [];
    if (!nodes.length) fail("Expected evidence nodes after Live promote");
    info(`Evidence chain length=${nodes.length}`);
  } else {
    info("OS Live promote skipped (DRY / VERIFY_LIVE_SKIP_OS)");
  }

  // ——— Computer Live open (not shadow-open) ———
  const targets = await getJson(`${JARVIS}/v1/computer/targets`);
  if (!targets.ok) fail(`computer/targets failed: ${detail(targets.body)}`);
  const notepad = (targets.body.targets || []).find((t) => t.id === "notepad");
  if (!notepad?.locate?.found) fail("notepad target not located on host");
  info(`Computer locate notepad → ${notepad.locate.resolved_command}`);

  const needOpen = await postJson(`${JARVIS}/v1/computer/live-open`, {
    target: "notepad",
  });
  if (needOpen.status !== 428 || !needOpen.body.need_confirm) {
    fail(`Expected 428 need_confirm for live-open without OPEN, got ${needOpen.status}`);
  }
  info("Computer live-open without OPEN correctly gated");

  const act = await postJson(`${JARVIS}/v1/computer/act`, { action: "click" });
  if (act.status !== 403) fail(`Expected act click 403, got ${act.status}`);
  info("Computer act click still blocked");

  if (!SKIP_COMPUTER) {
    const liveOpen = await postJson(`${JARVIS}/v1/computer/live-open`, {
      target: "notepad",
      confirm: "OPEN",
    });
    if (!liveOpen.ok) fail(`Computer Live open failed: ${detail(liveOpen.body)}`);
    if (liveOpen.body.simulated === true) {
      fail("Computer Live open returned simulated=true — expected real launch");
    }
    if (!String(liveOpen.body.message || "").includes("LIVE")) {
      fail(`Expected LIVE notice in message: ${detail(liveOpen.body)}`);
    }
    if (!liveOpen.body.action?.ok) {
      fail(`Computer Live open verification failed: ${detail(liveOpen.body)}`);
    }
    info(`Computer Live open ok pid=${liveOpen.body.pid ?? "?"} (${liveOpen.body.live_notice})`);
  } else {
    info("Computer Live open skipped (DRY / VERIFY_LIVE_SKIP_COMPUTER)");
  }

  // ——— Kill switch blocks Live computer open ———
  const engage = await postJson(`${JARVIS}/v1/trust/kill-switch`, {
    action: "engage",
    reason: "verify-live",
  });
  if (!engage.ok) fail(`Could not engage kill switch: ${detail(engage.body)}`);

  const blocked = await postJson(`${JARVIS}/v1/computer/live-open`, {
    target: "notepad",
    confirm: "OPEN",
  });
  if (blocked.status !== 403) {
    fail(`Expected kill switch to block live-open (403), got ${blocked.status}`);
  }
  info("Kill switch blocks Live computer open");

  const clear = await postJson(`${JARVIS}/v1/trust/kill-switch`, { action: "clear" });
  if (!clear.ok) fail(`Could not clear kill switch: ${detail(clear.body)}`);
  info("Kill switch cleared");

  // ——— Browser SHADOW research (allowlisted GET — not demo) ———
  const browserSnap = await getJson(`${JARVIS}/v1/browser/snapshot`);
  if (!browserSnap.ok) fail(`browser/snapshot failed: ${detail(browserSnap.body)}`);
  info("Browser plane reachable");

  const research = await postJson(`${JARVIS}/v1/browser/shadow-research`, {
    url: "https://example.com/",
  });
  if (!research.ok) fail(`browser shadow-research failed: ${detail(research.body)}`);
  if (research.body.action?.fetch?.visited !== true) {
    fail(`Expected visited example.com: ${detail(research.body)}`);
  }
  if (!Array.isArray(research.body.facts) || research.body.facts.length < 1) {
    fail(`Expected extracted facts: ${detail(research.body)}`);
  }
  info(
    `Browser research visited example.com — ${research.body.facts.length} claims (${research.body.notice})`,
  );
  if (!research.body.memory?.stored?.length) {
    fail("Browser research did not ingest WM memory facts");
  }
  info(`WM memory ingested ${research.body.memory.stored.length} facts`);

  const wmFacts = await getJson(`${JARVIS}/v1/wm/facts`);
  if (!wmFacts.ok || !(wmFacts.body.facts || []).length) {
    fail(`Expected durable WM facts: ${detail(wmFacts.body)}`);
  }
  info(`WM facts list count=${wmFacts.body.facts.length}`);

  // ——— Phase 8 skills (SHADOW library) ———
  const skillIngest = await postJson(`${JARVIS}/v1/skills/ingest`, {
    title: "Live-verify research skim",
    text: "1. Fetch allowlisted page\n2. Extract observation\n3. Store in WM\nNever invent visits",
  });
  if (!skillIngest.ok) fail(`skills ingest failed: ${detail(skillIngest.body)}`);
  const skillId = skillIngest.body.skill?.id;
  if (!skillId) fail("No skill id from ingest");
  info(`Skill candidate ${skillId}`);

  const skillPractice = await postJson(`${JARVIS}/v1/skills/${skillId}/practice`, {});
  if (!skillPractice.ok || !skillPractice.body.skill?.practice?.ok) {
    fail(`skills practice failed: ${detail(skillPractice.body)}`);
  }
  info("Skill practice passed (simulated)");

  const skillVerify = await postJson(`${JARVIS}/v1/skills/${skillId}/verify`, {});
  if (!skillVerify.ok || skillVerify.body.skill?.status !== "verified") {
    fail(`skills verify failed: ${detail(skillVerify.body)}`);
  }
  info("Skill verified (still SHADOW)");

  const skillExec = await postJson(`${JARVIS}/v1/skills/${skillId}/execute`, {});
  if (skillExec.status !== 403) {
    fail(`Expected skill execute 403, got ${skillExec.status}`);
  }
  info("Skill execute correctly blocked");

  // ——— Phase 9 ops ———
  const opp = await postJson(`${JARVIS}/v1/ops/opportunities`, {
    title: "Live-verify Laravel lead",
    company: "TestCo",
    channel: "upwork",
    summary: "Laravel SaaS urgent rebuild",
  });
  if (!opp.ok) fail(`ops create failed: ${detail(opp.body)}`);
  const oppId = opp.body.opportunity?.id;
  const oppDraft = await postJson(`${JARVIS}/v1/ops/opportunities/${oppId}/draft`, {});
  if (!oppDraft.ok || !oppDraft.body.opportunity?.draft?.simulated) {
    fail(`ops draft failed: ${detail(oppDraft.body)}`);
  }
  info("Ops draft created (SHADOW)");
  const oppSend = await postJson(`${JARVIS}/v1/ops/opportunities/${oppId}/send`, {});
  if (oppSend.status !== 403) fail(`Expected ops send 403, got ${oppSend.status}`);
  info("Ops send correctly blocked");

  // ——— Phase 10 models ———
  const modelComplete = await postJson(`${JARVIS}/v1/models/complete`, {
    role: "classify",
    prompt: "Classify: Laravel freelance lead",
  });
  if (!modelComplete.ok || !modelComplete.body.ok) {
    fail(`model complete failed: ${detail(modelComplete.body)}`);
  }
  info(
    `Model complete via ${modelComplete.body.provenance?.provider}/${modelComplete.body.provenance?.model}`,
  );

  const browserAct = await postJson(`${JARVIS}/v1/browser/act`, { action: "click" });
  if (browserAct.status !== 403) {
    fail(`Expected browser act 403, got ${browserAct.status}`);
  }
  info("Browser act click still blocked");

  // ——— Explicitly skip demo endpoints ———
  info("Skipped /v1/escalations/demo (not part of Live suite)");

  console.log("---");
  if (DRY) {
    console.log("PASS (DRY): Live gates ok. Re-run without VERIFY_LIVE_DRY=1 for real actions.");
  } else {
    console.log("PASS: Live verification completed (OS + computer + browser research).");
  }
  console.log("Docs: docs/LIVE_VERIFICATION.md");
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
