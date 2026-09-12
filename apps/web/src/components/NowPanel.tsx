import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWmNow, type WmNowDto } from "../api";
import { useJarvis } from "../store/JarvisProvider";

export function NowPanel() {
  const { openDrawer, goals } = useJarvis();
  const [now, setNow] = useState<WmNowDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void getWmNow()
        .then((n) => {
          if (!cancelled) setNow(n);
        })
        .catch(() => {
          if (!cancelled) setNow(null);
        });
    };
    load();
    const t = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [goals.length]);

  if (!now) return null;

  return (
    <div className="panel" style={{ marginBottom: 18 }}>
      <div className="panel-hd">
        <h2 style={{ fontSize: 15, margin: 0 }}>Now</h2>
        <p style={{ margin: 0 }}>World Model STM — active goal, approvals, OS runs.</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 0 }}>
        <button
          type="button"
          className="srow"
          style={{ textAlign: "left", background: "transparent", border: 0, cursor: "pointer" }}
          onClick={() => now.active_goal && openDrawer(now.active_goal.entity_id)}
        >
          <div>
            <b>Active goal</b>
            <p>{now.active_goal?.title ?? "None"}</p>
          </div>
          {now.active_goal ? (
            <span className="chip c-shadow">{Math.round(now.active_goal.confidence * 100)}%</span>
          ) : (
            <span className="sval">—</span>
          )}
        </button>
        <Link to="/approvals" className="srow" style={{ textDecoration: "none", color: "inherit" }}>
          <div>
            <b>Open approvals</b>
            <p>{now.open_approvals.length ? "Waiting on you" : "Inbox clear"}</p>
          </div>
          <span className="sval">{now.open_approvals.length}</span>
        </Link>
        <div className="srow">
          <div>
            <b>OS runs</b>
            <p>
              {now.pending_gates ? `${now.pending_gates} gates` : "No pending gates"} ·{" "}
              {now.adapter}
            </p>
          </div>
          <span className="sval">{now.os_run_count}</span>
        </div>
      </div>
    </div>
  );
}
