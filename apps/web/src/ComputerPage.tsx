import { useEffect, useState } from "react";
import { getComputerSnapshot, type ComputerSnapshotDto } from "./api";

export function ComputerPage() {
  const [snap, setSnap] = useState<ComputerSnapshotDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setError(null);
      setSnap(await getComputerSnapshot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load computer snapshot");
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
            <h1>Computer</h1>
            <p>Observe-only machine state. No click, type, or shell until a sandbox + Approve exist.</p>
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
          Act plane disabled — <code>POST /v1/computer/act</code> returns 403.
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

            <div className="panel">
              <div className="panel-hd">
                <h2>Process</h2>
                <p>JARVIS API runtime.</p>
              </div>
              <div className="srow">
                <div>
                  <b>Node</b>
                </div>
                <span className="sval">{snap.process.node}</span>
              </div>
              <div className="srow">
                <div>
                  <b>PID</b>
                </div>
                <span className="sval">{snap.process.pid}</span>
              </div>
              <div className="srow">
                <div>
                  <b>CWD</b>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{snap.process.cwd_preview}</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
