import { useEffect, useRef, type ReactNode } from "react";
import { useJarvis } from "./store/JarvisProvider";
import { readsCount, writesCount, type Goal } from "./store/types";

const COL = {
  stated: "Stated",
  shadow: "Shadow plan",
  live: "Live",
  done: "Done",
} as const;

const GLOSS = {
  stated: "you said it",
  shadow: "simulated only",
  live: "running for real",
  done: "last 7 days",
} as const;

const EMPTY = {
  stated: "State an outcome below",
  shadow: "Nothing waiting on you",
  live: "Nothing running",
  done: "Nothing finished yet",
} as const;

function hourGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const seenKeys = new Set<string>();
const seenIds = new Set<string>();

function animationClass(id: string, stage: string): string {
  const key = `${id}:${stage}`;
  if (seenKeys.has(key)) return "";
  const cls = seenIds.has(id) ? " cross" : " enter";
  seenKeys.add(key);
  seenIds.add(id);
  return cls;
}

function GoalCard({ goal, index, onOpen }: { goal: Goal; index: number; onOpen: () => void }) {
  const anim = animationClass(goal.id, goal.stage);
  const leave = goal.leaving ? " leave" : "";
  const delay = Math.min(index * 45, 200);

  useEffect(() => {
    const onEnd = (e: AnimationEvent) => {
      const t = e.target as HTMLElement;
      t.classList.remove("enter", "cross", "bump", "flash");
    };
    document.addEventListener("animationend", onEnd);
    return () => document.removeEventListener("animationend", onEnd);
  }, []);

  const top = (
    <div className="card-top">
      <span className={`dom ${goal.domain}`} />
      <span>{goal.domain}</span>
      <time>{goal.at}</time>
    </div>
  );

  let body: ReactNode = null;
  let extraClass = "";

  if (goal.stage === "stated") {
    body = (
      <>
        {top}
        <h3>{goal.title}</h3>
        <p>{goal.summary}</p>
        <span className="thinking">
          <span className="spin" />
          working out the steps…
        </span>
      </>
    );
  } else if (goal.stage === "shadow") {
    const w = writesCount(goal);
    body = (
      <>
        {top}
        <h3>{goal.title}</h3>
        <p>{goal.summary}</p>
        <div className="tags">
          <span className="tag">{goal.steps.length} steps</span>
          <span className="tag">reads {readsCount(goal)}</span>
          <span className={`tag${w ? " w" : ""}`}>writes {w}</span>
        </div>
        <span className="act">Review and approve</span>
      </>
    );
  } else if (goal.stage === "live") {
    const prog = goal.progress ?? 1;
    const pc = Math.round((prog / goal.steps.length) * 100);
    const stepText = goal.steps[prog - 1]?.text.toLowerCase() ?? "";
    body = (
      <>
        {top}
        <h3>{goal.title}</h3>
        <p>{goal.summary}</p>
        <div className="bar">
          <span style={{ width: `${pc}%` }} />
        </div>
        <p className="run">
          <span className="pulse" />
          Step {prog} of {goal.steps.length} — {stepText}
        </p>
        <span className="act sec">Stop and roll back</span>
      </>
    );
  } else if (goal.stage === "failed") {
    extraClass = " done fail";
    body = (
      <>
        {top}
        <h3>{goal.title}</h3>
        <p>{goal.summary}</p>
        <div className="tags">
          <span className="tag w">rolled back</span>
        </div>
        <span className="act sec">See why</span>
      </>
    );
  } else if (goal.stage === "discarded") {
    extraClass = " done";
    body = (
      <>
        {top}
        <h3>{goal.title}</h3>
        <p>You discarded this plan at review. It never ran.</p>
      </>
    );
  } else {
    extraClass = " done";
    body = (
      <>
        {top}
        <h3>{goal.title}</h3>
        <p>{goal.summary}</p>
        {goal.needsAttention ? (
          <>
            <div className="tags">
              <span className="tag w">{goal.needsAttention} need you</span>
            </div>
            <span className="act sec">Resolve {goal.needsAttention}</span>
          </>
        ) : null}
      </>
    );
  }

  return (
    <button
      type="button"
      className={`card${extraClass}${anim}${leave}`}
      style={{ ["--d" as string]: `${delay}ms` }}
      onClick={onOpen}
    >
      {body}
    </button>
  );
}

export function BoardPage() {
  const { byStage, openDrawer, liveFlash, loading, error, refresh, goals } = useJarvis();
  const shadowN = byStage("shadow").length;
  const liveN = byStage("live").length;
  const prev = useRef<number[]>([]);

  const subtitle =
    loading
      ? "Loading plans from JARVIS API…"
      : shadowN === 0
        ? liveN
          ? `Nothing waiting on you. ${liveN} plan running live.`
          : goals.length === 0
            ? "Nothing waiting on you. State an outcome below to run a Shadow plan."
            : "Nothing waiting on you."
        : `${shadowN} plan${shadowN > 1 ? "s are" : " is"} waiting in review. A plan only becomes real when you move it right.`;

  useEffect(() => {
    const badges = document.querySelectorAll(".col-hd i");
    badges.forEach((n, ix) => {
      const text = n.textContent ?? "";
      if (prev.current[ix] !== undefined && String(prev.current[ix]) !== text) {
        n.classList.add("bump");
      }
      prev.current[ix] = Number(text);
    });
  }, [shadowN, liveN, byStage]);

  return (
    <div className="page">
      <div className="head">
        <div>
          <h1>
            {hourGreeting()}, Umer
          </h1>
          <p>{subtitle}</p>
          {error ? (
            <p style={{ color: "var(--danger-ink)", marginTop: 8, fontSize: 13.5 }}>
              {error}{" "}
              <button type="button" className="btn sec" style={{ padding: "4px 10px" }} onClick={() => void refresh()}>
                Retry
              </button>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => document.getElementById("say")?.focus()}
        >
          State an outcome
        </button>
      </div>

      {loading ? (
        <div className="empty" style={{ maxWidth: 420, margin: "40px auto" }}>
          <span className="thinking">
            <span className="spin" />
            Loading goals from :3020…
          </span>
        </div>
      ) : (
      <div className="board">
        {(["stated", "shadow", "live", "done"] as const).map((st) => {
          const items = st === "done" ? byStage("done-col") : byStage(st);
          const hc = st === "shadow" ? " h-shadow" : st === "live" ? " h-live" : "";
          const track =
            st === "shadow" ? "t-shadow" : st === "live" ? `t-live${liveFlash ? " flash" : ""}` : "";
          return (
            <section className="col" key={st}>
              <div className={`col-hd${hc}`}>
                <b>{COL[st]}</b>
                <i>{items.length}</i>
                <u>{GLOSS[st]}</u>
              </div>
              <div className={`track ${track}`}>
                {items.length === 0 ? (
                  <div className="empty">{EMPTY[st]}</div>
                ) : (
                  items.map((g, i) => (
                    <GoalCard key={g.id} goal={g} index={i} onOpen={() => openDrawer(g.id)} />
                  ))
                )}
                {st === "done" && items.length > 0 ? (
                  <div className="empty">Earlier finished plans stay here</div>
                ) : null}
              </div>
            </section>
          );
        })}
      </div>
      )}
    </div>
  );
}
