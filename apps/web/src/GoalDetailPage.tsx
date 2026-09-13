import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getEvidence,
  getGoal,
  type EvidenceNode,
  type GoalDetailResponse,
} from "./api";

const STORY_LABELS: Record<string, string> = {
  stimulus: "You stated an outcome",
  observation: "Checked current state",
  decision: "Formed a plan",
  policy_verdict: "Passed policy under Shadow",
  simulation: "Simulated next step",
  tool_invocation: "Shadow tool ran (no Live effect)",
  metric: "Recorded a measurement",
  expected_vs_actual: "Compared expected vs actual",
};

function label(kind: string) {
  return STORY_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function toolHuman(id: string) {
  if (id.includes("get_state")) return "Inspect workforce state";
  if (id.includes("start_run")) return "Propose an OS agent run";
  return id;
}

/** Phase 11 — Goal detail with progressive disclosure (existing CSS system). */
export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<GoalDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    Promise.all([getGoal(id), getEvidence(id)])
      .then(([d, e]) => {
        if (cancelled) return;
        setDetail(d);
        setEvidence(e.evidence);
        setRaw(e.evidence_json);
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

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="head">
          <div>
            <Link
              to="/goals"
              className="btn sec"
              style={{ textDecoration: "none", marginBottom: 12, display: "inline-flex" }}
            >
              ← Goals
            </Link>
            <h1>{goal.title}</h1>
            <p>{goal.outcome}</p>
          </div>
          <span className="chip c-shadow">Shadow · simulated</span>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>What JARVIS is doing</h2>
            <p>
              Trust {goal.trust_tier} · adapter {adapter} · domain {goal.domain}
            </p>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>How we’d get there</h2>
            <p>Proposals only — nothing dispatched to Umer AI OS.</p>
          </div>
          {objectives.map((o) => (
            <div className="srow" key={o.id}>
              <div>
                <b>{o.title}</b>
                <p>Success: {o.success_criteria}</p>
              </div>
            </div>
          ))}
          <ol className="gd-steps">
            {tasks.map((t, i) => (
              <li key={t.id}>
                <span className="gd-n">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <b>{t.title}</b>
                  <p>
                    {t.intent} · {t.tool_ids.map(toolHuman).join(", ")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>What we simulated</h2>
            <p>Shadow runs — no Live side effects.</p>
          </div>
          {runs.length === 0 ? (
            <div className="empty" style={{ border: 0, margin: 12 }}>
              No runs yet.
            </div>
          ) : (
            runs.map((r) => (
              <div className="srow" key={r.id}>
                <div>
                  <b>
                    {r.status} · {r.tool_invocations.map(toolHuman).join(" · ") || "Internal step"}
                  </b>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11.5 }}>
                    {r.os_run_id ?? "no os run"} · {r.mode}
                  </p>
                </div>
                <span className="chip c-shadow">simulated</span>
              </div>
            ))
          )}
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>What happened</h2>
            <p>Story of this Shadow plan. Technical details stay folded.</p>
          </div>
          <ul className="gd-story">
            {evidence.map((n: EvidenceNode) => (
              <li key={n.id}>
                <b>{label(n.kind)}</b>
                <p>{n.payload_summary}</p>
              </li>
            ))}
          </ul>
          <div className="srow" style={{ borderTop: "1px solid var(--line)" }}>
            <div>
              <b>Technical details</b>
              <p>Evidence JSON — progressive disclosure.</p>
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
