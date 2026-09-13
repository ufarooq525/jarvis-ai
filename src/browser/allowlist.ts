/** Allowlisted hosts for Phase 6 SHADOW read-only fetch. */

export interface AllowlistEntry {
  host: string;
  note: string;
}

export const BROWSER_ALLOWLIST: AllowlistEntry[] = [
  { host: "example.com", note: "IANA example domain — safe smoke" },
  { host: "www.example.com", note: "IANA example domain" },
  { host: "en.wikipedia.org", note: "Public encyclopedia (read-only)" },
  { host: "wikipedia.org", note: "Wikipedia apex" },
  { host: "developer.mozilla.org", note: "MDN docs (read-only)" },
];

export function listAllowlist(): AllowlistEntry[] {
  return [...BROWSER_ALLOWLIST];
}

export function isAllowlistedUrl(url: string): { ok: true; host: string } | { ok: false; reason: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "Invalid URL" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "Only http(s) URLs allowed" };
  }
  if (parsed.username || parsed.password) {
    return { ok: false, reason: "URLs with credentials are blocked" };
  }
  const host = parsed.hostname.toLowerCase();
  const allowed = BROWSER_ALLOWLIST.some(
    (e) => host === e.host || host.endsWith(`.${e.host}`),
  );
  if (!allowed) {
    return { ok: false, reason: `Host not allowlisted: ${host}` };
  }
  return { ok: true, host };
}
