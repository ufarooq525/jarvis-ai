import { useEffect, useState } from "react";
import { getConnection } from "../api";
import { useJarvis } from "../store/JarvisProvider";

/** Phase E: Strong-confirm before Live promote (type LIVE). */
export function PromoteLiveDialog() {
  const { promoteTarget, cancelPromote, confirmPromoteLive, promoting, error } = useJarvis();
  const [typed, setTyped] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [adapter, setAdapter] = useState<string | null>(null);

  useEffect(() => {
    if (!promoteTarget) return;
    setTyped("");
    void getConnection()
      .then((c) => {
        setProjectId(c.project_id);
        setAdapter(c.adapter);
      })
      .catch(() => {
        setProjectId(localStorage.getItem("jarvis.os_project_id"));
        setAdapter(null);
      });
  }, [promoteTarget]);

  if (!promoteTarget) return null;

  const ok = typed.trim() === "LIVE";
  const needsProject = adapter === "umer-read";
  const canRun = ok && !promoting && (!needsProject || Boolean(projectId));

  return (
    <>
      <div className="scrim on" onClick={() => !promoting && cancelPromote()} />
      <div className="dlg on" role="dialog" aria-modal="true" aria-labelledby="promo-t">
        <div className="dlg-b">
          <h2 id="promo-t">Request Live execution?</h2>
          <p>
            This elevates <b>{promoteTarget.title}</b> and may call the Control API{" "}
            <code>POST …/plan</code>. Shadow simulation is not enough — type{" "}
            <b>LIVE</b> to confirm.
          </p>
          <div className="dlg-warn">
            Kill switch must be clear. Domains default SHADOW until you Strong-confirm this goal.
            {needsProject
              ? projectId
                ? ` Live project: ${projectId}`
                : " No project_id set — open Settings → Connection and pick a work-graph project first."
              : " Mock adapter will simulate Live only."}
          </div>
          <label style={{ display: "block", marginTop: 14, fontSize: 13 }}>
            Type LIVE to authorize
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={promoting}
              autoFocus
              placeholder="LIVE"
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
          {error ? (
            <p style={{ marginTop: 12, color: "var(--danger-ink)", fontSize: 13 }}>{error}</p>
          ) : null}
        </div>
        <div className="dlg-f">
          <button type="button" className="btn sec" disabled={promoting} onClick={cancelPromote}>
            Stay in Shadow
          </button>
          <button
            type="button"
            className="btn"
            disabled={!canRun}
            onClick={() => void confirmPromoteLive()}
          >
            {promoting ? "Dispatching…" : "Run Live"}
          </button>
        </div>
      </div>
    </>
  );
}
