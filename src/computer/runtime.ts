import type { EvidenceChain } from "../evidence/chain.js";
import { isKillSwitchEngaged } from "../kill-switch.js";
import { JARVIS_PRINCIPAL } from "../trust/principals.js";
import { newId, nowIso } from "../util/ids.js";
import { type AppLauncher, launchAllowlisted } from "./launch.js";
import { getComputerSnapshot } from "./observe.js";
import { locateTarget, listTargets, resolveTargetId, getAppTarget } from "./targets.js";
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
import { verifyLiveOpen, verifyLiveType, verifyShadowOpen, verifyShadowType } from "./verify.js";
import { listVisibleHwnds, typeIntoWindowByPid, type TypeIntoWindow } from "./type-into.js";

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
  /** Injectable for tests — defaults to Windows UIA/SendKeys targeted at a pid. */
  typeIntoWindow?: TypeIntoWindow;
  /** Injectable for tests — skip real hwnd probing when the typer is mocked. */
  listHwnds?: (processNames: string[]) => number[];
}

/**
 * ComputerRuntime — capability layer separate from Goal Engine.
 * Shadow open/type is noop; Live open/type requires strong-confirm token OPEN.
 * Click / generic type / focus / scroll remain blocked.
 */
export class ComputerRuntime {
  private readonly evidence?: EvidenceChain;
  private readonly launcher: AppLauncher;
  private readonly typeIntoWindow: TypeIntoWindow;
  private readonly listHwnds: (processNames: string[]) => number[];
  /** Last Live launch per goal — type_text must use this pid, never a guessed foreground window. */
  private readonly launches = new Map<
    string,
    {
      pid: number;
      target_id: ComputerTargetId;
      launched_at: string;
      process_names?: string[];
      hwnds_before?: number[];
    }
  >();
  private readonly lastByGoal = new Map<
    string,
    { open?: ComputerActionRecord; type?: ComputerActionRecord }
  >();
  /** Test spy: real sender is never invoked from Shadow. */
  typeIntoCalls = 0;

  constructor(evidenceOrOpts?: EvidenceChain | ComputerRuntimeOptions) {
    if (evidenceOrOpts && "append" in evidenceOrOpts) {
      this.evidence = evidenceOrOpts;
      this.launcher = launchAllowlisted;
      this.typeIntoWindow = typeIntoWindowByPid;
      this.listHwnds = listVisibleHwnds;
    } else {
      this.evidence = evidenceOrOpts?.evidence;
      this.launcher = evidenceOrOpts?.launcher ?? launchAllowlisted;
      this.typeIntoWindow = evidenceOrOpts?.typeIntoWindow ?? typeIntoWindowByPid;
      this.listHwnds =
        evidenceOrOpts?.listHwnds ??
        (evidenceOrOpts?.typeIntoWindow || evidenceOrOpts?.launcher ? () => [] : listVisibleHwnds);
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

    this.rememberAction(input.goal_id, "open", action);

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

    const spec = getAppTarget(target_id);
    const hwnds_before = spec?.process_names?.length ? this.listHwnds(spec.process_names) : [];
    const launch = this.launcher(locate.resolved_command, spec?.launch_args ?? []);
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

    action.pid = launch.ok ? launch.pid : undefined;
    action.verification = verifyLiveOpen({
      before,
      after,
      locate,
      action,
      launch_ok: launch.ok,
      pid: launch.ok ? launch.pid : undefined,
    });
    action.ok = Boolean(action.verification?.passed);

    if (launch.ok && input.goal_id) {
      this.launches.set(input.goal_id, {
        pid: launch.pid,
        target_id,
        launched_at: started_at,
        process_names: spec?.process_names,
        hwnds_before,
      });
    }
    this.rememberAction(input.goal_id, "open", action);

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

  /**
   * Shadow keyboard input into an already-opened allowlisted target.
   * Does not send real keystrokes. Generic click/type/focus stay blocked.
   */
  async runShadowType(input: {
    target: string;
    text: string;
    goal_id?: string;
    prior_open: boolean;
  }): Promise<ComputerShadowLoopResult> {
    const target_id = resolveTargetId(input.target);
    if (!target_id) {
      throw new Error(`Unknown computer target: ${input.target}`);
    }
    const text = input.text ?? "";
    const before = this.observe("before");
    const locate = locateTarget(target_id);
    const started_at = nowIso();
    const action_id = newId("cact");
    const after = this.observe("after");
    after.locate = locate;

    const action: ComputerActionRecord = {
      id: action_id,
      action: "type_text",
      target_id,
      mode: "shadow",
      simulated: true,
      simulated_notice: COMPUTER_SIMULATED_NOTICE,
      started_at,
      finished_at: nowIso(),
      ok: false,
      summary: `SHADOW would type ${text.trim().length} chars into ${target_id} — ${COMPUTER_SIMULATED_NOTICE}`,
      before,
      after,
      intended_text: text,
      keystrokes_sent: false,
    };
    action.verification = verifyShadowType({
      locate,
      action,
      text,
      prior_open: input.prior_open,
    });
    action.ok = Boolean(action.verification?.passed);
    if (!action.ok) {
      action.summary = `SHADOW type blocked — ${action.verification?.summary}`;
    }

    this.rememberAction(input.goal_id, "type", action);

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
   * Gated Live type: keystrokes only into the PID/HWND from the preceding Live open on this goal.
   * Refuses global/active-window typing when the window cannot be identified.
   */
  async runLiveType(input: {
    target: string;
    text: string;
    confirm?: string;
    goal_id?: string;
    prior_open: boolean;
  }): Promise<ComputerLiveOpenResult | ComputerLiveOpenNeedConfirm> {
    if (isKillSwitchEngaged()) {
      throw new Error("Kill switch engaged — Live computer type blocked");
    }

    const target_id = resolveTargetId(input.target);
    if (!target_id) {
      throw new Error(`Unknown computer target: ${input.target}`);
    }

    const locate = locateTarget(target_id);
    if (input.confirm?.trim() !== COMPUTER_LIVE_OPEN_CONFIRM) {
      return {
        need_confirm: true,
        confirm_token: COMPUTER_LIVE_OPEN_CONFIRM,
        target_id,
        locate,
        message: `Type ${COMPUTER_LIVE_OPEN_CONFIRM} to type into the identified ${target_id} window from the preceding open`,
      };
    }

    const text = input.text ?? "";
    const before = this.observe("before");
    const started_at = nowIso();
    const action_id = newId("cact");
    const launch = input.goal_id ? this.launches.get(input.goal_id) : undefined;
    const pid = launch?.target_id === target_id ? launch.pid : undefined;

    let typed: ReturnType<TypeIntoWindow> | undefined;
    if (pid && input.prior_open) {
      this.typeIntoCalls += 1;
      typed = this.typeIntoWindow(pid, text, {
        launched_at: launch?.launched_at,
        process_names: launch?.process_names,
        exclude_hwnds: launch?.hwnds_before,
      });
    }

    const after = this.observe("after");
    after.locate = locate;

    const action: ComputerActionRecord = {
      id: action_id,
      action: "type_text",
      target_id,
      mode: "live",
      simulated: false,
      simulated_notice: COMPUTER_LIVE_OPEN_NOTICE,
      started_at,
      finished_at: nowIso(),
      ok: false,
      summary: "",
      before,
      after,
      pid,
      hwnd: typed?.hwnd,
      intended_text: text,
      readback: typed?.readback,
      text_readback_feasible: typed?.text_readback_feasible,
      keystrokes_sent: Boolean(typed?.keystrokes_sent),
    };

    action.verification = verifyLiveType({
      action,
      text,
      pid,
      process_running: Boolean(typed?.process_running),
      hwnd: typed?.hwnd,
      keystrokes_sent: Boolean(typed?.keystrokes_sent),
      text_readback_feasible: Boolean(typed?.text_readback_feasible),
      readback: typed?.readback,
    });
    action.ok = Boolean(action.verification?.passed);
    action.summary = action.ok
      ? `LIVE typed ${text.trim().length} chars into ${target_id} (pid ${pid}, hwnd ${typed?.hwnd}) — ${COMPUTER_LIVE_OPEN_NOTICE}`
      : `LIVE type blocked — ${action.verification?.summary}${typed?.error ? `; ${typed.error}` : ""}`;

    this.rememberAction(input.goal_id, "type", action);

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
      pid,
    };
  }

  getLaunch(goal_id: string): {
    pid: number;
    target_id: ComputerTargetId;
    launched_at: string;
    process_names?: string[];
    hwnds_before?: number[];
  } | undefined {
    return this.launches.get(goal_id);
  }

  lastComputerActions(goal_id: string): {
    open?: ComputerActionRecord;
    type?: ComputerActionRecord;
  } {
    return this.lastByGoal.get(goal_id) ?? {};
  }

  /** Irreversible / coordinate acts stay hard-blocked. type_text is gated Live, not this list. */
  assertActAllowed(action: ComputerActionKind): void {
    const blocked: ComputerActionKind[] = ["click", "type", "scroll", "focus_window"];
    if (blocked.includes(action)) {
      throw new Error(
        `Computer act '${action}' blocked — requires sandbox + Approve + Live trust; use gated live-open/type for apps only`,
      );
    }
  }

  private rememberAction(
    goal_id: string | undefined,
    kind: "open" | "type",
    action: ComputerActionRecord,
  ): void {
    if (!goal_id) return;
    const prev = this.lastByGoal.get(goal_id) ?? {};
    this.lastByGoal.set(goal_id, { ...prev, [kind]: action });
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
