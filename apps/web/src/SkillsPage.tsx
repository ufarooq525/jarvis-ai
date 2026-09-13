import { useEffect, useState } from "react";
import {
  ingestSkillFromFacts,
  ingestSkillText,
  listSkills,
  listWmFacts,
  practiceSkill,
  retireSkill,
  verifySkill,
  type SkillDto,
} from "./api";

const SAMPLE = `Qualify a research lead
1. Open an allowlisted source URL
2. Extract the page title as an observation
3. Store the fact in World memory
Never claim a visit if the fetch failed
Example: https://example.com/`;

export function SkillsPage() {
  const [skills, setSkills] = useState<SkillDto[]>([]);
  const [text, setText] = useState(SAMPLE);
  const [title, setTitle] = useState("Qualify a research lead");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function reload() {
    const res = await listSkills();
    setSkills(res.skills);
  }

  useEffect(() => {
    void reload().catch((e: Error) => setError(e.message));
  }, []);

  async function onIngest() {
    try {
      setBusy(true);
      setError(null);
      const res = await ingestSkillText({ text, title });
      setMsg(res.message);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ingest failed");
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
        setError("No active World facts yet — run Browser research first");
        return;
      }
      const res = await ingestSkillFromFacts({
        fact_ids: ids,
        title: "Skill from recent facts",
      });
      setMsg(res.message);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "From-facts failed");
    } finally {
      setBusy(false);
    }
  }

  async function run(id: string, action: "practice" | "verify" | "retire") {
    try {
      setBusy(true);
      setError(null);
      if (action === "practice") await practiceSkill(id);
      if (action === "verify") await verifySkill(id);
      if (action === "retire") await retireSkill(id, "user");
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
            <h1>Skills</h1>
            <p>
              Phase 8: ingest → practice (simulated) → verify into library. Skills stay SHADOW and
              cannot execute.
            </p>
            {error ? <p style={{ color: "var(--danger-ink)" }}>{error}</p> : null}
            {msg ? <p style={{ opacity: 0.75 }}>{msg}</p> : null}
          </div>
        </div>

        <div className="panel">
          <div className="panel-hd">
            <h2>Ingest tutorial / notes</h2>
            <p>Use numbered steps. Secrets are blocked.</p>
          </div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Skill title"
            style={{
              display: "block",
              width: "100%",
              marginBottom: 10,
              padding: "10px 12px",
              fontSize: 14,
            }}
          />
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            style={{
              display: "block",
              width: "100%",
              marginBottom: 12,
              padding: 12,
              fontFamily: "var(--mono)",
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={busy} onClick={() => void onIngest()}>
              Create candidate
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
            <h2>Library</h2>
            <p>Practice before verify. Execute stays blocked.</p>
          </div>
          {skills.length === 0 ? (
            <div className="empty" style={{ border: 0 }}>
              No skills yet — create a candidate above.
            </div>
          ) : (
            skills.map((s) => (
              <div key={s.id} className="ev" style={{ width: "100%" }}>
                <time style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{s.status}</time>
                <span className={`ev-dot ${s.status === "verified" ? "sh" : ""}`} />
                <div style={{ flex: 1 }}>
                  <b>
                    {s.name} <span style={{ opacity: 0.55 }}>v{s.version}</span>
                  </b>
                  <p>{s.summary}</p>
                  <span className="chip c-shadow" style={{ marginRight: 6 }}>
                    {s.trust_tier}
                  </span>
                  <span className="chip c-stated">{s.procedure.length} steps</span>
                  {s.practice ? (
                    <p style={{ fontFamily: "var(--mono)", fontSize: 11, marginTop: 6 }}>
                      {s.practice.summary}
                    </p>
                  ) : null}
                  <div style={{ marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {s.status !== "retired" ? (
                      <button
                        type="button"
                        className="btn sec"
                        disabled={busy}
                        onClick={() => void run(s.id, "practice")}
                      >
                        Practice
                      </button>
                    ) : null}
                    {s.status !== "verified" && s.status !== "retired" ? (
                      <button
                        type="button"
                        className="btn"
                        disabled={busy}
                        onClick={() => void run(s.id, "verify")}
                      >
                        Verify
                      </button>
                    ) : null}
                    {s.status !== "retired" ? (
                      <button
                        type="button"
                        className="btn sec"
                        disabled={busy}
                        onClick={() => void run(s.id, "retire")}
                      >
                        Retire
                      </button>
                    ) : null}
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
