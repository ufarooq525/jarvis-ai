import { useEffect, useRef, useState } from "react";
import {
  getEvidence,
  getGoal,
  listTools,
  type EvidenceNode,
  type RunRow,
  type ToolManifestDto,
} from "../api";
import { useJarvis } from "../store/JarvisProvider";
import type { Goal, Stage } from "../store/types";

const CHIP: Record<Stage, [string, string]> = {
  stated: ["c-stated", "Stated"],
  shadow: ["c-shadow", "Shadow plan"],
  live: ["c-live", "Live"],
  done: ["c-done", "Done"],
  failed: ["c-fail", "Rolled back"],
  discarded: ["c-done", "Discarded"],
};

const STORY: Record<string, string> = {
  stimulus: "You stated an outcome",
  observation: "Checked current state",
  decision: "Formed a plan",
  policy_verdict: "Passed policy",
  simulation: "Simulated a step",
  tool_invocation: "Tool ran (Shadow / noop)",
  metric: "Recorded a measurement",
  expected_vs_actual: "Compared expected vs actual",
};

function provenance(g: Goal): string {
  switch (g.stage) {
    case "stated":
      return `You typed this at ${g.at}. Details appear after Plan it finishes and the card moves to “Shadow plan”.`;
    case "shadow":
      return `${g.steps.length} steps. Simulated at ${g.at} against a copy of your data.`;
    case "live":
      return `You approved this at ${g.approvedAt ?? g.at}. Step ${g.progress} of ${g.steps.length}.`;
    case "done":
      return `Ran live on ${g.at}.`;
    case "failed":
      return `Stopped on ${g.at}. Everything was rolled back.`;
    case "discarded":
      return `You discarded this at review on ${g.at}.`;
  }
}

export function PlanDrawer() {
  const { goals, drawerId, closeDrawer, approve, discard, stopLive } = useJarvis();
  const closeRef = useRef<HTMLButtonElement>(null);
  const g = goals.find((x) => x.id === drawerId) ?? null;
  const open = Boolean(g);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [trustTier, setTrust] = useState<string>("SHADOW");
  const [tools, setTools] = useState<ToolManifestDto[]>([]);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);

  useEffect(() => {
    if (!open || !g || g.source === "local" || g.id.startsWith("pending")) {
      setRuns([]);
      setEvidence([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [detail, toolRes, ev] = await Promise.all([
          getGoal(g.id),
          listTools(),
          getEvidence(g.id).catch(() => ({ evidence: [] as EvidenceNode[] })),
        ]);
        if (cancelled) return;
        setRuns(detail.runs ?? []);
        setTrust(detail.goal.trust_tier ?? "SHADOW");
        setTools(toolRes.tools);
        setEvidence(ev.evidence ?? []);
      } catch {
        if (!cancelled) {
          setRuns([]);
          setEvidence([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, g?.id, g?.source]);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeDrawer]);

  if (!g) return null;

  const [chipCls, chipLabel] = CHIP[g.stage];
  const label =
    g.stage === "shadow"
      ? "What it would do"
      : g.stage === "live"
        ? "What it is doing"
        : "What it did";

  let primary = "Open";
  let primarySec = false;
  if (g.stage === "stated") {
    primary = "Cancel this goal";
    primarySec = true;
  } else if (g.stage === "shadow") primary = "Request Live execution";
  else if (g.stage === "live") {
    primary = "Stop and roll back";
    primarySec = true;
  } else if (g.stage === "done")
    primary = g.needsAttention
      ? `Resolve the ${g.needsAttention} open lines`
      : "Open the result";
  else if (g.stage === "failed") primary = "Retry with a fix";
  else if (g.stage === "discarded") primary = "Plan it again";

  function onPrimary() {
    if (g!.stage === "shadow") approve(g!.id);
    else if (g!.stage === "live") stopLive(g!.id);
    else closeDrawer();
  }

  const writeTools = tools
    .filter((t) => t.effects.includes("write") || t.effects.includes("external"))
    .map((t) => t.tool_id)
    .slice(0, 2)
    .join(", ");

  return (
    <>
      <div className={`scrim${open ? " on" : ""}`} onClick={closeDrawer} />
      <aside
        className={`drawer${open ? " on" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="dr-title"
      >
        <div className="dr-hd">
          <div className="dr-top">
            <span className={`chip ${chipCls}`}>{chipLabel}</span>
            <button
              type="button"
              className="ico"
              ref={closeRef}
              aria-label="Close"
              onClick={closeDrawer}
            >
              ✕
            </button>
          </div>
          <h2 id="dr-title">{g.title}</h2>
          <p>{provenance(g)}</p>
        </div>

        <div className="dr-body">
          <p className="dr-label">{label}</p>
          {g.steps.length === 0 ? (
            <div className="step">
              <i>—</i>
              <span className="thinking">
                {g.stage === "stated" ? (
                  <>
                    No steps yet. Wait for <b>Plan it</b> to finish — then open the card in the{" "}
                    <b>Shadow plan</b> column.
                  </>
                ) : (
                  <>
                    <span className="spin" />
                    drafting the plan…
                  </>
                )}
              </span>
              <em>{g.stage === "stated" ? "waiting" : "working"}</em>
            </div>
          ) : (
            g.steps.map((s, i) => {
              const n = String(i + 1).padStart(2, "0");
              const running = g.stage === "live" && (g.progress ?? 0) === i + 1;
              const pend = g.stage === "live" && (g.progress ?? 0) < i + 1;
              return (
                <div className={`step${pend ? " pend" : ""}`} key={`${g.id}-${i}`}>
                  <i>{n}</i>
                  <span>{s.text}</span>
                  <em className={running ? "r" : s.effect === "writes" ? "w" : undefined}>
                    {running ? "running" : s.effect}
                  </em>
                </div>
              );
            })
          )}

          {evidence.length > 0 ? (
            <div className="effects">
              <h4>What happened (evidence)</h4>
              {evidence.map((n) => (
                <div key={n.id} style={{ marginBottom: 8 }}>
                  <span style={{ display: "block", fontWeight: 600 }}>
                    {STORY[n.kind] ?? n.kind}
                  </span>
                  <b style={{ fontWeight: 400, fontSize: 12, opacity: 0.8 }}>
                    {n.payload_summary}
                  </b>
                </div>
              ))}
            </div>
          ) : null}

          <div className="effects">
            <h4>{g.stage === "shadow" ? "If you approve this" : "What this touched"}</h4>
            {g.effects ? (
              <>
                <div>
                  <span>Files written</span>
                  <b className={Number(g.effects.filesWritten) > 0 ? "hot" : undefined}>
                    {g.effects.filesWritten}
                  </b>
                </div>
                <div>
                  <span>Messages sent</span>
                  <b>{g.effects.messagesSent}</b>
                </div>
                <div>
                  <span>Anything deleted</span>
                  <b>{g.effects.deletes}</b>
                </div>
                <div>
                  <span>Reversible</span>
                  <b>{g.effects.reversible}</b>
                </div>
              </>
            ) : (
              <div>
                <span>Not known yet</span>
                <b>—</b>
              </div>
            )}
          </div>

          <div className="effects">
            <h4>Trust & firewall</h4>
            <div>
              <span>Domain trust</span>
              <b>{trustTier}</b>
            </div>
            {runs[0] ? (
              <>
                <div>
                  <span>Delegation</span>
                  <b style={{ fontSize: 11 }}>{runs[0].delegation_chain.join(" → ")}</b>
                </div>
                <div>
                  <span>Policy verdict</span>
                  <b style={{ fontSize: 11 }}>{runs[0].policy_verdict_id}</b>
                </div>
              </>
            ) : (
              <div>
                <span>Runs</span>
                <b>none yet</b>
              </div>
            )}
            {writeTools ? (
              <div>
                <span>Write tools</span>
                <b style={{ fontSize: 11 }}>{writeTools}</b>
              </div>
            ) : null}
          </div>
        </div>

        <div className="dr-foot">
          <button type="button" className={`btn${primarySec ? " sec" : ""}`} onClick={onPrimary}>
            {primary}
          </button>
          <div className="dr-alt">
            <button type="button" className="btn sec">
              Edit a step
            </button>
            {g.stage === "shadow" ? (
              <button type="button" className="btn sec" onClick={() => discard(g.id)}>
                Discard plan
              </button>
            ) : (
              <button type="button" className="btn sec" onClick={closeDrawer}>
                Close
              </button>
            )}
          </div>
          <p className="dr-note">
            Approval applies to this plan only. It is never remembered for next time.
          </p>
        </div>
      </aside>
    </>
  );
}
