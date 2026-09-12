import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { listGoals, type GoalSummary } from "./api";
import { Loader } from "./components/ui/loader";
import { GoalRow } from "./components/GoalRow";

function hourGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function OverviewPage() {
  const [goals, setGoals] = useState<GoalSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listGoals()
      .then((r) => setGoals(r.goals))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  const active = goals.filter((g) => g.status === "active" || g.status === "done");
  const workingCount = goals.filter((g) => g.status === "active").length;

  if (loading) return <Loader label="Preparing overview…" />;

  return (
    <motion.section
      className="workspace-panel workspace-panel-fill"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* One composition: greeting + status + CTA */}
      <header className="relative overflow-hidden border-b border-border px-6 py-8 md:px-8 md:py-10">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-[var(--jarvis-brand)]/10 blur-3xl"
          aria-hidden
        />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-sm text-muted-foreground">{hourGreeting()}</p>
            <h1 className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.035em] text-foreground md:text-[40px]">
              Umer, here’s what matters.
            </h1>
            <p className="mt-3 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              {workingCount > 0
                ? `JARVIS is working on ${workingCount} priorit${workingCount === 1 ? "y" : "ies"} in Shadow — simulated, not Live.`
                : goals.length > 0
                  ? `${goals.length} Shadow plan${goals.length === 1 ? "" : "s"} ready to review. Nothing reaches Umer AI OS until you approve Live.`
                  : "JARVIS is idle. State an outcome and it will plan safely in Shadow first."}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-4 text-[13px] text-muted-foreground">
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--jarvis-brand)]" />
                Shadow
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
                Mock adapter
              </span>
              <span className="inline-flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${workingCount > 0 ? "bg-[var(--success)] pulse-dot" : "bg-muted-foreground/40"}`}
                />
                {goals.length} goals
              </span>
            </div>
          </div>

          <Link
            to="/new"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg bg-[var(--jarvis-brand)] px-5 text-sm font-medium text-white no-underline shadow-sm transition-opacity hover:opacity-90"
          >
            State an outcome
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      {error && (
        <p className="mx-6 mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <h2 className="text-sm font-semibold text-foreground">Priorities</h2>
        <Link
          to="/goals"
          className="text-[13px] font-medium text-muted-foreground no-underline transition-colors hover:text-foreground"
        >
          All goals
        </Link>
      </div>

      {active.length === 0 ? (
        <div className="flex flex-1 flex-col justify-center px-6 py-14">
          <p className="text-base font-medium text-foreground">Nothing in flight</p>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Your first Shadow plan will land here as a priority.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {active.map((g, i) => (
            <motion.li
              key={g.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.05 + i * 0.03 }}
            >
              <GoalRow goal={g} />
            </motion.li>
          ))}
        </ul>
      )}
    </motion.section>
  );
}
