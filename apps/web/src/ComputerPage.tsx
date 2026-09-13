import { useEffect, useState } from "react";
import {
  getComputerSnapshot,
  getComputerTargets,
  postComputerLiveOpen,
  postComputerShadowOpen,
  type ComputerLiveOpenDto,
  type ComputerShadowOpenDto,
  type ComputerSnapshotDto,
  type ComputerTargetDto,
} from "./api";

export function ComputerPage() {
  const [snap, setSnap] = useState<ComputerSnapshotDto | null>(null);
  const [targets, setTargets] = useState<ComputerTargetDto[]>([]);
  const [selected, setSelected] = useState("notepad");
  const [lastResult, setLastResult] = useState<ComputerShadowOpenDto | ComputerLiveOpenDto | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [typed, setTyped] = useState("");

  async function load() {
    try {
      setError(null);
      const [s, t] = await Promise.all([getComputerSnapshot(), getComputerTargets()]);
      setSnap(s);
      setTargets(t.targets);
      if (t.targets.length && !t.targets.some((x) => x.id === selected)) {
        setSelected(t.targets[0]!.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load computer state");
    }
  }

  async function runShadowOpen() {
    try {
      setBusy(true);
      setError(null);
      setLastResult(await postComputerShadowOpen({ target: selected }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Shadow open failed");
    } finally {
      setBusy(false);
    }
  }

  async function runLiveOpenConfirmed() {
    try {
      setBusy(true);
      setError(null);
      const result = await postComputerLiveOpen({ target: selected, confirm: "OPEN" });
      if ("need_confirm" in result) {
        setError(result.message);
        return;
      }
      setLastResult(result);
      setLiveConfirmOpen(false);
      setTyped("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Live open failed");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const canLive = typed.trim() === "OPEN" && !busy;

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
            <h1>Computer</h1>
            <p>
              Observe, locate, Shadow-simulate, or Live-open allowlisted apps (type OPEN). Click and
              type stay blocked.
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
          Shadow open never launches. Live open requires typing <b>OPEN</b>, then launches the
          allowlisted app. <code>POST /v1/computer/act</code> stays 403.
        </div>

        {!snap ? (
          <div className="empty" style={{ border: 0 }}>
            Loading…
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="panel-hd">
                <h2>Host</h2>
                <p>{snap.host.hostname}</p>
              </div>
              <div className="srow">
                <div>
                  <b>Platform</b>
                  <p>
                    {snap.host.platform} / {snap.host.arch}
                  </p>
                </div>
                <span className="sval">{snap.host.release}</span>
              </div>
              <div className="srow">
                <div>
                  <b>Plane</b>
                  <p>{snap.note}</p>
                </div>
                <span className="chip c-shadow">{snap.plane}</span>
              </div>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>Open application</h2>
                <p>Semantic targets only — no coordinate clicks.</p>
              </div>
              <div className="srow" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <select
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  style={{ flex: 1, minWidth: 160 }}
                >
                  {targets.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.display_name}
                      {t.locate.found ? "" : " (not found)"}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="btn sec"
                  disabled={busy || !selected}
                  onClick={() => void runShadowOpen()}
                >
                  {busy ? "…" : "Shadow open"}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy || !selected}
                  onClick={() => {
                    setTyped("");
                    setLiveConfirmOpen(true);
                  }}
                >
                  Live open…
                </button>
              </div>
              {lastResult ? (
                <div style={{ marginTop: 14 }}>
                  <div className="srow">
                    <div>
                      <b>Result</b>
                      <p style={{ fontFamily: "var(--mono)", fontSize: 12 }}>{lastResult.message}</p>
                    </div>
                    <span
                      className={`chip ${lastResult.action.ok ? (lastResult.simulated ? "c-shadow" : "c-live") : "c-danger"}`}
                    >
                      {lastResult.simulated ? "simulated" : lastResult.action.ok ? "live" : "failed"}
                    </span>
                  </div>
                  <div className="srow">
                    <div>
                      <b>Locate</b>
                      <p>{lastResult.locate.detail}</p>
                    </div>
                  </div>
                  {"pid" in lastResult && lastResult.pid != null ? (
                    <div className="srow">
                      <div>
                        <b>PID</b>
                      </div>
                      <span className="sval">{lastResult.pid}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>Targets</h2>
                <p>Read-only locate — semantic ids only.</p>
              </div>
              {targets.map((t) => (
                <div className="srow" key={t.id}>
                  <div>
                    <b>{t.display_name}</b>
                    <p style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{t.locate.detail}</p>
                  </div>
                  <span className={`chip ${t.locate.found ? "c-shadow" : "c-danger"}`}>
                    {t.locate.found ? "found" : "missing"}
                  </span>
                </div>
              ))}
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>Resources</h2>
                <p>Local metrics only — not sent to Umer OS.</p>
              </div>
              <div className="srow">
                <div>
                  <b>CPU</b>
                </div>
                <span className="sval">{snap.resources.cpu_count} cores</span>
              </div>
              <div className="srow">
                <div>
                  <b>Memory</b>
                </div>
                <span className="sval">
                  {snap.resources.freemem_mb} / {snap.resources.totalmem_mb} MB free
                </span>
              </div>
              <div className="srow">
                <div>
                  <b>Uptime</b>
                </div>
                <span className="sval">{snap.resources.uptime_hours} h</span>
              </div>
            </div>
          </>
        )}
      </div>

      {liveConfirmOpen ? (
        <>
          <div className="scrim on" onClick={() => !busy && setLiveConfirmOpen(false)} />
          <div className="dlg on" role="dialog" aria-modal="true" aria-labelledby="live-open-t">
            <div className="dlg-b">
              <h2 id="live-open-t">Live open {selected}?</h2>
              <p>
                This will launch the allowlisted app on this machine. Shadow simulation is not
                enough — type <b>OPEN</b> to confirm.
              </p>
              <div className="dlg-warn">
                Kill switch must be clear. Click/type remain blocked. Only the resolved path for{" "}
                {selected} will run — no shell.
              </div>
              <label style={{ display: "block", marginTop: 14, fontSize: 13 }}>
                Type OPEN to authorize
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  disabled={busy}
                  autoFocus
                  placeholder="OPEN"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    fontFamily: "var(--mono)",
                    fontSize: 14,
                  }}
                />
              </label>
            </div>
            <div className="dlg-f">
              <button
                type="button"
                className="btn sec"
                disabled={busy}
                onClick={() => setLiveConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                disabled={!canLive}
                onClick={() => void runLiveOpenConfirmed()}
              >
                {busy ? "Launching…" : "Open Live"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
