import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { ModelRouter, bindModelRouter, getModelRouter, resetModelRouter } from "./router.js";
import { MODEL_OUTPUT_NOTICE } from "./types.js";

describe("Phase 10 ModelRouter", () => {
  beforeEach(() => {
    resetModelRouter();
    bindModelRouter(
      new ModelRouter(undefined, async (backend, req) => ({
        ok: true,
        text: `ok:${backend.provider}:${req.role}`,
      })),
    );
  });

  afterEach(() => {
    resetModelRouter();
  });

  it("lists roles with backends", () => {
    const roles = getModelRouter().listRoles();
    expect(roles.some((r) => r.role === "extract")).toBe(true);
    expect(roles.some((r) => r.role === "classify")).toBe(true);
  });

  it("completes with provenance and advisory notice", async () => {
    const result = await getModelRouter().complete({
      role: "classify",
      prompt: "Is this a sales lead about Laravel?",
    });
    expect(result.ok).toBe(true);
    expect(result.notice).toBe(MODEL_OUTPUT_NOTICE);
    expect(result.provenance.role).toBe("classify");
    expect(result.provenance.attempted.length).toBeGreaterThan(0);
  });

  it("falls back when primary fails", async () => {
    bindModelRouter(
      new ModelRouter(undefined, async (backend) => {
        if (backend.provider === "lmstudio") {
          return { ok: false, text: "", error: "down" };
        }
        return { ok: true, text: "mock-fallback" };
      }),
    );
    const result = await getModelRouter().complete({
      role: "reason",
      prompt: "Summarize opportunity",
    });
    expect(result.ok).toBe(true);
    expect(result.text).toContain("mock-fallback");
    expect(result.provenance.attempted.some((a) => a.includes("lmstudio"))).toBe(true);
  });

  it("blocks secrets in prompts", async () => {
    await expect(
      getModelRouter().complete({
        role: "extract",
        prompt: "password=supersecretvalue123456",
      }),
    ).rejects.toThrow(/secret/);
  });
});
