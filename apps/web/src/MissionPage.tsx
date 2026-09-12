import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getPortfolio, type PortfolioDto } from "./api";

function ageLabel(ms: number | null): string {
  if (ms == null) return "—";
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

export function MissionPage() {
  const [p, setP] = useState<PortfolioDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPortfolio()
      .then((res) => {
        if (!cancelled) {
          setP(res);
          setError(null);
        }
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hotDomains = p?.domains.filter((d) => d.goal_count > 0 || d.promotion_candidate) ?? [];

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 920 }}>
        <div className="head" style={{ marginBottom: 28 }}>
          <div>
            <p
              style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                opacity: 0.55,
                margin: "0 0 8px",
              }}
            >
              JARVIS
            </p>
            <h1 style={{ fontSize: "clamp(2rem, 4vw, 2.75rem)", margin: 0 }}>Mission Control</h1>
            <p style={{ marginTop: 10, maxWidth: 420 }}>
              Portfolio view of goals, approvals, evidence, and OS health — every number links to work.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
        </div>

        {!p ? (
          <div className="empty" style={{ border: 0 }}>
            Loading portfolio…
          </div>
        ) : (
          <>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 12,
                marginBottom: 28,
              }}
            >
              <Link to="/goals" className="panel" style={{ textDecoration: "none", color: "inherit" }}>
                <div className="panel-hd">
                  <h2 style={{ fontSize: 14, margin: 0 }}>Goals</h2>
                  <p style={{ margin: 0 }}>By domain</p>
                </div>
                <div className="srow">
                  <b>{p.domains.reduce((n, d) => n + d.goal_count, 0)}</b>
                  <span className="sval">open Board →</span>
                </div>
              </Link>
              <Link
                to="/approvals"
                className="panel"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="panel-hd">
                  <h2 style={{ fontSize: 14, margin: 0 }}>Approvals</h2>
                  <p style={{ margin: 0 }}>SLA</p>
                </div>
                <div className="srow">
                  <b>{p.escalations.pending}</b>
                  <span className="sval">
                    {p.escalations.breached ? `${p.escalations.breached} late` : ageLabel(p.escalations.avg_age_ms)}
                  </span>
                </div>
              </Link>
              <Link
                to="/activity"
                className="panel"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="panel-hd">
                  <h2 style={{ fontSize: 14, margin: 0 }}>Evidence</h2>
                  <p style={{ margin: 0 }}>Journal</p>
                </div>
                <div className="srow">
                  <b>{p.journal.decisions}</b>
                  <span className="sval">{p.evidence.nodes} nodes</span>
                </div>
              </Link>
              <Link
                to="/settings"
                className="panel"
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div className="panel-hd">
                  <h2 style={{ fontSize: 14, margin: 0 }}>OS health</h2>
                  <p style={{ margin: 0 }}>{p.os.reachable ? "reachable" : "down / mock"}</p>
                </div>
                <div className="srow">
                  <b>{p.os.run_count}</b>
                  <span className="sval">{p.os.pending_gates} gates</span>
                </div>
              </Link>
            </div>

            <div className="panel">
              <div className="panel-hd">
                <h2>Domain trust board</h2>
                <p>SHADOW by default. Promotion candidates need your review on the Board.</p>
              </div>
              {(hotDomains.length ? hotDomains : p.domains.slice(0, 5)).map((d) => (
                <Link
                  key={d.domain}
                  to="/"
                  className="srow"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  <div>
                    <b>{d.domain}</b>
                    <p>
                      {d.goal_count} goals · {d.shadow} shadow · {d.live} live · KR {d.kr.met}/
                      {d.kr.total}
                      {d.promotion_candidate ? " · promotion candidate" : ""}
                    </p>
                  </div>
                  <span className="chip c-shadow">{d.trust_tier}</span>
                </Link>
              ))}
            </div>

            {p.journal.avg_confidence != null ? (
              <p style={{ marginTop: 16, fontSize: 12.5, opacity: 0.65 }}>
                Avg decision confidence {Math.round(p.journal.avg_confidence * 100)}% · updated{" "}
                {new Date(p.at).toLocaleTimeString()}
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
