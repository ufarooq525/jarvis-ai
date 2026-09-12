import { useEffect, useState } from "react";
import { listWmEntities, type WmEntityDto } from "./api";
import { useJarvis } from "./store/JarvisProvider";

function trustChip(trust: string) {
  if (trust === "trusted") return "c-done";
  if (trust === "quarantined") return "c-fail";
  return "c-shadow";
}

export function EntitiesPage() {
  const { openDrawer } = useJarvis();
  const [q, setQ] = useState("");
  const [entities, setEntities] = useState<WmEntityDto[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      void listWmEntities(q || undefined)
        .then((res) => {
          if (!cancelled) {
            setEntities(res.entities);
            setError(null);
          }
        })
        .catch((e: Error) => {
          if (!cancelled) setError(e.message);
        });
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q]);

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="head">
          <div>
            <h1>World Model</h1>
            <p>Search goals, OS runs, approvals, and specialist stubs. Confidence and trust shown.</p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
        </div>
        <div className="field" style={{ marginBottom: 16 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search entities…"
            aria-label="Search world model"
          />
        </div>
        {entities.length === 0 ? (
          <div className="empty" style={{ border: 0 }}>
            No entities match
          </div>
        ) : (
          entities.map((e) => (
            <button
              key={`${e.type}-${e.entity_id}`}
              type="button"
              className="ev"
              style={{ width: "100%", textAlign: "left" }}
              onClick={() => e.type === "goal" && openDrawer(e.entity_id)}
            >
              <time style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{e.type}</time>
              <span className={`ev-dot ${e.type === "goal" ? "sh" : ""}`} />
              <div>
                <b>{e.title}</b>
                <p>{e.summary}</p>
                <span className={`chip ${trustChip(e.trust)}`} style={{ marginRight: 6 }}>
                  {e.trust}
                </span>
                <span className="chip c-stated">{Math.round(e.confidence * 100)}%</span>
                <span style={{ marginLeft: 8, fontSize: 11, opacity: 0.65 }}>{e.provenance}</span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
