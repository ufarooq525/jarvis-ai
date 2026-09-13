import { useEffect, useState } from "react";
import {
  createOpportunity,
  createOpportunityFromFacts,
  draftOpportunity,
  listOpportunities,
  listWmFacts,
  qualifyOpportunity,
  requestOpportunityApproval,
  type OpportunityDto,
} from "./api";

export function OpsPage() {
  const [rows, setRows] = useState<OpportunityDto[]>([]);
  const [title, setTitle] = useState("Laravel SaaS lead — Riyadh");
  const [company, setCompany] = useState("Acme Health");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function reload() {
    setRows((await listOpportunities()).opportunities);
  }

  useEffect(() => {
    void reload().catch((e: Error) => setError(e.message));
  }, []);

  async function onCreate() {
    try {
      setBusy(true);
      setError(null);
      await createOpportunity({
        title,
        company,
        channel: "upwork",
        summary: `${title} — Laravel SaaS opportunity`,
      });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function onFromFacts() {
    try {
      setBusy(true);
      setError(null);
      const facts = await listWmFacts({ status: "active" });
      const ids = facts.facts.slice(0, 3).map((f) => f.id);
      if (!ids.length) {
        setError("No World facts yet — run Browser research first");
        return;
      }
      await createOpportunityFromFacts({ fact_ids: ids, title: "Lead from research facts" });
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "From-facts failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(id: string, kind: "qualify" | "draft" | "approve") {
    try {
      setBusy(true);
      setError(null);
      if (kind === "qualify") await qualifyOpportunity(id);
      if (kind === "draft") await draftOpportunity(id);
      if (kind === "approve") await requestOpportunityApproval(id);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <div className="wrap" style={{ maxWidth: 860 }}>
        <div className="head">
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
            <h1>Ops</h1>
            <p>
              Phase 9 business operator: research → qualify → draft. Send / bid / publish stay
              blocked.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
          </div>
        </div>

        <div
          className="offline"
          style={{ background: "var(--warn-bg, #f5f0e6)", color: "inherit", marginBottom: 18 }}
        >
          Drafts are local only. No email, Upwork bid, or LinkedIn message is sent.
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>New opportunity</h2>
            <p>SHADOW pipeline — not Live outreach.</p>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ display: "block", width: "100%", marginBottom: 8, padding: "10px 12px" }}
          />
          <input
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="Company"
            style={{ display: "block", width: "100%", marginBottom: 12, padding: "10px 12px" }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void onCreate()}>
              Create
            </button>
            <button
              type="button"
              className="btn sec"
              disabled={busy}
              onClick={() => void onFromFacts()}
            >
              From World facts
            </button>
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Pipeline</h2>
            <p>Qualify → Draft → Request approval (still no send).</p>
          </div>
          {rows.length === 0 ? (
            <div className="empty" style={{ border: 0 }}>
              No opportunities yet.
            </div>
          ) : (
            rows.map((o) => (
              <div key={o.id} className="ev" style={{ width: "100%" }}>
                <time style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{o.status}</time>
                <span className="ev-dot sh" />
                <div style={{ flex: 1 }}>
                  <b>{o.title}</b>
                  <p>
                    {o.company ? `${o.company} · ` : ""}
                    {o.channel} · {o.summary}
                  </p>
                  {o.score ? (
                    <span className="chip c-stated">score {Math.round(o.score.overall * 100)}%</span>
                  ) : null}
                  {o.draft ? (
                    <pre
                      style={{
                        marginTop: 8,
                        whiteSpace: "pre-wrap",
                        fontFamily: "var(--mono)",
                        fontSize: 11,
                        opacity: 0.85,
                      }}
                    >
                      {o.draft.subject}
                      {"\n\n"}
                      {o.draft.body}
                    </pre>
                  ) : null}
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="btn sec"
                      disabled={busy}
                      onClick={() => void act(o.id, "qualify")}
                    >
                      Qualify
                    </button>
                    <button
                      type="button"
                      className="btn"
                      disabled={busy}
                      onClick={() => void act(o.id, "draft")}
                    >
                      Draft
                    </button>
                    <button
                      type="button"
                      className="btn sec"
                      disabled={busy || !o.draft}
                      onClick={() => void act(o.id, "approve")}
                    >
                      Request approval
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
