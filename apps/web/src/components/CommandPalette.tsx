import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJarvis } from "../store/JarvisProvider";

type Hit =
  | { k: "goal"; id: string; label: string; meta: string }
  | { k: "nav"; id: string; label: string; meta: string }
  | { k: "new"; id: string; label: string; meta: string };

export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { goals, openDrawer, planOutcome } = useJarvis();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const hits = useMemo<Hit[]>(() => {
    const query = q.toLowerCase().trim();
    const goalHits: Hit[] = goals
      .filter(
        (g) =>
          !query ||
          g.title.toLowerCase().includes(query) ||
          g.domain.includes(query),
      )
      .map((g) => ({ k: "goal", id: g.id, label: g.title, meta: g.stage }));
    const acts: Hit[] = (
      [
        { k: "nav" as const, id: "/", label: "Go to Board", meta: "⌘1" },
        { k: "nav" as const, id: "/goals", label: "Go to Goals", meta: "⌘2" },
        { k: "nav" as const, id: "/activity", label: "Go to Activity", meta: "⌘3" },
        { k: "nav" as const, id: "/settings", label: "Go to Settings", meta: "⌘4" },
      ] as Hit[]
    ).filter((a) => a.k === "nav" && (!query || a.label.toLowerCase().includes(query)));

    if (query) {
      return [...goalHits, ...acts, { k: "new", id: query, label: `State "${query}" as an outcome`, meta: "enter" }];
    }
    return [...goalHits, ...acts];
  }, [goals, q]);

  useEffect(() => {
    if (open) {
      setQ("");
      setIdx(0);
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    setIdx(0);
  }, [q]);

  function run(i: number) {
    const h = hits[i];
    if (!h) return;
    onClose();
    if (h.k === "goal") openDrawer(h.id);
    else if (h.k === "nav") navigate(h.id);
    else {
      planOutcome(h.id);
      navigate("/");
      window.setTimeout(() => document.getElementById("say")?.focus(), 50);
    }
  }

  if (!open) return null;

  let lastSec = "";

  return (
    <>
      <div className="scrim on" onClick={onClose} />
      <div className="pal on" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="pal-in">
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search goals, or type an outcome…"
            aria-label="Search"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIdx((v) => Math.min(v + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIdx((v) => Math.max(v - 1, 0));
              }
              if (e.key === "Enter") {
                e.preventDefault();
                run(idx);
              }
            }}
          />
          <span>esc</span>
        </div>
        <div className="pal-list">
          {hits.length === 0 ? (
            <p className="pal-none">Nothing matches</p>
          ) : (
            hits.map((h, i) => {
              const sec = h.k === "goal" ? "Goals" : h.k === "nav" ? "Go to" : "Create";
              const showSec = sec !== lastSec;
              lastSec = sec;
              return (
                <div key={`${h.k}-${h.id}-${i}`}>
                  {showSec ? <p className="pal-sec">{sec}</p> : null}
                  <button
                    type="button"
                    className={`pal-item${i === idx ? " sel" : ""}`}
                    onMouseEnter={() => setIdx(i)}
                    onClick={() => run(i)}
                  >
                    <b>{h.label}</b>
                    <small>{h.meta}</small>
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
