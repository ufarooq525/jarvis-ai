import { useState } from "react";
import { Link } from "react-router-dom";
import { useJarvis } from "./store/JarvisProvider";
import type { Stage } from "./store/types";

const CHIP: Record<string, [string, string]> = {
  stated: ["c-stated", "Stated"],
  shadow: ["c-shadow", "Shadow plan"],
  live: ["c-live", "Live"],
  done: ["c-done", "Done"],
  failed: ["c-fail", "Rolled back"],
  discarded: ["c-done", "Discarded"],
};

const MET: Record<string, string> = {
  stated: "planning",
  shadow: "waiting on you",
  live: "running",
  done: "ran live",
  failed: "stopped",
  discarded: "never ran",
};

type Filter = "all" | "shadow" | "live" | "done";

export function GoalsPage() {
  const { goals, openDrawer, loading, error, refresh } = useJarvis();
  const [filter, setFilter] = useState<Filter>("all");

  const list = goals.filter((g) => {
    if (filter === "all") return true;
    if (filter === "done")
      return g.stage === "done" || g.stage === "failed" || g.stage === "discarded";
    return g.stage === filter;
  });

  return (
    <div className="page">
      <div className="wrap">
        <div className="head">
          <div>
            <h1>Goals</h1>
            <p>
              Every outcome you’ve stated and where each one got to. Loaded from the JARVIS API
              (Shadow / mock).
            </p>
            {error ? (
              <p style={{ color: "var(--danger-ink)", marginTop: 8 }}>
                {error}{" "}
                <button type="button" className="btn sec" onClick={() => void refresh()}>
                  Retry
                </button>
              </p>
            ) : null}
          </div>
          <Link to="/" className="btn sec" style={{ textDecoration: "none" }}>
            Open the board
          </Link>
        </div>

        <div className="filters">
          {(
            [
              ["all", "All"],
              ["shadow", "Needs you"],
              ["live", "Running"],
              ["done", "Done"],
            ] as const
          ).map(([f, label]) => (
            <button
              key={f}
              type="button"
              aria-pressed={filter === f}
              onClick={() => setFilter(f)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="list">
          {loading ? (
            <div className="empty" style={{ margin: 0, border: 0 }}>
              <span className="thinking">
                <span className="spin" />
                Loading…
              </span>
            </div>
          ) : list.length === 0 ? (
            <div className="empty" style={{ margin: 0, border: 0 }}>
              Nothing here — plan an outcome from the Board.
            </div>
          ) : (
            list.map((g, i) => {
              const c = CHIP[g.stage] ?? (["c-stated", "Stated"] as const);
              return (
                <button
                  type="button"
                  className="row"
                  key={g.id}
                  style={{ ["--d" as string]: `${Math.min(i * 30, 180)}ms` }}
                  onClick={() => openDrawer(g.id)}
                >
                  <span className={`chip ${c[0]}`}>{c[1]}</span>
                  <div>
                    <h3>{g.title}</h3>
                    <p>{g.summary}</p>
                  </div>
                  <div className="row-meta">
                    <b>{MET[g.stage]}</b>
                    {g.at}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
