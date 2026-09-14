import { describe, expect, it, beforeEach, vi } from "vitest";
import { GoalEngine } from "./engine.js";
import { MockOsRuntimeAdapter } from "../adapters/mock/mock-os-runtime-adapter.js";
import { ComputerRuntime } from "../computer/runtime.js";
import { resetFactStore } from "../world-model/fact-store.js";
import { extractTypeText, isComputerTypeOutcome } from "./computer-type.js";

describe("computer_type slice — open Notepad and type", () => {
  beforeEach(() => {
    resetFactStore();
  });

  it("detects the Notepad type phrase and extracts the text", () => {
    expect(isComputerTypeOutcome("Open Notepad and type Hello from Jarvis.")).toBe(true);
    expect(extractTypeText("Open Notepad and type Hello from Jarvis.")).toBe("Hello from Jarvis");
    expect(isComputerTypeOutcome("Open Notepad.")).toBe(false);
    expect(isComputerTypeOutcome("Open Cursor and type Hello from Jarvis.")).toBe(true);
    expect(extractTypeText("Open Cursor and type Hello from Jarvis.")).toBe("Hello from Jarvis");
    expect(isComputerTypeOutcome("Open VS Code and type hello")).toBe(false);
  });

  it("Shadow: two computer steps, no OS start_run, no real keystrokes", async () => {
    const typeInto = vi.fn(() => {
      throw new Error("Shadow must not send keystrokes");
    });
    const launcher = vi.fn(() => {
      throw new Error("Shadow must not launch");
    });
    const computer = new ComputerRuntime({
      typeIntoWindow: typeInto,
      launcher,
    });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const result = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis.",
    });

    expect(result.normalized.plan_kind).toBe("computer_type");
    expect(result.goal.plan_source).toBe("fallback");
    expect(result.verification.passed).toBe(true);
    expect(result.goal.status).toBe("done");
    expect(typeInto).not.toHaveBeenCalled();
    expect(launcher).not.toHaveBeenCalled();
    expect(computer.typeIntoCalls).toBe(0);
    expect(result.runs.some((r) => r.tool_invocations.includes("os.runtime.start_run"))).toBe(false);
    expect(result.runs.map((r) => r.tool_invocations[0])).toEqual([
      "computer.open_app",
      "computer.type_text",
    ]);
    expect(result.operator_report?.summary).toMatch(/Notepad/i);
    expect(result.operator_report?.summary).toMatch(/Hello from Jarvis/);
    expect(result.operator_report?.summary).toMatch(/no keystrokes sent/i);
    expect(result.evidence_json).toContain("Shadow type verified");
  });

  it("does not merge a new Shadow plan into a blocked Live computer_type goal", async () => {
    const computer = new ComputerRuntime({
      typeIntoWindow: () => ({
        ok: false,
        pid: 1,
        process_running: true,
        keystrokes_sent: false,
        text_readback_feasible: false,
        error: "WINDOW_NOT_IDENTIFIED",
      }),
      launcher: () => ({ ok: true, pid: 1, command: "notepad" }),
    });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const first = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis.",
    });
    first.goal.status = "blocked";
    first.goal.mode = "live";
    engine.store.saveGoal(first.goal);

    const second = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis.",
    });
    expect(second.decision_outcome).not.toBe("merge_into_existing");
    expect(second.goal.id).not.toBe(first.goal.id);
    expect(second.goal.mode).toBe("shadow");
    expect(second.verification.passed).toBe(true);
    expect(second.goal.status).toBe("done");
    expect(computer.typeIntoCalls).toBe(0);
  });

  it("Live OPEN types into the launched pid and verifies read-back before done", async () => {
    const typeInto = vi.fn((pid: number, text: string) => ({
      ok: true,
      pid,
      hwnd: 8800,
      process_running: true,
      keystrokes_sent: true,
      text_readback_feasible: true,
      readback: text,
    }));
    const computer = new ComputerRuntime({
      launcher: () => ({ ok: true, pid: 4242, command: "notepad" }),
      typeIntoWindow: typeInto,
    });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const shadow = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis.",
    });
    expect(typeInto).not.toHaveBeenCalled();

    await expect(
      engine.promoteToLive({ goalId: shadow.goal.id, confirm: "LIVE" }),
    ).rejects.toThrow(/OPEN/);

    const live = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "OPEN",
    });
    expect(typeInto).toHaveBeenCalledWith(4242, "Hello from Jarvis", expect.objectContaining({
      launched_at: expect.any(String),
    }));
    expect(live.goal.status).toBe("done");
    expect(live.run.os_run_id).toBeUndefined();
    expect(live.goal.operator_report?.observed).toMatch(/hwnd=8800/);
    expect(live.goal.operator_report?.observed).toMatch(/Hello from Jarvis/);
    expect(live.message).toMatch(/Opened notepad/i);
    expect(live.message).toMatch(/Typed "Hello from Jarvis"/);
  });

  it("Live blocks when the window cannot be identified instead of typing globally", async () => {
    const typeInto = vi.fn();
    const computer = new ComputerRuntime({
      launcher: () => ({ ok: true, pid: 7, command: "notepad" }),
      typeIntoWindow: typeInto,
    });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const shadow = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis.",
    });
    typeInto.mockReturnValue({
      ok: false,
      pid: 7,
      process_running: true,
      keystrokes_sent: false,
      text_readback_feasible: false,
      error: "WINDOW_NOT_IDENTIFIED",
    });
    const live = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "OPEN",
    });
    expect(live.goal.status).toBe("blocked");
    expect(live.message).toMatch(/window not identified|verification failed|not identified|Did not type/i);
  });

  it("Live blocks when text read-back is not feasible — not silently done", async () => {
    const computer = new ComputerRuntime({
      launcher: () => ({ ok: true, pid: 11, command: "notepad" }),
      typeIntoWindow: (pid, text) => ({
        ok: true,
        pid,
        hwnd: 1,
        process_running: true,
        keystrokes_sent: true,
        text_readback_feasible: false,
        readback: undefined,
        error: `would have typed ${text}`,
      }),
    });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const shadow = await engine.runShadowLoop({
      outcome: "Open Notepad and type Hello from Jarvis.",
    });
    const live = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "OPEN",
    });
    expect(live.goal.status).toBe("blocked");
    expect(live.goal.operator_report?.verification).toMatch(/text_content/);
  });

  it("Shadow: Open Cursor and type uses computer_type, not vscode or OS start_run", async () => {
    const typeInto = vi.fn(() => {
      throw new Error("Shadow must not send keystrokes");
    });
    const launcher = vi.fn(() => {
      throw new Error("Shadow must not launch");
    });
    const computer = new ComputerRuntime({ typeIntoWindow: typeInto, launcher });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const result = await engine.runShadowLoop({
      outcome: "Open Cursor and type Hello from Jarvis.",
    });

    expect(result.normalized.plan_kind).toBe("computer_type");
    expect(result.normalized.computer_target_id).toBe("cursor");
    expect(result.runs.map((r) => r.tool_invocations[0])).toEqual([
      "computer.open_app",
      "computer.type_text",
    ]);
    expect(result.runs.some((r) => r.tool_invocations.includes("os.runtime.start_run"))).toBe(false);
    expect(typeInto).not.toHaveBeenCalled();
    expect(launcher).not.toHaveBeenCalled();
    expect(result.operator_report?.summary).toMatch(/cursor/i);
    expect(result.goal.status).toBe("done");
  });

  it("Live OPEN types into the launched Cursor pid", async () => {
    const typeInto = vi.fn((pid: number, text: string) => ({
      ok: true,
      pid,
      hwnd: 9900,
      process_running: true,
      keystrokes_sent: true,
      text_readback_feasible: true,
      readback: text,
    }));
    const computer = new ComputerRuntime({
      launcher: () => ({ ok: true, pid: 5151, command: "Cursor.exe" }),
      typeIntoWindow: typeInto,
    });
    const engine = new GoalEngine(new MockOsRuntimeAdapter(), { computer });
    const shadow = await engine.runShadowLoop({
      outcome: "Open Cursor and type Hello from Jarvis.",
    });
    const live = await engine.promoteToLive({
      goalId: shadow.goal.id,
      confirm: "OPEN",
    });
    expect(typeInto).toHaveBeenCalledWith(
      5151,
      "Hello from Jarvis",
      expect.objectContaining({ launched_at: expect.any(String) }),
    );
    expect(live.goal.status).toBe("done");
    expect(live.message).toMatch(/Opened cursor/i);
    expect(live.message).toMatch(/Typed "Hello from Jarvis"/);
  });
});
