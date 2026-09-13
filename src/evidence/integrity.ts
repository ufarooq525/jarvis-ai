import type { AgentRun, EvidenceNode } from "../types/model.js";
import { SHADOW_SIMULATED_NOTICE } from "../goal-engine/verifier.js";

export interface IntegrityIssue {
  code: string;
  node_id?: string;
  detail: string;
}

export interface IntegrityReport {
  ok: boolean;
  issues: IntegrityIssue[];
}

/** Claims that a real side effect happened (must not appear on simulated nodes). */
const FABRICATED_CLAIM =
  /\b(successfully performed an? external action|sent (the )?email|sent (the )?message|published to (production|live)|live os write completed)\b/i;

/**
 * Validate chain linkage + anti-fabrication rules for a goal's evidence.
 */
export function validateEvidenceChain(nodes: EvidenceNode[]): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  if (nodes.length === 0) {
    return { ok: true, issues: [] };
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  let prev: string | undefined;

  for (const node of nodes) {
    if (node.prev_id) {
      if (!byId.has(node.prev_id) && node.prev_id !== prev) {
        // prev may be earlier in chain — must exist in set
        if (![...byId.keys()].includes(node.prev_id)) {
          issues.push({
            code: "broken_prev",
            node_id: node.id,
            detail: `prev_id ${node.prev_id} not found in chain`,
          });
        }
      }
    }

    if (node.simulated === true && FABRICATED_CLAIM.test(node.payload_summary)) {
      issues.push({
        code: "fabricated_claim",
        node_id: node.id,
        detail: "Simulated evidence claims a real external action",
      });
    }

    if (
      (node.kind === "tool_invocation" || node.kind === "simulation") &&
      node.simulated !== true &&
      !node.correlation?.os_run_id &&
      /SHADOW noop|no OS write|No external action/i.test(node.payload_summary)
    ) {
      issues.push({
        code: "missing_simulated_flag",
        node_id: node.id,
        detail: "Shadow/noop payload without simulated=true",
      });
    }

    prev = node.id;
  }

  // prev_id walk: each non-first node should point at some earlier node
  for (let i = 1; i < nodes.length; i++) {
    const n = nodes[i]!;
    if (!n.prev_id) {
      issues.push({
        code: "missing_prev",
        node_id: n.id,
        detail: "Non-root evidence node missing prev_id",
      });
      continue;
    }
    const earlier = nodes.slice(0, i).some((e) => e.id === n.prev_id);
    if (!earlier) {
      issues.push({
        code: "prev_out_of_order",
        node_id: n.id,
        detail: `prev_id ${n.prev_id} is not an earlier node`,
      });
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Runs that are shadow/simulated must not be labeled as live successes without os proof. */
export function validateRunHonesty(runs: AgentRun[]): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  for (const run of runs) {
    if (run.mode === "shadow" && run.status === "succeeded" && !run.os_run_id) {
      issues.push({
        code: "shadow_succeeded_without_os",
        node_id: run.id,
        detail: "Shadow run marked succeeded without os_run_id — prefer simulated",
      });
    }
    if (run.mode === "shadow" && run.status === "succeeded") {
      // Still allow succeeded if mapped from noop — but prefer simulated. Warn only when
      // status is succeeded AND tool path looks live — keep as soft issue.
      issues.push({
        code: "shadow_status_succeeded",
        node_id: run.id,
        detail: "Shadow run used status=succeeded; prefer simulated for honesty",
      });
    }
  }
  return { ok: issues.filter((i) => i.code !== "shadow_status_succeeded").length === 0, issues };
}

/** Attribution helpers for audit/replay views. */
export function describeEvidenceNode(node: EvidenceNode): Record<string, string> {
  return {
    what_happened: node.payload_summary,
    kind: node.kind,
    goal_id: node.goal_id,
    decision_id: node.correlation?.decision_id ?? "",
    run_id: node.run_id ?? "",
    task_id: node.task_id ?? node.correlation?.jarvis_task_id ?? "",
    action_id: node.action_id ?? "",
    tool: node.correlation?.tool_id ?? "",
    authorized_by: node.principal_id,
    simulated: node.simulated ? SHADOW_SIMULATED_NOTICE : "not marked simulated",
    side_effects: node.simulated
      ? "none (simulated)"
      : node.correlation?.os_run_id
        ? `os_run_id=${node.correlation.os_run_id}`
        : "unknown / none recorded",
  };
}
