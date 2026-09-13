import { useEffect, useState } from "react";
import {
  getModelHealth,
  getModelRoles,
  postModelComplete,
  type ModelCompleteDto,
} from "./api";

export function ModelsPage() {
  const [roles, setRoles] = useState<Array<{ role: string }>>([]);
  const [health, setHealth] = useState<
    Array<{ provider: string; reachable: boolean; base_url: string; models: string[] }>
  >([]);
  const [role, setRole] = useState("classify");
  const [prompt, setPrompt] = useState("Classify: Laravel freelance lead in Riyadh");
  const [result, setResult] = useState<ModelCompleteDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [r, h] = await Promise.all([getModelRoles(), getModelHealth()]);
    setRoles(r.roles);
    setHealth(h.health);
  }

  useEffect(() => {
    void load().catch((e: Error) => setError(e.message));
  }, []);

  async function onComplete() {
    try {
      setBusy(true);
      setError(null);
      setResult(await postModelComplete({ role, prompt }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Complete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
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
            <h1>Models</h1>
            <p>
              Phase 10 router: LM Studio / mock by role. Output is advisory — never verification
              truth.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
          <button type="button" className="btn sec" onClick={() => void load()}>
            Refresh
          </button>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Health</h2>
            <p>LM Studio default: http://127.0.0.1:1234/v1 — mock always available.</p>
          </div>
          {health.map((h) => (
            <div className="srow" key={`${h.provider}-${h.base_url}`}>
              <div>
                <b>{h.provider}</b>
                <p style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{h.base_url}</p>
              </div>
              <span className={`chip ${h.reachable ? "c-done" : "c-fail"}`}>
                {h.reachable ? "up" : "down"}
              </span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Complete</h2>
            <p>Roles: {(roles.map((r) => r.role).join(", ") || "loading…")}</p>
          </div>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            style={{ display: "block", width: "100%", marginBottom: 8, padding: 10 }}
          >
            {["reason", "code", "vision", "extract", "classify"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            style={{
              display: "block",
              width: "100%",
              marginBottom: 12,
              padding: 12,
              fontFamily: "var(--mono)",
              fontSize: 12,
            }}
          />
          <button type="button" className="btn" disabled={busy} onClick={() => void onComplete()}>
            {busy ? "Running…" : "Run (advisory)"}
          </button>
          {result ? (
            <div style={{ marginTop: 14 }}>
              <div className="srow">
                <div>
                  <b>Result</b>
                  <p style={{ whiteSpace: "pre-wrap" }}>{result.text || result.error}</p>
                </div>
                <span className={`chip ${result.ok ? "c-shadow" : "c-fail"}`}>
                  {result.simulated ? "simulated" : result.provenance.provider}
                </span>
              </div>
              <p style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.7 }}>
                {result.notice} · {result.provenance.provider}/{result.provenance.model} ·{" "}
                {result.provenance.latency_ms}ms
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
