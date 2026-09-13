import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getWmNow, listEscalations, type EscalationDto, type WmNowDto } from "../api";

/**
 * Phase 11 Attention rail — decisions that need you.
 * Uses existing CSS drawer pattern (not Tailwind orphans).
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
  const [now, setNow] = useState<WmNowDto | null>(null);
  const [pending, setPending] = useState<EscalationDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [badge, setBadge] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      void listEscalations("pending")
        .then((e) => {
          if (!cancelled) setBadge((e.escalations ?? []).length);
        })
        .catch(() => {
          /* quiet when API down */
        });
    };
    tick();
    const t = window.setInterval(tick, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void Promise.all([getWmNow(), listEscalations("pending")])
      .then(([n, e]) => {
        if (cancelled) return;
        setNow(n);
        const rows = e.escalations ?? [];
        setPending(rows);
        setBadge(rows.length);
        setError(null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
              <p>What needs your decision</p>
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
              <p>Short-term state</p>
            </div>
            <div className="srow">
              <div>
                <b>Active goal</b>
                <p>{now?.active_goal?.title ?? "None"}</p>
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

          <div className="panel">
            <div className="panel-hd">
              <h2>Pending decisions</h2>
              <p>Approvals inbox — demo seed is not Live truth.</p>
            </div>
            {pending.length === 0 ? (
              <div className="empty" style={{ border: 0 }}>
                Nothing waiting — you’re clear.
              </div>
            ) : (
              pending.map((e) => (
                <div key={e.id} className="srow">
                  <div>
                    <b>{e.title || e.tool_id}</b>
                    <p>{e.reason}</p>
                  </div>
                  <span className="chip c-shadow">{e.verdict_class}</span>
                </div>
              ))
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/approvals" className="btn sec" onClick={onClose}>
                Open Approvals
              </Link>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
