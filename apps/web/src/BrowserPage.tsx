import { useEffect, useState } from "react";
import {
  getBrowserAllowlist,
  getBrowserSnapshot,
  postBrowserShadowResearch,
  type BrowserShadowResearchDto,
  type BrowserSnapshotDto,
} from "./api";

export function BrowserPage() {
  const [snap, setSnap] = useState<BrowserSnapshotDto | null>(null);
  const [allowlist, setAllowlist] = useState<Array<{ host: string; note: string }>>([]);
  const [url, setUrl] = useState("https://example.com/");
  const [result, setResult] = useState<BrowserShadowResearchDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      const [s, a] = await Promise.all([getBrowserSnapshot(), getBrowserAllowlist()]);
      setSnap(s);
      setAllowlist(a.allowlist);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load browser plane");
    }
  }

  async function runResearch(simulate_only: boolean) {
    try {
      setBusy(true);
      setError(null);
      setResult(await postBrowserShadowResearch({ url, simulate_only }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Research failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 740 }}>
        <div className="head">
          <div>
            <p
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.55,
                margin: "0 0 8px",
              }}
            >
              JARVIS
            </p>
            <h1>Browser</h1>
            <p>
              Phase 6 SHADOW research: allowlisted read-only GET + structured facts. Click, type, and
              publish stay blocked.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
          <button type="button" className="btn sec" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div
          className="offline"
          style={{ background: "var(--warn-bg, #f5f0e6)", color: "inherit", marginBottom: 18 }}
        >
          Hosts must be allowlisted. Research never claims a visit if the GET fails.{" "}
          <code>POST /v1/browser/act</code> returns 403.
        </div>

        {!snap ? (
          <div className="empty" style={{ border: 0 }}>
            Loading…
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="panel-hd">
                <h2>Plane</h2>
                <p>{snap.note}</p>
              </div>
              <div className="srow">
                <div>
                  <b>Capabilities</b>
                  <p>shadow-research on · click / type / publish off</p>
                </div>
                <span className="chip c-shadow">{snap.plane}</span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>Shadow research</h2>
                <p>Fetch allowlisted URL, extract fact / inference / uncertainty.</p>
              </div>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/"
                style={{
                  display: "block",
                  width: "100%",
                  marginBottom: 12,
                  padding: "10px 12px",
                  fontFamily: "var(--mono)",
                  fontSize: 13,
                }}
              />
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="btn sec"
                  disabled={busy}
                  onClick={() => void runResearch(true)}
                >
                  Simulate only
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !url.trim()}
                  onClick={() => void runResearch(false)}
                >
                  {busy ? "Researching…" : "Research (GET)"}
                </button>
              </div>
              {result ? (
                <div style={{ marginTop: 14 }}>
                  <div className="srow">
                    <div>
                      <b>Result</b>
                      <p style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{result.message}</p>
                    </div>
                    <span className={`chip ${result.action.ok ? "c-shadow" : "c-danger"}`}>
                      {result.simulated ? "simulated" : result.action.fetch?.visited ? "visited" : "no visit"}
                    </span>
                  </div>
                  {result.facts.map((f) => (
                    <div className="srow" key={f.id}>
                      <div>
                        <b>{f.kind}</b>
                        <p>{f.claim}</p>
                        <p style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>
                          {f.source_url} · {f.fetched_at}
                        </p>
                      </div>
                      <span className="sval">{Math.round(f.confidence * 100)}%</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>Allowlist</h2>
                <p>Only these hosts may be fetched in SHADOW.</p>
              </div>
              {allowlist.map((e) => (
                <div className="srow" key={e.host}>
                  <div>
                    <b>{e.host}</b>
                    <p>{e.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
