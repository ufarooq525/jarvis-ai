import type { ModelBackend, ModelRole } from "./types.js";

const DEFAULT_LM = process.env.JARVIS_LMSTUDIO_BASE ?? "http://127.0.0.1:1234/v1";
const DEFAULT_MODEL = process.env.JARVIS_LMSTUDIO_MODEL ?? "local-model";

/** Role → preferred backends (primary then fallbacks). */
export function defaultRoleMap(): Record<ModelRole, ModelBackend[]> {
  const lm = (model: string): ModelBackend => ({
    provider: "lmstudio",
    base_url: DEFAULT_LM,
    model,
    version_label: "openai-compat",
  });
  const mock: ModelBackend = {
    provider: "mock",
    base_url: "mock://local",
    model: "mock-shadow",
    version_label: "1.0",
  };

  return {
    reason: [lm(DEFAULT_MODEL), mock],
    code: [lm(DEFAULT_MODEL), mock],
    vision: [lm(DEFAULT_MODEL), mock],
    extract: [lm(DEFAULT_MODEL), mock],
    classify: [mock, lm(DEFAULT_MODEL)],
  };
}
