import { useEffect, useState } from "react";
import {
  invalidateWmFact,
  listWmEntities,
  listWmFacts,
  reverifyWmFact,
  type WmEntityDto,
  type WmFactDto,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";

function trustChip(trust: string) {
  if (trust === "trusted") return "c-done";
  if (trust === "quarantined") return "c-fail";
  return "c-shadow";
}

function statusChip(status: string) {
  if (status === "active") return "c-done";
  if (status === "stale") return "c-shadow";
  return "c-fail";
}

export function EntitiesPage() {
  const { openDrawer } = useJarvis();
  const [tab, setTab] = useState<"entities" | "facts">("facts");
  const [q, setQ] = useState("");
  const [entities, setEntities] = useState<WmEntityDto[]>([]);
  const [facts, setFacts] = useState<WmFactDto[]>([]);
  const [counts, setCounts] = useState({ active: 0, stale: 0, invalidated: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const t = window.setTimeout(() => {
      if (tab === "entities") {
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
      } else {
        void listWmFacts({ q: q || undefined })
          .then((res) => {
            if (!cancelled) {
              setFacts(res.facts);
              setCounts(res.counts);
              setError(null);
            }
          })
          .catch((e: Error) => {
            if (!cancelled) setError(e.message);
          });
      }
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [q, tab]);

  async function onInvalidate(id: string) {
    try {
      setBusyId(id);
      await invalidateWmFact(id, "user");
      const res = await listWmFacts({ q: q || undefined });
      setFacts(res.facts);
      setCounts(res.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalidate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function onReverify(id: string) {
    try {
      setBusyId(id);
      await reverifyWmFact(id);
      const res = await listWmFacts({ q: q || undefined });
      setFacts(res.facts);
      setCounts(res.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reverify failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="head">
          <div>
            <h1>World Model</h1>
            <p>
              Durable memory: facts with provenance, confidence, and freshness. Browser research
              auto-ingests here.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <button
            type="button"
            className={`btn ${tab === "facts" ? "" : "sec"}`}
            onClick={() => setTab("facts")}
          >
            Facts ({counts.active} active)
          </button>
          <button
            type="button"
            className={`btn ${tab === "entities" ? "" : "sec"}`}
            onClick={() => setTab("entities")}
          >
            Entities
          </button>
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "facts" ? "Search facts…" : "Search entities…"}
            aria-label="Search world model"
          />
        </div>

        {tab === "facts" ? (
          facts.length === 0 ? (
            <div className="empty" style={{ border: 0 }}>
              No facts yet — run Browser → Research (GET) on example.com, then refresh here.
            </div>
          ) : (
            facts.map((f) => (
              <div key={f.id} className="ev" style={{ width: "100%" }}>
                <time style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{f.kind}</time>
                <span className={`ev-dot ${f.status === "active" ? "sh" : ""}`} />
                <div style={{ flex: 1 }}>
                  <b>{f.claim}</b>
                  <p style={{ fontFamily: "var(--mono)", fontSize: 11, opacity: 0.75 }}>
                    {f.source}
                    {f.source_url ? ` · ${f.source_url}` : ""}
                    {f.goal_id ? ` · goal ${f.goal_id}` : ""}
                  </p>
                  <span className={`chip ${statusChip(f.status)}`} style={{ marginRight: 6 }}>
                    {f.status}
                  </span>
                  <span className="chip c-stated">{Math.round(f.confidence * 100)}%</span>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    {f.status !== "invalidated" ? (
                      <button
                        type="button"
                        className="btn sec"
                        disabled={busyId === f.id}
                        onClick={() => void onInvalidate(f.id)}
                      >
                        Invalidate
                      </button>
                    ) : null}
                    {f.status === "stale" || f.status === "active" ? (
                      <button
                        type="button"
                        className="btn sec"
                        disabled={busyId === f.id}
                        onClick={() => void onReverify(f.id)}
                      >
                        Reverify
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))
          )
        ) : entities.length === 0 ? (
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
