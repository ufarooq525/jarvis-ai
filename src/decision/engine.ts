import type { Task } from "../types/model.js";
import type { OperatorContext, OperatorDecision } from "./types.js";

function taskForTool(tasks: Task[], tool_id: string): Task | undefined {
  return tasks.find((t) => t.tool_ids.includes(tool_id));
}

function attempted(ctx: OperatorContext, capability_id: string): boolean {
  const task = taskForTool(ctx.tasks, capability_id);
  if (task) {
    return task.status === "done" || task.status === "cancelled" || task.status === "failed";
  }
  return (
    ctx.attempted_capability_ids.includes(capability_id) ||
    ctx.runs.some((r) => r.tool_invocations.includes(capability_id))
  );
}

function taskOpen(task: Task | undefined): boolean {
  if (!task) return false;
  return task.status === "ready" || task.status === "pending" || task.status === "running";
}

function outcomeKrsMet(ctx: OperatorContext): boolean {
  const krs = ctx.goal.key_results.filter((k) => k.metric_ref !== "evidence.chain.length");
  if (krs.length === 0) return true;
  return krs.every((kr) => {
    const current = typeof kr.current === "number" ? kr.current : Number(kr.current ?? 0);
    const target = typeof kr.target === "number" ? kr.target : Number(kr.target);
    return Number.isFinite(current) && Number.isFinite(target) && current >= target;
  });
}

function researchUrl(ctx: OperatorContext): string {
  const stack = ctx.normalized.constraints.find((c) => c.startsWith("stack:"));
  if (stack?.toLowerCase().includes("laravel")) {
    return "https://en.wikipedia.org/wiki/Laravel";
  }
  return "https://example.com/";
}

/**
 * Thin Decision Engine — deterministic next-action choice.
 * Not a second planner and not research-hardcoded as architecture:
 * plan_kind only selects which existing capabilities to try first.
 */
export class DecisionEngine {
  decideNext(ctx: OperatorContext): OperatorDecision {
    const inspect = taskForTool(ctx.tasks, "os.runtime.get_state");
    if (inspect && taskOpen(inspect) && !attempted(ctx, "os.runtime.get_state")) {
      return {
        decision: "execute",
        reason: "Inspect current OS/workforce state before acting",
        selected_capability: "os.runtime.get_state",
        selected_action: "get_state",
        expected_result: "OsStateSnapshot without duplicate dispatch",
        risk: "low",
        authorization_requirement: "none",
        next_verification_condition: "observation of OS state recorded",
        task_id: inspect.id,
      };
    }

    if (ctx.normalized.plan_kind === "research") {
      return this.decideResearch(ctx);
    }

    const start = taskForTool(ctx.tasks, "os.runtime.start_run");
    if (start && taskOpen(start) && !attempted(ctx, "os.runtime.start_run")) {
      return {
        decision: "execute",
        reason: "Advance outcome via OS runtime (Shadow noop / Live plan)",
        selected_capability: "os.runtime.start_run",
        selected_action: "start_run",
        expected_result: "OS run record (noop in Shadow)",
        risk: "high",
        authorization_requirement: ctx.goal.mode === "live" ? "approval" : "none",
        next_verification_condition: "shadow run simulated or live os_run_id present",
        task_id: start.id,
      };
    }

    const failed = ctx.tasks.filter((t) => t.status === "failed");
    if (failed.length > 0) {
      return {
        decision: "block",
        reason: `Task failure remains: ${failed.map((t) => t.title).join("; ")}`,
        next_verification_condition: "replan after failures recovered",
      };
    }

    if (outcomeKrsMet(ctx)) {
      return {
        decision: "complete",
        reason: "Lifecycle work finished and outcome key results met (or none beyond evidence)",
        expected_result: "goal done",
        next_verification_condition: "verifyShadowLoop + outcome KRs",
      };
    }

    return {
      decision: "block",
      reason: "Work finished but outcome key results unmet",
      next_verification_condition: "outcome KR current >= target",
    };
  }

  private decideResearch(ctx: OperatorContext): OperatorDecision {
    const researchTask = taskForTool(ctx.tasks, "browser.research");
    if (researchTask && taskOpen(researchTask) && !attempted(ctx, "browser.research")) {
      const url = researchUrl(ctx);
      return {
        decision: "execute",
        reason: "Research outcome requires observing sources, not an OS noop",
        selected_capability: "browser.research",
        selected_action: "research",
        expected_result: `Allowlisted observations from ${url}`,
        risk: "medium",
        authorization_requirement: "none",
        next_verification_condition: "observation recorded; visit claimed only if fetched",
        task_id: researchTask.id,
        input: { url },
      };
    }

    if (attempted(ctx, "browser.research") && !attempted(ctx, "wm.facts.upsert")) {
      return {
        decision: "execute",
        reason: "Store observations in memory (not conclusions)",
        selected_capability: "wm.facts.upsert",
        selected_action: "store",
        expected_result: "Durable facts linked to this goal",
        risk: "medium",
        authorization_requirement: "none",
        next_verification_condition: "facts retrievable by goal_id",
      };
    }

    if (
      ctx.facts.some((f) => f.kind === "observation") &&
      !attempted(ctx, "ops.opportunity.create")
    ) {
      return {
        decision: "execute",
        reason: "Attempt to qualify opportunities only from candidate observations",
        selected_capability: "ops.opportunity.create",
        selected_action: "create",
        expected_result: "Zero or more opportunities — never fabricated",
        risk: "low",
        authorization_requirement: "none",
        next_verification_condition: "research.opportunity_count reflects store",
      };
    }

    if (outcomeKrsMet(ctx)) {
      return {
        decision: "complete",
        reason: `Research key results met (${ctx.opportunity_count})`,
        expected_result: "goal done",
        next_verification_condition: "opportunity_count >= target",
      };
    }

    const target =
      ctx.goal.key_results.find((k) => k.metric_ref === "research.opportunity_count")?.target ??
      ctx.normalized.target_count ??
      "?";
    return {
      decision: "block",
      reason: `Research attempted; opportunity_count=${ctx.opportunity_count} < target=${target}. Allowlisted observation did not yield qualifying opportunities — genuinely blocked, not simulated success.`,
      expected_result: "goal blocked",
      next_verification_condition: "do not mark done while outcome KR unmet",
    };
  }
}
