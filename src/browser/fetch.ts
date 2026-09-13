import { nowIso } from "../util/ids.js";
import { isAllowlistedUrl } from "./allowlist.js";
import type { BrowserFetchRecord } from "./types.js";

export type PageFetcher = (url: string) => Promise<{
  ok: boolean;
  status: number;
  content_type?: string;
  body: string;
}>;

const DEFAULT_TIMEOUT_MS = 12_000;
const MAX_BYTES = 512_000;

export async function defaultPageFetcher(url: string): Promise<{
  ok: boolean;
  status: number;
  content_type?: string;
  body: string;
}> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
        "user-agent": "JARVIS-BrowserShadow/0.1 (read-only research; +local)",
      },
    });
    const buf = Buffer.from(await res.arrayBuffer());
    const sliced = buf.byteLength > MAX_BYTES ? buf.subarray(0, MAX_BYTES) : buf;
    return {
      ok: res.ok,
      status: res.status,
      content_type: res.headers.get("content-type") ?? undefined,
      body: sliced.toString("utf8"),
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchAllowlistedPage(
  url: string,
  fetcher: PageFetcher = defaultPageFetcher,
): Promise<BrowserFetchRecord> {
  const fetched_at = nowIso();
  const gate = isAllowlistedUrl(url);
  if (!gate.ok) {
    return {
      url,
      ok: false,
      fetched_at,
      visited: false,
      error: gate.reason,
    };
  }

  try {
    const res = await fetcher(url);
    if (!res.ok) {
      return {
        url,
        ok: false,
        status: res.status,
        fetched_at,
        visited: false,
        content_type: res.content_type,
        error: `HTTP ${res.status}`,
        bytes: Buffer.byteLength(res.body),
      };
    }

    const titleMatch = res.body.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim();
    const text = stripHtml(res.body).slice(0, 2_000);

    return {
      url,
      ok: true,
      status: res.status,
      fetched_at,
      visited: true,
      content_type: res.content_type,
      title,
      text_preview: text,
      bytes: Buffer.byteLength(res.body),
    };
  } catch (e) {
    return {
      url,
      ok: false,
      fetched_at,
      visited: false,
      error: e instanceof Error ? e.message : "fetch failed",
    };
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
