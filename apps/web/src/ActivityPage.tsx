import { useEffect, useState } from "react";
import {
  getReplay,
  listJournal,
  type DecisionRecordDto,
  type EvidenceNode,
  type ReplayResponse,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";

const STORY_LABELS: Record<string, string> = {
  stimulus: "You stated an outcome",
  observation: "Checked current state",
  decision: "Formed a plan",
  policy_verdict: "Passed policy under Shadow",
  simulation: "Simulated next step",
  tool_invocation: "Shadow tool ran (no Live effect)",
  metric: "Recorded a measurement",
  expected_vs_actual: "Compared expected vs actual",
  raw_result: "Raw result captured",
};

function storyLabel(kind: string) {
  return STORY_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function downloadJson(filename: string, text: string) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function outcomeKind(outcome: string): string {
  if (outcome === "act") return "sh";
  if (outcome === "escalate") return "lv";
  if (outcome === "do_not_act" || outcome === "merge_into_existing") return "dn";
  return "";
}

export function ActivityPage() {
  const { openDrawer } = useJarvis();
  const [journal, setJournal] = useState<DecisionRecordDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayResponse | null>(null);
  const [replayErr, setReplayErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listJournal()
      .then((res) => {
        if (!cancelled) {
          setJournal(res.journal);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!selected) {
      setReplay(null);
      return;
    }
    let cancelled = false;
    setReplayErr(null);
    getReplay(selected)
      .then((r) => {
        if (!cancelled) setReplay(r);
      })
      .catch((e: Error) => {
        if (!cancelled) setReplayErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 960 }}>
        <div className="head">
          <div>
            <h1>Activity</h1>
            <p>
              Decision journal from the durable sidecar. Open a row for the evidence timeline and
              export a replay file.
            </p>
          </div>
        </div>

        {error ? (
          <div className="empty" style={{ border: 0, color: "var(--danger, #b33)" }}>
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="empty" style={{ border: 0 }}>
            Loading journal…
          </div>
        ) : journal.length === 0 ? (
          <div className="empty" style={{ border: 0 }}>
            No decisions yet — run a Shadow plan from the Board.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            <div>
              {journal.map((row) => (
                <button
                  key={row.id}
                  type="button"
                  className="ev"
                  aria-pressed={selected === row.id}
                  onClick={() => setSelected(row.id)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    outline: selected === row.id ? "1px solid var(--ink, #222)" : undefined,
                  }}
                >
                  <time style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                    {row.outcome}
                  </time>
                  <span className={`ev-dot ${outcomeKind(row.outcome)}`} />
                  <div>
                    <b>{row.decision.replace(/_/g, " ")}</b>
                    <p>{row.why}</p>
                    {row.actual ? <span className="fx">{row.actual}</span> : null}
                  </div>
                </button>
              ))}
            </div>

            <div>
              {!selected ? (
                <div className="empty" style={{ border: 0 }}>
                  Select a decision to replay
                </div>
              ) : replayErr ? (
                <div className="empty" style={{ border: 0 }}>
                  {replayErr}
                </div>
              ) : !replay ? (
                <div className="empty" style={{ border: 0 }}>
                  Loading replay…
                </div>
              ) : (
                <ReplayPanel
                  replay={replay}
                  onOpenGoal={() => replay.goal?.id && openDrawer(replay.goal.id)}
                  onExport={() =>
                    downloadJson(`replay-${replay.decision.id}.json`, replay.replay_json)
                  }
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ReplayPanel({
  replay,
  onOpenGoal,
  onExport,
}: {
  replay: ReplayResponse;
  onOpenGoal: () => void;
  onExport: () => void;
}) {
  const evidence: EvidenceNode[] = replay.evidence;
  return (
    <div>
      <div className="head" style={{ marginBottom: 12 }}>
        <div>
          <h2 style={{ fontSize: 18, margin: 0 }}>
            {replay.goal?.title ?? replay.decision.decision}
          </h2>
          <p style={{ marginTop: 4 }}>{replay.decision.why}</p>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button type="button" className="btn sec" onClick={onExport}>
          Export replay JSON
        </button>
        {replay.goal ? (
          <button type="button" className="btn sec" onClick={onOpenGoal}>
            Open on Board
          </button>
        ) : null}
      </div>
      <p className="dr-label" style={{ marginBottom: 8 }}>
        Evidence timeline
      </p>
      {evidence.map((n) => (
        <div className="step" key={n.id} style={{ marginBottom: 6 }}>
          <i>{n.kind.slice(0, 2)}</i>
          <span>
            <b style={{ fontWeight: 600 }}>{storyLabel(n.kind)}</b>
            <br />
            <span style={{ opacity: 0.75 }}>{n.payload_summary}</span>
          </span>
          <em>{n.at.slice(11, 19)}</em>
        </div>
      ))}
    </div>
  );
}
