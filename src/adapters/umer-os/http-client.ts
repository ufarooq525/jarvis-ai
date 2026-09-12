/**
 * Control API HTTP client.
 * Phase D: GET for observation.
 * Phase E: POST plan only from gated Live startRun.
 */

export class ControlApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly path?: string,
  ) {
    super(message);
    this.name = "ControlApiError";
  }
}

export type FetchLike = typeof fetch;

export class ControlApiClient {
  constructor(
    readonly baseUrl: string,
    private readonly fetchImpl: FetchLike = fetch,
  ) {}

  async getJson<T>(path: string): Promise<T> {
    return this.requestJson<T>("GET", path);
  }

  async postJson<T>(path: string, body: unknown): Promise<T> {
    return this.requestJson<T>("POST", path, body);
  }

  private async requestJson<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        headers: {
          accept: "application/json",
          ...(body !== undefined ? { "content-type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e) {
      throw new ControlApiError(
        `Control API unreachable at ${this.baseUrl}: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        path,
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new ControlApiError(
        `Control API ${method} ${path} → ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`,
        res.status,
        path,
      );
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async getHealth(): Promise<{ ok: boolean; status?: string; error?: string }> {
    try {
      const h = await this.getJson<{ status?: string }>("/health");
      return { ok: true, status: h.status ?? "ok" };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "health failed",
      };
    }
  }
}
