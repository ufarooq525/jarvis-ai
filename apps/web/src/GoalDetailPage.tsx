import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getEvidence,
  getGoal,
  listEscalations,
  type EscalationDto,
  type EvidenceNode,
  type GoalDetailResponse,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";
import {
  describeKeyResults,
  humanEvidenceKind,
  humanTool,
  taskStatusMark,
} from "./lib/operator-state";

function statusHuman(goal: GoalDetailResponse["goal"]): { label: string; note: string } {
  if (goal.mode === "live" && goal.status !== "done" && goal.status !== "failed") {
    return {
      label: "Working · Live",
      note: "May affect connected systems. Watch evidence and Live status.",
    };
  }
  if (goal.status === "failed") {
    return { label: "Failed", note: "Something stopped. See evidence and replan if needed." };
  }
  if (goal.status === "blocked") {
    return {
      label: "Blocked",
      note: "The outcome was not achieved. Evidence shows what was tried — this is not success.",
    };
  }
  if (goal.status === "cancelled") {
    return { label: "Cancelled", note: "This goal was cancelled." };
  }
  if (goal.status === "done" || goal.status === "succeeded") {
    return {
      label: goal.mode === "live" ? "Completed · Live" : "Completed · Shadow",
      note:
        goal.mode === "shadow"
          ? "Shadow finished the simulated lifecycle. That is not proof the real-world outcome happened."
          : "Live path finished according to JARVIS records — verify evidence before trusting results.",
    };
  }
  if (goal.mode === "shadow") {
    return {
      label: "Waiting · Shadow",
      note: "Plan is simulated. Nothing reached the outside world.",
    };
  }
  return { label: goal.status, note: "" };
}

/** Goal Detail as mission control — real goal/tasks/runs/evidence only. */
export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { openDrawer, approve } = useJarvis();
  const [detail, setDetail] = useState<GoalDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);
  const [raw, setRaw] = useState("");
  const [pending, setPending] = useState<EscalationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);
  const [showHow, setShowHow] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([getGoal(id), getEvidence(id), listEscalations("pending")])
      .then(([d, e, esc]) => {
        if (cancelled) return;
        setDetail(d);
        setEvidence(e.evidence);
        setRaw(e.evidence_json);
        setPending((esc.escalations ?? []).filter((x) => x.goal_id === id));
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (error) {
    return (
      <div className="page">
        <div className="wrap" style={{ maxWidth: 860 }}>
          <p style={{ color: "var(--danger-ink)" }}>{error}</p>
          <Link to="/goals" className="btn sec" style={{ textDecoration: "none", marginTop: 12 }}>
            Back to Goals
          </Link>
        </div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="page">
        <div className="wrap" style={{ maxWidth: 860 }}>
          <div className="empty" style={{ border: 0 }}>
            <span className="thinking">
              <span className="spin" />
              Loading goal…
            </span>
          </div>
        </div>
      </div>
    );
  }

  const { goal, tasks, runs, objectives, adapter } = detail;
  const st = statusHuman(goal);
  const krs = describeKeyResults(detail);
  const currentTask =
    tasks.find((t) => taskStatusMark(t.status) === "current") ??
    tasks.find((t) => taskStatusMark(t.status) === "todo");
  const doneTasks = tasks.filter((t) => taskStatusMark(t.status) === "done").length;
  const nextTask = tasks.find((t) => taskStatusMark(t.status) === "todo");

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="head">
          <div>
            <Link
              to="/"
              className="btn sec"
              style={{ textDecoration: "none", marginBottom: 12, display: "inline-flex" }}
            >
              ← Command center
            </Link>
            <p className="cc-eyebrow">Goal</p>
            <h1>{goal.title}</h1>
            <p>{goal.outcome}</p>
          </div>
          <span className={`chip ${goal.mode === "live" ? "c-live" : "c-shadow"}`}>{st.label}</span>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Status</h2>
            <p>{st.note}</p>
          </div>
          {krs.length > 0 ? (
            <ul className="cc-kr" style={{ padding: "0 16px 12px" }}>
              {krs.map((kr) => (
                <li key={kr.label}>
                  <b>{kr.label}</b>
                  <span>
                    {kr.current} / {kr.target}
                  </span>
                  {kr.note ? <em>{kr.note}</em> : null}
                </li>
              ))}
            </ul>
          ) : null}
          {objectives[0] ? (
            <div className="srow">
              <div>
                <b>Objective</b>
                <p>
                  {objectives[0].title}
                  {objectives[0].success_criteria
                    ? ` — ${objectives[0].success_criteria}`
                    : ""}
                </p>
              </div>
            </div>
          ) : null}
          <div className="srow">
            <div>
              <b>Currently</b>
              <p>
                {currentTask
                  ? `${currentTask.title} (${currentTask.status})`
                  : goal.status === "done"
                    ? "Nothing in progress — goal recorded as finished."
                    : "No active task."}
              </p>
            </div>
            <span className="sval">
              {doneTasks}/{tasks.length} tasks
            </span>
          </div>
        </div>

        {pending.length > 0 ? (
          <div className="panel">
            <div className="panel-hd">
              <h2>Needs approval</h2>
              <p>Why you are being interrupted for this goal.</p>
            </div>
            {pending.map((e) => (
              <div className="srow" key={e.id}>
                <div>
                  <b>{e.title || e.tool_id}</b>
                  <p>{e.reason}</p>
                  <p className="cc-note">Nothing has been sent.</p>
                </div>
                <Link to="/approvals" className="btn">
                  Review
                </Link>
              </div>
            ))}
          </div>
        ) : null}

        <div className="panel">
          <div className="panel-hd">
            <h2>Plan</h2>
            <p>Tasks JARVIS created for this outcome.</p>
          </div>
          <ol className="gd-steps">
            {tasks.map((t) => {
              const mark = taskStatusMark(t.status);
              const glyph = mark === "done" ? "✓" : mark === "current" ? "→" : mark === "fail" ? "×" : "○";
              return (
                <li key={t.id}>
                  <span className="gd-n">{glyph}</span>
                  <div>
                    <b>{t.title}</b>
                    <p>
                      {t.intent} · {t.tool_ids.map(humanTool).join(", ")}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Recent activity</h2>
            <p>What JARVIS recorded — human summary first.</p>
          </div>
          {evidence.length === 0 ? (
            <div className="empty" style={{ border: 0, margin: 12 }}>
              No evidence yet.
            </div>
          ) : (
            <ul className="gd-story">
              {evidence.slice(0, 12).map((n) => (
                <li key={n.id}>
                  <b>{humanEvidenceKind(n.kind)}</b>
                  <p>{n.payload_summary}</p>
                  {n.simulated ? <p className="cc-note">SHADOW · simulated · no external action</p> : null}
                </li>
              ))}
            </ul>
          )}
          <div className="srow">
            <div>
              <b>How?</b>
              <p>Capability path behind this work.</p>
            </div>
            <button type="button" className="btn sec" onClick={() => setShowHow((v) => !v)}>
              {showHow ? "Hide" : "Show"}
            </button>
          </div>
          {showHow ? (
            <div className="srow" style={{ display: "block" }}>
              <p style={{ margin: 0, fontSize: 13.5, color: "var(--ink-2)" }}>
                {runs.length
                  ? runs
                      .map(
                        (r) =>
                          `${r.mode} run · ${r.tool_invocations.map(humanTool).join(" → ") || "internal"} · ${r.status}`,
                      )
                      .join(" · ")
                  : "No runs recorded."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Next</h2>
            <p>
              {nextTask
                ? `Next task: ${nextTask.title}`
                : goal.mode === "shadow" && goal.status === "done"
                  ? "If you want real execution, request Live and type LIVE — only after reviewing the plan."
                  : "No further tasks queued."}
            </p>
          </div>
          <div className="cc-actions" style={{ padding: "0 16px 16px" }}>
            <button type="button" className="btn sec" onClick={() => openDrawer(goal.id)}>
              Open plan drawer
            </button>
            {goal.mode === "shadow" ? (
              <button type="button" className="btn" onClick={() => approve(goal.id)}>
                Request Live…
              </button>
            ) : null}
            <Link to="/activity" className="btn sec">
              Journal
            </Link>
          </div>
        </div>

        <div className="panel">
          <div className="srow">
            <div>
              <b>Technical details</b>
              <p>
                Adapter {adapter} · trust {goal.trust_tier} · domain {goal.domain}
              </p>
            </div>
            <button type="button" className="btn sec" onClick={() => setShowTech((v) => !v)}>
              {showTech ? "Hide" : "Show"}
            </button>
          </div>
          {showTech ? <pre className="gd-raw">{raw}</pre> : null}
        </div>
      </div>
    </div>
  );
}
