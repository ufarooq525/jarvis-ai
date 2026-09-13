import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getGoal,
  getTrustStatus,
  getWmNow,
  listEscalations,
  listJournal,
  type DecisionRecordDto,
  type EscalationDto,
  type GoalDetailResponse,
  type WmNowDto,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";
import { readsCount, writesCount, type Goal } from "./store/types";
import {
  deriveOperatorSnapshot,
  describeKeyResults,
  hourGreeting,
  operatorStateClass,
} from "./lib/operator-state";

function GoalCard({ goal, onOpen }: { goal: Goal; onOpen: () => void }) {
  const w = writesCount(goal);
  return (
    <button type="button" className="card" onClick={onOpen}>
      <div className="card-top">
        <span className={`dom ${goal.domain}`} />
        <span>{goal.domain}</span>
        <time>{goal.at}</time>
      </div>
      <h3>{goal.title}</h3>
      <p>{goal.summary}</p>
      {goal.stage === "shadow" ? (
        <div className="tags">
          <span className="tag">{goal.steps.length} steps</span>
          <span className="tag">reads {readsCount(goal)}</span>
          <span className={`tag${w ? " w" : ""}`}>writes {w}</span>
        </div>
      ) : null}
      <span className="act">
        {goal.stage === "shadow"
          ? "Review plan"
          : goal.stage === "live"
            ? "Open Live"
            : "Open"}
      </span>
    </button>
  );
}

/** JARVIS Command Center — operator narrative from real API/store data only. */
export function BoardPage() {
  const { byStage, openDrawer, loading, error, refresh, goals, mode } = useJarvis();
  const [now, setNow] = useState<WmNowDto | null>(null);
  const [pending, setPending] = useState<EscalationDto[]>([]);
  const [journal, setJournal] = useState<DecisionRecordDto[]>([]);
  const [focusDetail, setFocusDetail] = useState<GoalDetailResponse | null>(null);
  const [killOn, setKillOn] = useState(false);
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void Promise.all([
        getWmNow().catch(() => null),
        listEscalations("pending").catch(() => ({ escalations: [] as EscalationDto[] })),
        listJournal().catch(() => ({ journal: [] as DecisionRecordDto[] })),
        getTrustStatus().catch(() => null),
      ]).then(([n, e, j, trust]) => {
        if (cancelled) return;
        setApiOk(true);
        setNow(n);
        setPending(e?.escalations ?? []);
        setJournal((j?.journal ?? []).slice(0, 6));
        setKillOn(Boolean(trust?.kill_switch?.engaged));
      }).catch(() => {
        if (!cancelled) setApiOk(false);
      });
    };
    load();
    const t = window.setInterval(load, 12_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [goals.length]);

  const snap = deriveOperatorSnapshot({
    goals,
    mode,
    pendingEscalations: pending,
    now,
    apiOk,
    killEngaged: killOn,
  });

  const focusId = snap.focusGoal?.id;
  useEffect(() => {
    if (!focusId) {
      setFocusDetail(null);
      return;
    }
    let cancelled = false;
    void getGoal(focusId)
      .then((d) => {
        if (!cancelled) setFocusDetail(d);
      })
      .catch(() => {
        if (!cancelled) setFocusDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [focusId]);

  const krs = describeKeyResults(focusDetail);
  const shadowWaiting = byStage("shadow");
  const liveRunning = byStage("live");
  const recentDone = byStage("done-col").slice(0, 5);

  return (
    <div className="page cc-page">
      <div className="wrap cc-wrap">
        <header className="cc-hero">
          <div className={`cc-state ${operatorStateClass(snap.state)}`}>
            <span className="cc-state-dot" aria-hidden />
            <div>
              <b>{snap.label}</b>
              <span>
                · {snap.modeLabel}
              </span>
            </div>
          </div>
          <p className="cc-mode-hint">{snap.modeHint}</p>
          <h1>{hourGreeting()}</h1>
          <p className="cc-lead">{snap.sentence}</p>
          {error ? (
            <p style={{ color: "var(--danger-ink)", marginTop: 8 }}>
              {error}{" "}
              <button type="button" className="btn sec" onClick={() => void refresh()}>
                Retry
              </button>
            </p>
          ) : null}
        </header>

        {loading ? (
          <div className="empty" style={{ border: 0 }}>
            <span className="thinking">
              <span className="spin" />
              Loading real goals…
            </span>
          </div>
        ) : (
          <>
            <section className="panel cc-panel">
              <div className="panel-hd">
                <h2>Current work</h2>
                <p>From the Goal Engine — not decorative activity.</p>
              </div>
              {snap.focusGoal ? (
                <>
                  <div className="cc-focus">
                    <h3>{snap.focusGoal.title}</h3>
                    <p>{snap.focusGoal.summary}</p>
                    {snap.focusDetail ? <p className="cc-note">{snap.focusDetail}</p> : null}
                    {krs.length > 0 ? (
                      <ul className="cc-kr">
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
                    {focusDetail?.objectives[0] ? (
                      <p className="cc-obj">
                        Objective: {focusDetail.objectives[0].title}
                      </p>
                    ) : null}
                    <div className="cc-actions">
                      <Link className="btn" to={`/goals/${snap.focusGoal.id}`}>
                        Open goal
                      </Link>
                      <button
                        type="button"
                        className="btn sec"
                        onClick={() => openDrawer(snap.focusGoal!.id)}
                      >
                        Review plan
                      </button>
                    </div>
                  </div>
                  {snap.nextAction ? (
                    <div className="cc-next">
                      <b>Next</b>
                      <p>{snap.nextAction}</p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="empty" style={{ border: 0, margin: 12 }}>
                  JARVIS is idle. There is no active goal.
                </div>
              )}
            </section>

            <section className="panel cc-panel">
              <div className="panel-hd">
                <h2>Needs your attention</h2>
                <p>Only real pending decisions — never invented.</p>
              </div>
              {pending.length === 0 && shadowWaiting.length === 0 ? (
                <div className="empty" style={{ border: 0, margin: 12 }}>
                  Nothing needs you right now.
                </div>
              ) : (
                <>
                  {pending.map((e) => (
                    <div className="srow" key={e.id}>
                      <div>
                        <b>{e.title || "Approval required"}</b>
                        <p>{e.reason}</p>
                        <p className="cc-note">Nothing has been sent.</p>
                      </div>
                      <Link to="/approvals" className="btn">
                        Review
                      </Link>
                    </div>
                  ))}
                  {shadowWaiting.map((g) => (
                    <div className="srow" key={g.id}>
                      <div>
                        <b>Shadow plan ready — {g.title}</b>
                        <p>Simulated only. Review before any Live action.</p>
                      </div>
                      <button type="button" className="btn" onClick={() => openDrawer(g.id)}>
                        Review
                      </button>
                    </div>
                  ))}
                </>
              )}
            </section>

            <section className="panel cc-panel">
              <div className="panel-hd">
                <h2>Recently completed</h2>
                <p>Real journal decisions and finished goals.</p>
              </div>
              {journal.length === 0 && recentDone.length === 0 ? (
                <div className="empty" style={{ border: 0, margin: 12 }}>
                  Nothing completed yet.
                </div>
              ) : (
                <>
                  {journal.map((d) => (
                    <div className="srow" key={d.id}>
                      <div>
                        <b>{d.decision.replace(/_/g, " ")}</b>
                        <p>{d.why}</p>
                        {d.verification_passed != null ? (
                          <p className="cc-note">
                            Verification {d.verification_passed ? "passed" : "failed"}
                            {d.outcome ? ` · ${d.outcome}` : ""}
                          </p>
                        ) : null}
                      </div>
                      {d.goal_id ? (
                        <Link to={`/goals/${d.goal_id}`} className="btn sec">
                          Goal
                        </Link>
                      ) : null}
                    </div>
                  ))}
                  {recentDone.length > 0 && journal.length === 0
                    ? recentDone.map((g) => (
                        <div className="srow" key={g.id}>
                          <div>
                            <b>{g.title}</b>
                            <p>{g.summary}</p>
                            <p className="cc-note">
                              Finished in Shadow/Live store — open goal for evidence.
                            </p>
                          </div>
                          <Link to={`/goals/${g.id}`} className="btn sec">
                            Open
                          </Link>
                        </div>
                      ))
                    : null}
                </>
              )}
            </section>

            <section className="panel cc-panel cc-command">
              <div className="panel-hd">
                <h2>What should I work on?</h2>
                <p>State an outcome — JARVIS turns it into a goal. Prefer the composer below.</p>
              </div>
              <div className="cc-actions" style={{ padding: "0 16px 16px" }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => document.getElementById("say")?.focus()}
                >
                  State an outcome
                </button>
                <Link to="/goals" className="btn sec">
                  All goals
                </Link>
              </div>
            </section>

            <div className="cc-pipe-toggle">
              <button
                type="button"
                className="btn sec"
                onClick={() => setShowPipeline((v) => !v)}
              >
                {showPipeline ? "Hide pipeline board" : "Show pipeline board"}
              </button>
              <span>Kanban view of the same goals — optional.</span>
            </div>

            {showPipeline ? (
              <div className="board cc-board">
                {(["shadow", "live", "done"] as const).map((st) => {
                  const items =
                    st === "done" ? byStage("done-col") : st === "shadow" ? shadowWaiting : liveRunning;
                  return (
                    <section className="col" key={st}>
                      <div className={`col-hd${st === "shadow" ? " h-shadow" : st === "live" ? " h-live" : ""}`}>
                        <b>{st === "shadow" ? "Waiting review" : st === "live" ? "Live" : "Done"}</b>
                        <i>{items.length}</i>
                      </div>
                      <div className="track">
                        {items.length === 0 ? (
                          <div className="empty">Empty</div>
                        ) : (
                          items.map((g) => (
                            <GoalCard key={g.id} goal={g} onOpen={() => openDrawer(g.id)} />
                          ))
                        )}
                      </div>
                    </section>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
