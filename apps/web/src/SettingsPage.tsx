import { useEffect, useMemo, useState } from "react";
import {
  getOsSnapshot,
  getTrustStatus,
  listOsProjects,
  listTools,
  setConnection,
  setKillSwitch,
  type OsProjectOption,
  type OsSnapshotDto,
  type ToolManifestDto,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";

const LS_CONTROL = "jarvis.control_api_base";
const LS_PROJECT = "jarvis.os_project_id";

export function SettingsPage() {
  const { mode, setMode, requestLiveMode } = useJarvis();
  const [kill, setKill] = useState<{ engaged: boolean; reason: string | null }>({
    engaged: false,
    reason: null,
  });
  const [tiers, setTiers] = useState<Record<string, string>>({});
  const [tools, setTools] = useState<ToolManifestDto[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [snap, setSnap] = useState<OsSnapshotDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [controlBase, setControlBase] = useState(
    () => localStorage.getItem(LS_CONTROL) ?? "http://127.0.0.1:4000",
  );
  const [projectId, setProjectId] = useState(() => localStorage.getItem(LS_PROJECT) ?? "");
  const [workProjects, setWorkProjects] = useState<OsProjectOption[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showServerUrl, setShowServerUrl] = useState(false);

  const selectedProject = useMemo(
    () => workProjects.find((p) => p.project_id === projectId) ?? null,
    [workProjects, projectId],
  );

  const connected = snap?.adapter === "umer-read" && Boolean(snap?.reachable);
  const hasProject = snap?.adapter === "umer-read" && Boolean(projectId.trim());
  const stopOff = !kill.engaged;
  const ready = connected && hasProject && stopOff;

  async function fetchProjects(): Promise<string> {
    const list = await listOsProjects();
    setWorkProjects(list.work_projects ?? []);
    if (list.control_api) setControlBase(list.control_api);

    let nextId = projectId.trim();
    if (!nextId && list.selected_project_id) nextId = list.selected_project_id;
    if (!nextId && list.work_projects?.[0]?.project_id) {
      nextId = list.work_projects[0].project_id;
    }
    if (nextId) setProjectId(nextId);
    return nextId;
  }

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
      if (snapshot.control_api) setControlBase(snapshot.control_api);
      if (snapshot.project_id) {
        setProjectId(snapshot.project_id);
        localStorage.setItem(LS_PROJECT, snapshot.project_id);
      }
      if (snapshot.adapter === "umer-read") {
        try {
          await fetchProjects();
        } catch {
          /* listed below in status */
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function persist(opts: {
    adapter: "mock" | "umer-read";
    project_id?: string;
    control_api_base?: string;
  }) {
    const res = await setConnection({
      adapter: opts.adapter,
      control_api_base: (opts.control_api_base ?? controlBase.trim()) || undefined,
      project_id: opts.project_id,
    });
    const pid = opts.project_id?.trim();
    localStorage.setItem(LS_CONTROL, (opts.control_api_base ?? controlBase).trim());
    if (pid) localStorage.setItem(LS_PROJECT, pid);
    else if (opts.project_id === "") localStorage.removeItem(LS_PROJECT);
    const snapshot = await getOsSnapshot();
    setSnap(snapshot);
    return res;
  }

  async function connectUmer() {
    setBusy(true);
    try {
      setError(null);
      await persist({
        adapter: "umer-read",
        control_api_base: controlBase.trim(),
        project_id: projectId.trim() || undefined,
      });
      const picked = await fetchProjects();
      await persist({
        adapter: "umer-read",
        control_api_base: controlBase.trim(),
        project_id: picked || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Umer OS");
    } finally {
      setBusy(false);
    }
  }

  async function useMock() {
    setBusy(true);
    try {
      setError(null);
      await persist({ adapter: "mock" });
      setWorkProjects([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not switch to practice mode");
    } finally {
      setBusy(false);
    }
  }

  async function onPickProject(next: string) {
    setProjectId(next);
    if (snap?.adapter !== "umer-read") return;
    setBusy(true);
    try {
      setError(null);
      await persist({
        adapter: "umer-read",
        project_id: next.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save project");
    } finally {
      setBusy(false);
    }
  }

  async function toggleEmergencyStop() {
    try {
      const next = kill.engaged ? "clear" : "engage";
      const res = await setKillSwitch(
        next,
        next === "engage" ? "manual emergency stop from Settings" : undefined,
      );
      setKill(res.kill_switch);
      setConfirmStop(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Emergency stop update failed");
    }
  }

  const projectLabel = selectedProject?.name || (projectId ? projectId : "Not chosen yet");

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 740 }}>
        <div className="head">
          <div>
            <h1>Settings</h1>
            <p>Connect to Umer OS, pick a project, then you can run Live from the Board.</p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
        </div>

        <div
          className="panel"
          style={{
            borderColor: ready ? "var(--ok-line, var(--live-line))" : undefined,
          }}
        >
          <div
            className="panel-hd"
            style={{
              background: ready ? "var(--live-bg)" : kill.engaged ? "var(--danger-bg)" : undefined,
            }}
          >
            <h2>{ready ? "Ready for Live" : "Not ready for Live yet"}</h2>
            <p>
              {ready
                ? `JARVIS will use “${projectLabel}” when you type LIVE on the Board.`
                : "Finish the checklist below. You do not need to type any project id yourself."}
            </p>
          </div>
          <div className="srow">
            <div>
              <b>1. Connected to Umer OS</b>
              <p>
                {connected
                  ? "Yes — Umer AI OS is reachable."
                  : snap?.adapter === "umer-read"
                    ? snap.error || "Connected setting on, but OS is unreachable."
                    : "No — still in practice (Mock) mode."}
              </p>
            </div>
            <span className="sval">{connected ? "yes" : "no"}</span>
          </div>
          <div className="srow">
            <div>
              <b>2. Project chosen</b>
              <p>
                {hasProject
                  ? `Yes — ${projectLabel}. The id is saved automatically.`
                  : "No — pick a project in the next section."}
              </p>
            </div>
            <span className="sval">{hasProject ? "yes" : "no"}</span>
          </div>
          <div className="srow">
            <div>
              <b>3. Emergency stop</b>
              <p>
                {stopOff
                  ? "OFF — Live is allowed after you confirm."
                  : "ON — Live is blocked. Turn it OFF below to continue."}
              </p>
            </div>
            <span className="sval">{stopOff ? "off" : "ON"}</span>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Connect to Umer OS</h2>
            <p>Choose where JARVIS talks. Then pick which project Live should use.</p>
          </div>
          <div className="choice" style={{ marginBottom: 8 }}>
            <button
              type="button"
              className="opt"
              disabled={busy}
              aria-pressed={snap?.adapter !== "umer-read"}
              onClick={() => void useMock()}
            >
              <b>Practice (Mock)</b>
              <p>Fake OS for demos. Nothing real is sent.</p>
            </button>
            <button
              type="button"
              className="opt"
              disabled={busy}
              aria-pressed={snap?.adapter === "umer-read"}
              onClick={() => void connectUmer()}
            >
              <b>Umer OS (real)</b>
              <p>Connect to your running Umer AI OS.</p>
            </button>
          </div>

          <div className="srow" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
            <label style={{ fontSize: 13 }}>
              Which project should Live use?
              <select
                value={projectId}
                onChange={(e) => void onPickProject(e.target.value)}
                disabled={busy || snap?.adapter !== "umer-read"}
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 6,
                  padding: "10px 12px",
                  fontSize: 14,
                }}
              >
                <option value="">
                  {snap?.adapter === "umer-read"
                    ? workProjects.length
                      ? "Choose a project…"
                      : "No projects loaded — click Umer OS again"
                    : "Connect to Umer OS first"}
                </option>
                {workProjects.map((p) => (
                  <option key={p.project_id} value={p.project_id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            {hasProject ? (
              <p style={{ margin: 0, fontSize: 12.5, color: "var(--ink-2)" }}>
                Selected: <b>{projectLabel}</b>
                <span style={{ color: "var(--ink-3)" }}> — id saved automatically</span>
              </p>
            ) : null}
            <button
              type="button"
              className="btn sec"
              style={{ alignSelf: "flex-start" }}
              disabled={busy}
              onClick={() => setShowServerUrl((v) => !v)}
            >
              {showServerUrl ? "Hide server address" : "Change server address (advanced)"}
            </button>
            {showServerUrl ? (
              <label style={{ fontSize: 13 }}>
                Umer OS server
                <input
                  value={controlBase}
                  onChange={(e) => setControlBase(e.target.value)}
                  disabled={busy}
                  placeholder="http://127.0.0.1:4000"
                  style={{
                    display: "block",
                    width: "100%",
                    marginTop: 6,
                    padding: "10px 12px",
                    fontFamily: "var(--mono)",
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  className="btn"
                  style={{ marginTop: 8 }}
                  disabled={busy}
                  onClick={() => void connectUmer()}
                >
                  Save & reconnect
                </button>
              </label>
            ) : null}
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
            <h2 style={{ color: kill.engaged ? "var(--danger-ink)" : undefined }}>
              Emergency stop
            </h2>
            <p style={{ color: kill.engaged ? "var(--danger-ink)" : undefined }}>
              Big red brake for Live. Leave this OFF for normal use. Turn ON only if you want to
              freeze all real actions.
            </p>
          </div>
          <div className="srow">
            <div>
              <b>{kill.engaged ? "ON — Live is frozen" : "OFF — Live can run"}</b>
              <p>
                {kill.engaged
                  ? "Shadow planning still works. Turn OFF when you want Live again."
                  : "You still must type LIVE to confirm before anything real runs."}
              </p>
            </div>
            {!confirmStop ? (
              <button
                type="button"
                className={`btn${kill.engaged ? " sec" : " warn"}`}
                onClick={() => setConfirmStop(true)}
              >
                {kill.engaged ? "Turn emergency stop OFF" : "Turn emergency stop ON"}
              </button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="btn warn" onClick={() => void toggleEmergencyStop()}>
                  Confirm
                </button>
                <button type="button" className="btn sec" onClick={() => setConfirmStop(false)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="panel mode-panel">
          <div className="panel-hd">
            <h2>Default mode</h2>
            <p>What JARVIS prefers when you state an outcome.</p>
          </div>
          <div className="choice">
            <button
              type="button"
              className="opt"
              aria-pressed={mode === "shadow"}
              onClick={() => setMode("shadow")}
            >
              <b>Shadow</b>
              <p>Safe practice plan. Nothing real is written or sent.</p>
            </button>
            <button
              type="button"
              className="opt lv"
              aria-pressed={mode === "live"}
              onClick={() => requestLiveMode()}
            >
              <b>Live</b>
              <p>Still shows a plan and asks first. After LIVE confirm, it can run for real.</p>
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="srow">
            <div>
              <b>Advanced details</b>
              <p>Domain trust, tool list, and raw OS snapshot — for debugging only.</p>
            </div>
            <button
              type="button"
              className="btn sec"
              onClick={() => setShowAdvanced((v) => !v)}
            >
              {showAdvanced ? "Hide" : "Show"}
            </button>
          </div>
          {showAdvanced ? (
            <>
              <div className="panel-hd" style={{ borderTop: "1px solid var(--line)" }}>
                <h2>Domain trust</h2>
                <p>{note || "New domains default SHADOW."}</p>
              </div>
              {Object.entries(tiers).map(([domain, tier]) => (
                <div className="srow" key={domain}>
                  <div>
                    <b>{domain}</b>
                  </div>
                  <span className="chip c-shadow">{tier}</span>
                </div>
              ))}
              <div className="panel-hd" style={{ borderTop: "1px solid var(--line)" }}>
                <h2>Tool manifests</h2>
                <p>{tools.length} tools registered.</p>
              </div>
              {tools.slice(0, 8).map((t) => (
                <div className="srow" key={t.tool_id}>
                  <div>
                    <b>{t.display_name}</b>
                    <p>{t.tool_id}</p>
                  </div>
                  <span className="chip c-shadow">{t.required_trust_tier}</span>
                </div>
              ))}
              <div className="panel-hd" style={{ borderTop: "1px solid var(--line)" }}>
                <h2>OS snapshot</h2>
                <p>{snap?.state?.raw_summary ?? snap?.error ?? "No snapshot"}</p>
              </div>
              <div className="srow">
                <button type="button" className="btn sec" onClick={() => void load()}>
                  Refresh
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
