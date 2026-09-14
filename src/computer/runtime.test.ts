import { describe, expect, it } from "vitest";
import { EvidenceChain } from "../evidence/chain.js";
import { engageKillSwitch, clearKillSwitch } from "../kill-switch.js";
import { ComputerRuntime } from "./runtime.js";
import { COMPUTER_LIVE_OPEN_NOTICE, COMPUTER_SIMULATED_NOTICE } from "./types.js";
import { resolveTargetId } from "./targets.js";
import { getComputerSnapshot } from "./observe.js";
import { launchAllowlisted } from "./launch.js";

describe("Phase 5 ComputerRuntime", () => {
  it("snapshot advertises shadow plane with gated live-open", () => {
    const snap = getComputerSnapshot();
    expect(snap.plane).toBe("shadow");
    expect(snap.act_enabled).toBe(false);
    expect(snap.live_open_enabled).toBe(true);
    expect(snap.capabilities.shadow_open).toBe(true);
    expect(snap.capabilities.live_open).toBe(true);
    expect(snap.capabilities.click).toBe(false);
  });

  it("resolves semantic targets without coordinates", () => {
    expect(resolveTargetId("VS Code")).toBe("vscode");
    expect(resolveTargetId("browser")).toBe("browser");
    expect(resolveTargetId("cursor")).toBe("cursor");
    expect(resolveTargetId("Cursor")).toBe("cursor");
    expect(resolveTargetId("unknown-app-xyz")).toBeUndefined();
  });

  it("lists targets with locate results", () => {
    const runtime = new ComputerRuntime();
    const targets = runtime.listTargets();
    expect(targets.length).toBeGreaterThanOrEqual(5);
    expect(targets.every((t) => t.locate.target_id === t.id)).toBe(true);
  });

  it("shadow-open simulates open with before/after verify and never claims live", async () => {
    const evidence = new EvidenceChain();
    const runtime = new ComputerRuntime(evidence);
    const result = await runtime.runShadowOpen({
      target: "notepad",
      goal_id: "goal_test_computer",
    });

    expect(result.simulated).toBe(true);
    expect(result.simulated_notice).toBe(COMPUTER_SIMULATED_NOTICE);
    expect(result.action.mode).toBe("shadow");
    expect(result.action.simulated).toBe(true);
    expect(result.action.before?.kind).toBe("before");
    expect(result.action.after?.kind).toBe("after");
    expect(result.action.verification?.passed).toBe(true);
    expect(result.action.verification?.checks.some((c) => c.id === "no_stale_coordinates")).toBe(
      true,
    );
    expect(result.message).toContain("SIMULATED");

    const nodes = evidence.chainForGoal("goal_test_computer");
    expect(nodes.some((n) => n.kind === "observation")).toBe(true);
    expect(nodes.some((n) => n.kind === "tool_invocation" && n.simulated)).toBe(true);
    expect(nodes.some((n) => n.kind === "expected_vs_actual")).toBe(true);
  });

  it("live-open requires OPEN confirm before launching", async () => {
    const runtime = new ComputerRuntime({
      launcher: () => ({ ok: true, pid: 4242, command: "notepad" }),
    });
    const need = await runtime.runLiveOpen({ target: "notepad" });
    expect("need_confirm" in need && need.need_confirm).toBe(true);
    if ("need_confirm" in need) {
      expect(need.confirm_token).toBe("OPEN");
    }
  });

  it("live-open with OPEN launches via allowlisted launcher", async () => {
    const evidence = new EvidenceChain();
    let launched: string | undefined;
    const runtime = new ComputerRuntime({
      evidence,
      launcher: (cmd) => {
        launched = cmd;
        return { ok: true, pid: 99, command: cmd };
      },
    });
    const result = await runtime.runLiveOpen({
      target: "notepad",
      confirm: "OPEN",
      goal_id: "goal_live_open",
    });
    expect("need_confirm" in result).toBe(false);
    if ("need_confirm" in result) return;
    expect(result.simulated).toBe(false);
    expect(result.live_notice).toBe(COMPUTER_LIVE_OPEN_NOTICE);
    expect(result.action.mode).toBe("live");
    expect(result.action.ok).toBe(true);
    expect(result.pid).toBe(99);
    expect(launched).toBeTruthy();
    expect(result.message).toContain("LIVE");

    const nodes = evidence.chainForGoal("goal_live_open");
    expect(nodes.some((n) => n.kind === "tool_invocation" && n.simulated === false)).toBe(true);
  });

  it("live-open blocked by kill switch", async () => {
    engageKillSwitch("test");
    try {
      const runtime = new ComputerRuntime({
        launcher: () => ({ ok: true, pid: 1, command: "x" }),
      });
      await expect(
        runtime.runLiveOpen({ target: "notepad", confirm: "OPEN" }),
      ).rejects.toThrow(/Kill switch/);
    } finally {
      clearKillSwitch();
    }
  });

  it("rejects unsafe launch commands", () => {
    expect(launchAllowlisted("notepad & calc").ok).toBe(false);
    expect(launchAllowlisted("").ok).toBe(false);
    expect(launchAllowlisted("notepad", ["&calc"]).ok).toBe(false);
    expect(launchAllowlisted("notepad", ["--new-window;rm"]).ok).toBe(false);
  });

  it("rejects unknown targets", async () => {
    const runtime = new ComputerRuntime();
    await expect(runtime.runShadowOpen({ target: "totally-fake-app" })).rejects.toThrow(
      /Unknown computer target/,
    );
  });

  it("blocks click/type/focus/scroll", () => {
    const runtime = new ComputerRuntime();
    expect(() => runtime.assertActAllowed("click")).toThrow(/blocked/);
    expect(() => runtime.assertActAllowed("type")).toThrow(/blocked/);
    expect(() => runtime.assertActAllowed("scroll")).toThrow(/blocked/);
    expect(() => runtime.assertActAllowed("focus_window")).toThrow(/blocked/);
  });

  it("shadow type_text simulates keystrokes only after prior open", async () => {
    const runtime = new ComputerRuntime();
    const blocked = await runtime.runShadowType({
      target: "notepad",
      text: "Hello",
      prior_open: false,
    });
    expect(blocked.action.ok).toBe(false);
    const ok = await runtime.runShadowType({
      target: "notepad",
      text: "Hello",
      prior_open: true,
    });
    expect(ok.simulated).toBe(true);
    expect(ok.action.verification?.passed).toBe(true);
    expect(ok.message).toContain("SIMULATED");
    expect(ok.action.keystrokes_sent).toBe(false);
    expect(runtime.typeIntoCalls).toBe(0);
  });

  it("live type_text requires OPEN and the pid from the preceding open", async () => {
    const sent: Array<{ pid: number; text: string }> = [];
    const runtime = new ComputerRuntime({
      launcher: () => ({ ok: true, pid: 4242, command: "notepad" }),
      typeIntoWindow: (pid, text) => {
        sent.push({ pid, text });
        return {
          ok: true,
          pid,
          hwnd: 99,
          process_running: true,
          keystrokes_sent: true,
          text_readback_feasible: true,
          readback: text,
        };
      },
    });
    const need = await runtime.runLiveType({
      target: "notepad",
      text: "Hello from Jarvis",
      prior_open: true,
      goal_id: "goal_type",
    });
    expect("need_confirm" in need && need.need_confirm).toBe(true);

    const blocked = await runtime.runLiveType({
      target: "notepad",
      text: "Hello from Jarvis",
      confirm: "OPEN",
      prior_open: true,
      goal_id: "goal_type",
    });
    expect("need_confirm" in blocked).toBe(false);
    if ("need_confirm" in blocked) return;
    expect(blocked.action.ok).toBe(false);
    expect(sent).toHaveLength(0);
    expect(blocked.action.verification?.checks.some((c) => c.id === "pid_identified" && !c.ok)).toBe(
      true,
    );

    await runtime.runLiveOpen({ target: "notepad", confirm: "OPEN", goal_id: "goal_type" });
    const typed = await runtime.runLiveType({
      target: "notepad",
      text: "Hello from Jarvis",
      confirm: "OPEN",
      prior_open: true,
      goal_id: "goal_type",
    });
    expect("need_confirm" in typed).toBe(false);
    if ("need_confirm" in typed) return;
    expect(typed.action.ok).toBe(true);
    expect(sent).toEqual([{ pid: 4242, text: "Hello from Jarvis" }]);
    expect(typed.action.readback).toBe("Hello from Jarvis");
  });

  it("does not treat type_text as a blocked coordinate act", () => {
    const runtime = new ComputerRuntime();
    expect(() => runtime.assertActAllowed("type_text")).not.toThrow();
  });
});
