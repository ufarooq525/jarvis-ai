import { useEffect, useState } from "react";
import {
  getOsSnapshot,
  getTrustStatus,
  listTools,
  setAdapter,
  setKillSwitch,
  type OsSnapshotDto,
  type ToolManifestDto,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";

export function SettingsPage() {
  const { mode, setMode, requestLiveMode, byStage } = useJarvis();
  const liveN = byStage("live").length;
  const [kill, setKill] = useState<{ engaged: boolean; reason: string | null }>({
    engaged: false,
    reason: null,
  });
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [tools, setTools] = useState<ToolManifestDto[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmKill, setConfirmKill] = useState(false);
  const [snap, setSnap] = useState<OsSnapshotDto | null>(null);
  const [adapterBusy, setAdapterBusy] = useState(false);

  async function load() {
    try {
      setError(null);
      const [trust, toolRes, snapshot] = await Promise.all([
        getTrustStatus(),
        listTools(),
        getOsSnapshot(),
      ]);
      setKill(trust.kill_switch);
      setTiers(trust.domain_tiers);
      setNote(trust.note);
      setTools(toolRes.tools);
      setSnap(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load trust status");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function toggleKill() {
    try {
      const next = kill.engaged ? "clear" : "engage";
      const res = await setKillSwitch(next, next === "engage" ? "manual from Settings" : undefined);
      setKill(res.kill_switch);
      setConfirmKill(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kill switch update failed");
    }
  }

  async function switchAdapter(next: "mock" | "umer-read") {
    setAdapterBusy(true);
    try {
      setError(null);
      await setAdapter(next);
      const snapshot = await getOsSnapshot();
      setSnap(snapshot);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Adapter switch failed");
    } finally {
      setAdapterBusy(false);
    }
  }

  const adapter = snap?.adapter ?? "mock";

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 740 }}>
        <div className="head">
          <div>
            <h1>Settings</h1>
            <p>
              Mode and kill switch change what JARVIS may do. Trust tiers and tool manifests explain
              who may do what.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
        </div>

        <div className="panel mode-panel">
          <div className="panel-hd">
            <h2>Default mode</h2>
            <p>What happens when you state an outcome without choosing.</p>
          </div>
          <div className="choice">
            <button
              type="button"
              className="opt"
              aria-pressed={mode === "shadow"}
              onClick={() => setMode("shadow")}
            >
              <b>Shadow</b>
              <p>
                Plans against a copy of your data and shows you the steps. Nothing is written, sent
                or deleted.
              </p>
            </button>
            <button
              type="button"
              className="opt lv"
              aria-pressed={mode === "live"}
              onClick={() => requestLiveMode()}
            >
              <b>Live</b>
              <p>
                Still shows the plan and still asks before running. The difference is that approval
                executes (Phase E for real OS).
              </p>
            </button>
          </div>
        </div>

        <div
          className="panel"
          style={{
            borderColor: kill.engaged ? "var(--danger-line)" : undefined,
          }}
        >
          <div
            className="panel-hd"
            style={{
              background: kill.engaged ? "var(--danger-bg)" : undefined,
            }}
          >
            <h2 style={{ color: kill.engaged ? "var(--danger-ink)" : undefined }}>Kill switch</h2>
            <p style={{ color: kill.engaged ? "var(--danger-ink)" : undefined }}>
              When engaged, Live-shaped paths are rejected. Shadow planning still works.
            </p>
          </div>
          <div className="srow">
            <div>
              <b>{kill.engaged ? "Engaged" : "Clear"}</b>
              <p>
                {kill.engaged
                  ? `Reason: ${kill.reason ?? "manual"}. Live dispatches blocked.`
                  : "Live proposals can still require approval, but are not globally blocked."}
              </p>
            </div>
            {!confirmKill ? (
              <button
                type="button"
                className={`btn${kill.engaged ? " sec" : " warn"}`}
                onClick={() => setConfirmKill(true)}
              >
                {kill.engaged ? "Clear kill switch" : "Engage kill switch"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn warn" onClick={() => void toggleKill()}>
                  Confirm
                </button>
                <button type="button" className="btn sec" onClick={() => setConfirmKill(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Domain trust</h2>
            <p>{note || "New domains default SHADOW."}</p>
          </div>
          {Object.entries(tiers).map(([domain, tier]) => (
            <div className="srow" key={domain}>
              <div>
                <b>{domain}</b>
                <p>Default trust for this domain.</p>
              </div>
              <span className="chip c-shadow">{tier}</span>
            </div>
          ))}
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Tool manifests</h2>
            <p>Missing tools are hard-rejected. Effects and blast radius decide approval class.</p>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--ink-3)" }}>
                  <th style={{ padding: "10px 17px" }}>Tool</th>
                  <th style={{ padding: "10px 8px" }}>Effects</th>
                  <th style={{ padding: "10px 8px" }}>Blast</th>
                  <th style={{ padding: "10px 8px" }}>Trust</th>
                  <th style={{ padding: "10px 17px" }}>Dry-run</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.tool_id} style={{ borderTop: "1px solid var(--line)" }}>
                    <td style={{ padding: "12px 17px" }}>
                      <b style={{ fontWeight: 600 }}>{t.display_name}</b>
                      <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-3)" }}>
                        {t.tool_id}
                      </div>
                    </td>
                    <td style={{ padding: "12px 8px", fontFamily: "var(--mono)", fontSize: 11 }}>
                      {t.effects.join(", ")}
                    </td>
                    <td style={{ padding: "12px 8px" }}>{t.blast_radius}</td>
                    <td style={{ padding: "12px 8px" }}>
                      <span className="chip c-shadow">{t.required_trust_tier}</span>
                    </td>
                    <td style={{ padding: "12px 17px" }}>{t.dry_run_supported ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Connection</h2>
            <p>Dev switcher — mock vs observe Umer Control API (GET only).</p>
          </div>
          <div className="choice" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="opt"
              disabled={adapterBusy}
              aria-pressed={adapter === "mock"}
              onClick={() => void switchAdapter("mock")}
            >
              <b>Mock</b>
              <p>Fabricated OS state. No calls to :4000.</p>
            </button>
            <button
              type="button"
              className="opt"
              disabled={adapterBusy}
              aria-pressed={adapter === "umer-read"}
              onClick={() => void switchAdapter("umer-read")}
            >
              <b>Umer read</b>
              <p>Observe Control API at 127.0.0.1:4000. No Live writes.</p>
            </button>
          </div>
          <div className="srow">
            <div>
              <b>Adapter</b>
              <p>{snap?.observation_only ? "Observation only — Phase E for Live startRun." : ""}</p>
            </div>
            <span className="sval">{adapter}</span>
          </div>
          <div className="srow">
            <div>
              <b>Control API</b>
              <p>{snap?.control_api ?? "not used in mock"}</p>
            </div>
            <span
              className="sval"
              style={{
                color:
                  adapter === "umer-read" && snap && !snap.reachable
                    ? "var(--danger-ink)"
                    : undefined,
              }}
            >
              {adapter === "mock"
                ? "n/a"
                : snap?.reachable
                  ? "reachable"
                  : snap?.error
                    ? "unreachable"
                    : "…"}
            </span>
          </div>
          <div className="srow">
            <div>
              <b>Runtime</b>
              <p>
                {liveN ? `${liveN} plan executing now.` : "Nothing is executing right now."}
              </p>
            </div>
            <span className="sval">{liveN ? "running" : "idle"}</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>OS snapshot</h2>
            <p>StateInspector input — specialists/capabilities, active runs, pending gates.</p>
          </div>
          {!snap ? (
            <div className="srow">
              <div>
                <b>Loading…</b>
              </div>
            </div>
          ) : !snap.reachable ? (
            <div className="srow">
              <div>
                <b>Unreachable</b>
                <p>{snap.error}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="srow">
                <div>
                  <b>Pending gates</b>
                  <p>Human gates waiting in the OS.</p>
                </div>
                <span className="sval">{snap.state?.pending_gate_count ?? 0}</span>
              </div>
              <div className="srow">
                <div>
                  <b>Active runs</b>
                  <p>{(snap.state?.active_run_ids ?? []).join(", ") || "none"}</p>
                </div>
                <span className="sval">{snap.state?.active_run_ids.length ?? 0}</span>
              </div>
              <div className="srow">
                <div>
                  <b>Capabilities</b>
                  <p>
                    {(snap.capabilities ?? [])
                      .slice(0, 6)
                      .map((c) => c.display_name)
                      .join(", ") || "none listed"}
                  </p>
                </div>
                <span className="sval">{snap.capabilities?.length ?? 0}</span>
              </div>
              {snap.state?.overlapping_summaries?.length ? (
                <div className="srow">
                  <div>
                    <b>Overlap hints</b>
                    <p>{snap.state.overlapping_summaries.slice(0, 3).join(" · ")}</p>
                  </div>
                </div>
              ) : null}
              <div className="srow">
                <div>
                  <b>Raw</b>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{snap.state?.raw_summary}</p>
                </div>
              </div>
              <div className="srow">
                <button type="button" className="btn sec" onClick={() => void load()}>
                  Refresh snapshot
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
