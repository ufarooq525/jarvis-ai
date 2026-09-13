import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getWmNow,
  listEscalations,
  resolveEscalation,
  type EscalationDto,
  type WmNowDto,
} from "../api";
import { useJarvis } from "../store/JarvisProvider";

/**
 * Attention — why you are interrupted, what is needed.
 * Real escalations + Shadow plans waiting review. Demo seed is not Live truth.
 */
export function AttentionRail({
  open,
  onClose,
  onOpen,
}: {
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { byStage, openDrawer, refresh } = useJarvis();
  const [now, setNow] = useState<WmNowDto | null>(null);
  const [pending, setPending] = useState<EscalationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [badge, setBadge] = useState(0);
  const [busy, setBusy] = useState(false);

  const shadowWaiting = byStage("shadow");

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void listEscalations("pending")
        .then((e) => {
          if (!cancelled) setBadge((e.escalations ?? []).length + shadowWaiting.length);
        })
        .catch(() => {
          if (!cancelled) setBadge(shadowWaiting.length);
        });
    };
    tick();
    const t = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [shadowWaiting.length]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([getWmNow(), listEscalations("pending")])
      .then(([n, e]) => {
        if (cancelled) return;
        setNow(n);
        const rows = e.escalations ?? [];
        setPending(rows);
        setBadge(rows.length + shadowWaiting.length);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, shadowWaiting.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function onResolve(id: string, decision: "approve" | "reject") {
    setBusy(true);
    try {
      await resolveEscalation(id, decision);
      const e = await listEscalations("pending");
      setPending(e.escalations ?? []);
      setBadge((e.escalations ?? []).length + shadowWaiting.length);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="attn-edge"
        aria-label={`Open attention${badge ? ` (${badge} pending)` : ""}`}
        title="Attention"
        onClick={onOpen}
        style={{ display: open ? "none" : undefined }}
      >
        <span className="attn-edge-label">Attention</span>
        {badge > 0 ? <em className="attn-edge-count">{badge}</em> : null}
      </button>

      <div className={`scrim${open ? " on" : ""}`} onClick={onClose} aria-hidden={!open} />
      <aside
        className={`drawer attn-drawer${open ? " on" : ""}`}
        role="dialog"
        aria-modal={open}
        aria-label="Attention"
      >
        <div className="dr-hd">
          <div className="dr-top">
            <div>
              <h2>Attention</h2>
              <p>Why you are being interrupted — and what is needed</p>
            </div>
            <button type="button" className="btn sec" onClick={onClose} aria-label="Close attention">
              Close
            </button>
          </div>
        </div>

        <div className="dr-body">
          {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}

          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-hd">
              <h2>Now</h2>
              <p>Short-term state from World Model</p>
            </div>
            <div className="srow">
              <div>
                <b>Active goal</b>
                <p>{now?.active_goal?.title ?? "None — idle"}</p>
              </div>
            </div>
            <div className="srow">
              <div>
                <b>Memory</b>
                <p>
                  {now?.memory
                    ? `${now.memory.active_facts} active facts · ${now.memory.stale_facts} stale`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 14 }}>
            <div className="panel-hd">
              <h2>Shadow plans waiting</h2>
              <p>Simulated only — review before Live.</p>
            </div>
            {shadowWaiting.length === 0 ? (
              <div className="empty" style={{ border: 0 }}>None.</div>
            ) : (
              shadowWaiting.map((g) => (
                <div className="srow" key={g.id}>
                  <div>
                    <b>{g.title}</b>
                    <p>What is needed: review the plan and decide Shadow stay or Live.</p>
                  </div>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      openDrawer(g.id);
                      onClose();
                    }}
                  >
                    Review
                  </button>
                </div>
              ))
            )}
          </div>

          <div className="panel">
            <div className="panel-hd">
              <h2>Approvals inbox</h2>
              <p>
                Confirm or reject. Practice demos are not Live truth — approving does not by itself
                dispatch OS work.
              </p>
            </div>
            {pending.length === 0 ? (
              <div className="empty" style={{ border: 0 }}>
                No pending approvals.
              </div>
            ) : (
              pending.map((e) => (
                <div key={e.id} className="srow" style={{ flexWrap: "wrap" }}>
                  <div style={{ flex: "1 1 180px" }}>
                    <b>{e.title || e.tool_id}</b>
                    <p>
                      <strong>Why:</strong> {e.reason}
                    </p>
                    <p className="cc-note">Nothing has been sent.</p>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    {e.verdict_class !== "reject" ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void onResolve(e.id, "approve")}
                      >
                        Confirm
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn sec"
                      disabled={busy}
                      onClick={() => void onResolve(e.id, "reject")}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ))
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/approvals" className="btn sec" onClick={onClose}>
                Full Approvals page
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
