import { useEffect, useState } from "react";
import { getConnection, getGoal } from "../api";
import { useJarvis } from "../store/JarvisProvider";
import { boardGoalIsComputerType } from "../store/mapApiGoal";
import type { Goal } from "../store/types";

function isComputerTypeGoal(toolIds: string[][]): boolean {
  const tools = toolIds.flat();
  return (
    tools.includes("computer.open_app") &&
    tools.includes("computer.type_text") &&
    !tools.includes("os.runtime.start_run")
  );
}

function inferComputerType(g: Goal): boolean {
  if (boardGoalIsComputerType(g)) return true;
  const blob = `${g.title} ${g.summary}`.toLowerCase();
  return /\bopen\b/.test(blob) && /\btype\b/.test(blob) && (/\bnotepad\b/.test(blob) || /\bcursor\b/.test(blob));
}

/** Strong-confirm before Live promote (LIVE for OS, OPEN for computer open→type). */
export function PromoteLiveDialog() {
  const { promoteTarget, cancelPromote, confirmPromoteLive, promoting, error } = useJarvis();
  const [typed, setTyped] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [adapter, setAdapter] = useState<string | null>(null);
  const [fromApi, setFromApi] = useState<boolean | null>(null);

  useEffect(() => {
    if (!promoteTarget) return;
    setTyped("");
    setFromApi(null);
    const id = promoteTarget.id;
    void getGoal(id)
      .then((detail) => {
        setFromApi(isComputerTypeGoal((detail.tasks ?? []).map((t) => t.tool_ids ?? [])));
      })
      .catch(() => {
        /* keep board heuristic */
      });
    void getConnection()
      .then((c) => {
        setProjectId(c.project_id);
        setAdapter(c.adapter);
      })
      .catch(() => {
        setProjectId(localStorage.getItem("jarvis.os_project_id"));
        setAdapter(null);
      });
  }, [promoteTarget?.id]);

  if (!promoteTarget) return null;

  const computerType = fromApi ?? inferComputerType(promoteTarget);
  const token = computerType ? "OPEN" : "LIVE";
  const ok = typed.trim() === token;
  const needsProject = !computerType && adapter === "umer-read";
  const canRun = ok && !promoting && (!needsProject || Boolean(projectId));

  return (
    <>
      <div className="scrim on" onClick={() => !promoting && cancelPromote()} />
      <div className="dlg on" role="dialog" aria-modal="true" aria-labelledby="promo-t">
        <div className="dlg-b">
          <h2 id="promo-t">Request Live execution?</h2>
          <p>
            This elevates <b>{promoteTarget.title}</b>
            {computerType
              ? " and will launch that app, then type into that window."
              : " and may call the Control API POST …/plan."}{" "}
            Shadow simulation is not enough — type <b>{token}</b> to confirm.
          </p>
          <div className="dlg-warn">
            {computerType
              ? "One OPEN confirm covers open + type into the launched process. Click/scroll stay blocked. Kill switch must be clear."
              : "Kill switch must be clear. Domains default SHADOW until you Strong-confirm this goal."}
            {!computerType && needsProject
              ? projectId
                ? ` Live project: ${projectId}`
                : " No project_id set — open Settings → Connection and pick a work-graph project first."
              : !computerType
                ? " Mock adapter will simulate Live only."
                : null}
          </div>
          <label style={{ display: "block", marginTop: 14, fontSize: 13 }}>
            Type {token} to authorize
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={promoting}
              autoFocus
              placeholder={token}
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
            onClick={() => void confirmPromoteLive(token)}
          >
            {promoting ? "Dispatching…" : "Run Live"}
          </button>
        </div>
      </div>
    </>
  );
}
