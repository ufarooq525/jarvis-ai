#!/usr/bin/env node
/**
 * Thin text CLI for Goal Engine Shadow Loop (§16).
 * Always uses MockOsRuntimeAdapter — never talks to Umer AI OS.
 */
import { GoalEngine } from "./goal-engine/engine.js";
import { MockOsRuntimeAdapter } from "./adapters/mock/mock-os-runtime-adapter.js";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const outcome =
    args.join(" ").trim() ||
    "Ship a documented plan for weekly company overview without duplicate work";
  const title = outcome.length > 60 ? `${outcome.slice(0, 57)}...` : outcome;

  const adapter = new MockOsRuntimeAdapter();
  const engine = new GoalEngine(adapter);

  console.log("JARVIS Goal Engine — Shadow Loop");
  console.log(`Adapter: ${adapter.name} (exclusive; no Umer OS calls)`);
  console.log(`Outcome: ${outcome}`);
  console.log("---");

  const result = await engine.runShadowLoop({ title, outcome });
  console.log(result.message);
  console.log(`Notice: ${result.simulated_notice}`);
  console.log(`Decision: ${result.decision_outcome} (${result.decision_id})`);
  console.log(
    `Goal: ${result.goal.id} [${result.goal.trust_tier}/${result.goal.mode}] domain=${result.goal.domain} status=${result.goal.status}`,
  );
  console.log(
    `Normalized: plan_kind=${result.normalized.plan_kind} constraints=${result.normalized.constraints.join(", ") || "-"}`,
  );
  console.log(
    `Verification: ${result.verification.passed ? "passed" : "failed"} — ${result.verification.summary}`,
  );
  console.log(`Runs: ${result.runs.length}`);
  for (const run of result.runs) {
    console.log(
      `  - ${run.id} status=${run.status} os=${run.os_run_id ?? "-"} tools=${run.tool_invocations.join(",")}`,
    );
  }
  console.log("--- Evidence chain JSON ---");
  console.log(result.evidence_json);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
