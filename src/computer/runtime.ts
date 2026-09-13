import type { EvidenceChain } from "../evidence/chain.js";
import { isKillSwitchEngaged } from "../kill-switch.js";
import { JARVIS_PRINCIPAL } from "../trust/principals.js";
import { newId, nowIso } from "../util/ids.js";
import { type AppLauncher, launchAllowlisted } from "./launch.js";
import { getComputerSnapshot } from "./observe.js";
import { locateTarget, listTargets, resolveTargetId } from "./targets.js";
import type {
  ComputerActionKind,
  ComputerActionRecord,
  ComputerObservation,
  ComputerTargetId,
} from "./types.js";
import {
  COMPUTER_LIVE_OPEN_CONFIRM,
  COMPUTER_LIVE_OPEN_NOTICE,
  COMPUTER_SIMULATED_NOTICE,
} from "./types.js";
import { verifyLiveOpen, verifyShadowOpen } from "./verify.js";

export interface ComputerShadowLoopResult {
  target_id: ComputerTargetId;
  locate: ReturnType<typeof locateTarget>;
  action: ComputerActionRecord;
  message: string;
  simulated: true;
  simulated_notice: typeof COMPUTER_SIMULATED_NOTICE;
}

export interface ComputerLiveOpenResult {
  target_id: ComputerTargetId;
  locate: ReturnType<typeof locateTarget>;
  action: ComputerActionRecord;
  message: string;
  simulated: false;
  live_notice: typeof COMPUTER_LIVE_OPEN_NOTICE;
  pid?: number;
  confirm_required?: never;
}

export interface ComputerLiveOpenNeedConfirm {
  need_confirm: true;
  confirm_token: typeof COMPUTER_LIVE_OPEN_CONFIRM;
  target_id: ComputerTargetId;
  locate: ReturnType<typeof locateTarget>;
  message: string;
}

export interface ComputerRuntimeOptions {
  evidence?: EvidenceChain;
  /** Injectable for tests — defaults to real allowlisted spawn. */
  launcher?: AppLauncher;
}

/**
 * ComputerRuntime — capability layer separate from Goal Engine.
 * Shadow open is noop; Live open requires strong-confirm token OPEN.
 * Click/type/focus/scroll remain blocked.
 */
export class ComputerRuntime {
  private readonly evidence?: EvidenceChain;
  private readonly launcher: AppLauncher;

  constructor(evidenceOrOpts?: EvidenceChain | ComputerRuntimeOptions) {
    if (evidenceOrOpts && "append" in evidenceOrOpts) {
      this.evidence = evidenceOrOpts;
      this.launcher = launchAllowlisted;
    } else {
      this.evidence = evidenceOrOpts?.evidence;
      this.launcher = evidenceOrOpts?.launcher ?? launchAllowlisted;
    }
  }

  observe(kind: ComputerObservation["kind"] = "standalone"): ComputerObservation {
    const snap = getComputerSnapshot();
    return {
      at: snap.at,
      kind,
      snapshot_summary: `${snap.host.hostname} ${snap.host.platform}/${snap.host.arch}; mem ${snap.resources.freemem_mb}/${snap.resources.totalmem_mb}MB; plane=${snap.plane}`,
    };
  }

  listTargets() {
    return listTargets();
  }

  locate(target: string | ComputerTargetId) {
    const id = typeof target === "string" ? resolveTargetId(target) ?? (target as ComputerTargetId) : target;
    return locateTarget(id);
  }

  /**
   * Shadow open progression:
   * observe → locate → simulate open → observe → verify
   * Never launches the application.
   */
  async runShadowOpen(input: {
    target: string;
    goal_id?: string;
  }): Promise<ComputerShadowLoopResult> {
    const target_id = resolveTargetId(input.target);
    if (!target_id) {
      throw new Error(`Unknown computer target: ${input.target}`);
    }

    const before = this.observe("before");
    const locate = locateTarget(target_id);
    const started_at = nowIso();
    const action_id = newId("cact");

    // SHADOW: do not spawn/exec the app.
    const after = this.observe("after");
    after.locate = locate;

    const action: ComputerActionRecord = {
      id: action_id,
      action: "open_app",
      target_id,
      mode: "shadow",
      simulated: true,
      simulated_notice: COMPUTER_SIMULATED_NOTICE,
      started_at,
      finished_at: nowIso(),
      ok: locate.found,
      summary: locate.found
        ? `SHADOW would open ${target_id} via ${locate.resolved_command} — ${COMPUTER_SIMULATED_NOTICE}`
        : `SHADOW open aborted — target ${target_id} not located`,
      before,
      after,
    };

    action.verification = verifyShadowOpen({ before, after, locate, action });
    action.ok = Boolean(action.verification?.passed);

    if (input.goal_id && this.evidence) {
      this.appendEvidence(input.goal_id, action);
    }

    return {
      target_id,
      locate,
      action,
      message: action.summary,
      simulated: true,
      simulated_notice: COMPUTER_SIMULATED_NOTICE,
    };
  }

  /**
   * Gated Live open: observe → locate → spawn allowlisted → observe → verify.
   * Requires confirm === "OPEN". Kill switch blocks.
   */
  async runLiveOpen(input: {
    target: string;
    confirm?: string;
    goal_id?: string;
  }): Promise<ComputerLiveOpenResult | ComputerLiveOpenNeedConfirm> {
    if (isKillSwitchEngaged()) {
      throw new Error("Kill switch engaged — Live computer open blocked");
    }

    const target_id = resolveTargetId(input.target);
    if (!target_id) {
      throw new Error(`Unknown computer target: ${input.target}`);
    }

    const locate = locateTarget(target_id);
    if (!locate.found || !locate.resolved_command) {
      throw new Error(`Cannot Live-open ${target_id}: ${locate.detail}`);
    }

    if (input.confirm?.trim() !== COMPUTER_LIVE_OPEN_CONFIRM) {
      return {
        need_confirm: true,
        confirm_token: COMPUTER_LIVE_OPEN_CONFIRM,
        target_id,
        locate,
        message: `Type ${COMPUTER_LIVE_OPEN_CONFIRM} to launch ${target_id} via ${locate.resolved_command}`,
      };
    }

    const before = this.observe("before");
    const started_at = nowIso();
    const action_id = newId("cact");

    const launch = this.launcher(locate.resolved_command);
    const after = this.observe("after");
    after.locate = locate;

    const action: ComputerActionRecord = {
      id: action_id,
      action: "open_app",
      target_id,
      mode: "live",
      simulated: false,
      simulated_notice: COMPUTER_LIVE_OPEN_NOTICE,
      started_at,
      finished_at: nowIso(),
      ok: launch.ok,
      summary: launch.ok
        ? `LIVE opened ${target_id} via ${launch.command} (pid ${launch.pid}) — ${COMPUTER_LIVE_OPEN_NOTICE}`
        : `LIVE open failed for ${target_id}: ${launch.ok === false ? launch.error : "unknown"}`,
      before,
      after,
    };

    action.verification = verifyLiveOpen({
      before,
      after,
      locate,
      action,
      launch_ok: launch.ok,
      pid: launch.ok ? launch.pid : undefined,
    });
    action.ok = Boolean(action.verification?.passed);

    if (input.goal_id && this.evidence) {
      this.appendEvidence(input.goal_id, action);
    }

    return {
      target_id,
      locate,
      action,
      message: action.summary,
      simulated: false,
      live_notice: COMPUTER_LIVE_OPEN_NOTICE,
      pid: launch.ok ? launch.pid : undefined,
    };
  }

  /** Irreversible / input acts stay hard-blocked. */
  assertActAllowed(action: ComputerActionKind): void {
    const blocked: ComputerActionKind[] = ["click", "type", "scroll", "focus_window"];
    if (blocked.includes(action)) {
      throw new Error(
        `Computer act '${action}' blocked — requires sandbox + Approve + Live trust; use gated live-open for apps only`,
      );
    }
  }

  private appendEvidence(goal_id: string, action: ComputerActionRecord): void {
    if (!this.evidence) return;
    const simulated = action.simulated;
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "observation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `computer before: ${action.before?.snapshot_summary ?? "-"}`,
      simulated,
      correlation: { tool_id: `computer.${action.action}` },
    });
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "tool_invocation",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: action.summary,
      simulated,
      correlation: { tool_id: `computer.${action.action}` },
    });
    this.evidence.append({
      goal_id,
      action_id: action.id,
      kind: "expected_vs_actual",
      principal_id: JARVIS_PRINCIPAL,
      payload_summary: `computer verify: ${action.verification?.summary ?? "n/a"}`,
      simulated,
      correlation: { tool_id: `computer.${action.action}` },
    });
  }
}
