import { useCallback, useEffect, useState } from "react";
import {
  createEscalationDemo,
  listEscalations,
  resolveEscalation,
  type EscalationDto,
} from "./api";
import { useJarvis } from "./store/JarvisProvider";

export function ApprovalsPage() {
  const { openDrawer, refresh } = useJarvis();
  const [rows, setRows] = useState<EscalationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await listEscalations();
      setRows(res.escalations);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load escalations");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onDemo() {
    setBusy(true);
    try {
      await createEscalationDemo({
        title: "Demo Live start_run",
        outcome: "Queue a Live-shaped OS start for human review (no OS call)",
      });
      await load();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Demo failed");
    } finally {
      setBusy(false);
    }
  }

  async function onResolve(id: string, decision: "approve" | "reject") {
    setBusy(true);
    try {
      await resolveEscalation(id, decision);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  const pending = rows.filter((r) => r.status === "pending");

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="head">
          <div>
            <h1>Approvals</h1>
            <p>
              Confirm / reject Live-shaped proposals. Approval applies to this plan only — never
              remembered. Shadow plans still use the Board drawer.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)", marginTop: 8 }}>{error}</p> : null}
          </div>
          <button type="button" className="btn" disabled={busy} onClick={() => void onDemo()}>
            {busy ? "Working…" : "Queue Live demo"}
          </button>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Needs you ({pending.length})</h2>
            <p>Escalations from policy — expire after 15 minutes if untouched.</p>
          </div>
          {rows.length === 0 ? (
            <div className="empty" style={{ margin: 16, borderStyle: "dashed" }}>
              Nothing in the inbox. Queue a Live demo or wait for a Live-shaped proposal.
            </div>
          ) : (
            rows.map((r) => (
              <div className="srow" key={r.id}>
                <div>
                  <b>{r.title ?? r.tool_id}</b>
                  <p>
                    <span className={`chip ${r.status === "pending" ? "c-shadow" : "c-done"}`}>
                      {r.status}
                    </span>{" "}
                    {r.verdict_class} · {r.reason}
                  </p>
                  <p style={{ marginTop: 6, fontFamily: "var(--mono)", fontSize: 11 }}>
                    verdict {r.verdict_id} · expires {new Date(r.expires_at).toLocaleString()}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <button type="button" className="btn sec" onClick={() => openDrawer(r.goal_id)}>
                    Open
                  </button>
                  {r.status === "pending" && r.verdict_class !== "reject" ? (
                    <>
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void onResolve(r.id, "approve")}
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        className="btn sec"
                        disabled={busy}
                        onClick={() => void onResolve(r.id, "reject")}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
