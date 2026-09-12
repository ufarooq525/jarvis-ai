import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Check, Circle, Hexagon } from "lucide-react";
import {
  getEvidence,
  getGoal,
  type EvidenceNode,
  type GoalDetailResponse,
} from "./api";
import { Surface } from "./components/ui/card";
import { Loader } from "./components/ui/loader";

const STORY_LABELS: Record<string, string> = {
  stimulus: "You stated an outcome",
  observation: "Checked current state",
  decision: "Formed a plan",
  policy_verdict: "Passed policy under Shadow",
  simulation: "Simulated next step",
  tool_invocation: "Shadow tool ran (no Live effect)",
  metric: "Recorded a measurement",
  expected_vs_actual: "Compared expected vs actual",
};

function label(kind: string) {
  return STORY_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function toolHuman(id: string) {
  if (id.includes("get_state")) return "Inspect workforce state";
  if (id.includes("start_run")) return "Propose an OS agent run";
  return id;
}

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [detail, setDetail] = useState<GoalDetailResponse | null>(null);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);
  const [raw, setRaw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showTech, setShowTech] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([getGoal(id), getEvidence(id)])
      .then(([d, e]) => {
        setDetail(d);
        setEvidence(e.evidence);
        setRaw(e.evidence_json);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
  }, [id]);

  if (error) {
    return (
      <div>
        <p className="text-destructive">{error}</p>
        <Link
          to="/goals"
          className="mt-3 inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground no-underline shadow-sm transition-colors hover:bg-muted"
        >
          <ArrowLeft size={16} />
          Goals
        </Link>
      </div>
    );
  }

  if (!detail) return <Loader label="Loading goal…" />;

  const { goal, tasks, runs, objectives, adapter } = detail;

  return (
    <motion.article
      className="workspace-panel w-full space-y-0 overflow-visible"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="space-y-6 px-6 py-6">
      <Link
        to="/goals"
        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
      >
        <ArrowLeft size={16} />
        Goals
      </Link>

      <Surface className="p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg border border-border bg-muted px-2 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Shadow
          </span>
          <span className="rounded-lg border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground">
            Simulated · no external action
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{goal.title}</h1>
        <p className="mt-2 text-[15px] text-muted-foreground">{goal.outcome}</p>
        <p className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
          <span>
            Trust <span className="text-foreground">{goal.trust_tier}</span>
          </span>
          <span>
            Adapter <span className="text-foreground">{adapter}</span>
          </span>
          <span>
            Domain <span className="text-foreground">{goal.domain}</span>
          </span>
        </p>
      </Surface>

      <Surface className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold">How we’d get there</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Proposals only — nothing dispatched to Umer AI OS.
          </p>
        </div>
        <div className="space-y-4 px-5 py-4">
          {objectives.map((o) => (
            <p key={o.id} className="text-[15px]">
              <span className="font-medium">{o.title}</span>
              <span className="mt-1 block text-sm text-muted-foreground">
                Success: {o.success_criteria}
              </span>
            </p>
          ))}
        </div>
        <ol className="divide-y divide-border border-t border-border">
          {tasks.map((t, i) => (
            <li key={t.id} className="flex gap-3 px-5 py-4">
              <span className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[15px] font-medium">{t.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {t.intent} · {t.tool_ids.map(toolHuman).join(", ")}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Surface>

      <Surface className="p-0">
        <div className="border-b border-border px-5 py-3">
          <h2 className="text-sm font-bold">What we simulated</h2>
        </div>
        <ul className="divide-y divide-border">
          {runs.map((r) => (
            <li key={r.id} className="flex items-start gap-3 px-5 py-4">
              <Hexagon size={16} className="mt-0.5 text-[var(--jarvis-brand)]" strokeWidth={1.75} />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {r.status} · simulated
                </p>
                <p className="mt-1 text-[15px]">
                  {r.tool_invocations.map(toolHuman).join(" · ") || "Internal step"}
                </p>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {r.os_run_id ?? "no os run"} · {r.mode}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </Surface>

      <Surface className="p-5">
        <h2 className="text-sm font-bold">What happened</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Story of this Shadow plan. Expand technical details only if you need them.
        </p>
        <ul className="mt-6 space-y-4 border-l border-border pl-4">
          {evidence.map((n) => (
            <li key={n.id} className="relative">
              <span className="absolute -left-[21px] top-1.5 flex h-2.5 w-2.5 items-center justify-center rounded-full bg-card">
                {n.kind === "metric" || n.kind === "expected_vs_actual" ? (
                  <Check size={10} className="text-[var(--success)]" />
                ) : (
                  <Circle size={8} className="fill-[var(--jarvis-brand)] text-[var(--jarvis-brand)]" />
                )}
              </span>
              <p className="text-xs font-medium text-muted-foreground">{label(n.kind)}</p>
              <p className="mt-0.5 text-sm text-foreground">{n.payload_summary}</p>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setShowTech((v) => !v)}
          className="mt-6 text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {showTech ? "Hide technical details" : "Technical details"}
        </button>
        {showTech && (
          <pre className="mt-3 max-h-80 overflow-auto rounded-xl border border-border bg-muted/40 p-4 font-mono text-[11px] leading-relaxed text-muted-foreground">
            {raw}
          </pre>
        )}
      </Surface>
      </div>
    </motion.article>
  );
}
