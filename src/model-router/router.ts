import { nowIso } from "../util/ids.js";
import { assertNoSecrets } from "../world-model/secrets.js";
import { defaultRoleMap } from "./roles.js";
import type {
  ModelBackend,
  ModelCompletionRequest,
  ModelCompletionResult,
  ModelHealth,
  ModelProviderId,
  ModelRole,
} from "./types.js";
import { MODEL_OUTPUT_NOTICE } from "./types.js";

const MAX_RETRIES = 2;

export type Completer = (
  backend: ModelBackend,
  req: ModelCompletionRequest,
) => Promise<{ ok: boolean; text: string; error?: string }>;

async function mockCompleter(
  backend: ModelBackend,
  req: ModelCompletionRequest,
): Promise<{ ok: boolean; text: string }> {
  const preview = req.prompt.trim().slice(0, 120);
  return {
    ok: true,
    text: `[mock:${req.role}] SHADOW completion for: ${preview}${req.prompt.length > 120 ? "…" : ""}`,
  };
}

async function lmStudioCompleter(
  backend: ModelBackend,
  req: ModelCompletionRequest,
): Promise<{ ok: boolean; text: string; error?: string }> {
  const url = `${backend.base_url.replace(/\/$/, "")}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({
        model: backend.model,
        temperature: req.temperature ?? 0.2,
        max_tokens: req.max_tokens ?? 400,
        messages: [
          {
            role: "system",
            content:
              req.system ??
              "You are a JARVIS helper. Be concise. Do not claim external actions. Output is advisory only.",
          },
          { role: "user", content: req.prompt },
        ],
      }),
    });
    if (!res.ok) {
      return { ok: false, text: "", error: `HTTP ${res.status}` };
    }
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim() ?? "";
    if (!text) return { ok: false, text: "", error: "Empty model response" };
    return { ok: true, text };
  } catch (e) {
    return { ok: false, text: "", error: e instanceof Error ? e.message : "lmstudio failed" };
  } finally {
    clearTimeout(timer);
  }
}

function completerFor(provider: ModelProviderId, inject?: Completer): Completer {
  if (inject) return inject;
  if (provider === "mock") return mockCompleter;
  return lmStudioCompleter;
}

export class ModelRouter {
  constructor(
    private readonly roleMap: Record<ModelRole, ModelBackend[]> = defaultRoleMap(),
    private readonly injectCompleter?: Completer,
  ) {}

  listRoles(): Array<{ role: ModelRole; backends: ModelBackend[] }> {
    return (Object.keys(this.roleMap) as ModelRole[]).map((role) => ({
      role,
      backends: this.roleMap[role],
    }));
  }

  async health(): Promise<ModelHealth[]> {
    const seen = new Map<string, ModelBackend>();
    for (const backends of Object.values(this.roleMap)) {
      for (const b of backends) {
        seen.set(`${b.provider}|${b.base_url}`, b);
      }
    }
    const out: ModelHealth[] = [];
    for (const b of seen.values()) {
      out.push(await this.checkBackend(b));
    }
    return out;
  }

  async complete(req: ModelCompletionRequest): Promise<ModelCompletionResult> {
    assertNoSecrets(req.prompt);
    if (req.system) assertNoSecrets(req.system);

    const backends = this.roleMap[req.role] ?? [];
    if (!backends.length) {
      throw new Error(`No backends configured for role ${req.role}`);
    }

    const attempted: string[] = [];
    const started = Date.now();
    let lastError = "no attempt";

    for (const backend of backends) {
      for (let i = 0; i <= MAX_RETRIES; i++) {
        const label = `${backend.provider}:${backend.model}#${i}`;
        attempted.push(label);
        const fn = completerFor(backend.provider, this.injectCompleter);
        const result = await fn(backend, req);
        if (result.ok) {
          return {
            ok: true,
            text: result.text,
            simulated: backend.provider === "mock",
            provenance: {
              provider: backend.provider,
              model: backend.model,
              role: req.role,
              version_label: backend.version_label,
              attempted,
              at: nowIso(),
              latency_ms: Date.now() - started,
            },
            notice: MODEL_OUTPUT_NOTICE,
          };
        }
        lastError = result.error ?? "unknown";
      }
    }

    return {
      ok: false,
      text: "",
      simulated: true,
      provenance: {
        provider: backends[0]!.provider,
        model: backends[0]!.model,
        role: req.role,
        version_label: backends[0]!.version_label,
        attempted,
        at: nowIso(),
        latency_ms: Date.now() - started,
      },
      error: lastError,
      notice: MODEL_OUTPUT_NOTICE,
    };
  }

  private async checkBackend(b: ModelBackend): Promise<ModelHealth> {
    const checked_at = nowIso();
    if (b.provider === "mock") {
      return {
        provider: "mock",
        reachable: true,
        base_url: b.base_url,
        models: [b.model],
        checked_at,
      };
    }
    try {
      const res = await fetch(`${b.base_url.replace(/\/$/, "")}/models`, {
        signal: AbortSignal.timeout(4_000),
      });
      if (!res.ok) {
        return {
          provider: b.provider,
          reachable: false,
          base_url: b.base_url,
          models: [],
          error: `HTTP ${res.status}`,
          checked_at,
        };
      }
      const body = (await res.json()) as { data?: Array<{ id?: string }> };
      const models = (body.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
      return {
        provider: b.provider,
        reachable: true,
        base_url: b.base_url,
        models: models.length ? models : [b.model],
        checked_at,
      };
    } catch (e) {
      return {
        provider: b.provider,
        reachable: false,
        base_url: b.base_url,
        models: [],
        error: e instanceof Error ? e.message : "unreachable",
        checked_at,
      };
    }
  }
}

let singleton: ModelRouter | null = null;

export function getModelRouter(): ModelRouter {
  if (!singleton) singleton = new ModelRouter();
  return singleton;
}

export function bindModelRouter(router: ModelRouter): void {
  singleton = router;
}

export function resetModelRouter(): void {
  singleton = null;
}
