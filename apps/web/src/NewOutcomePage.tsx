import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft } from "lucide-react";
import { runShadowLoop } from "./api";
import { ButtonSpinner } from "./components/ui/loader";

export function NewOutcomePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [outcome, setOutcome] = useState("");
  const [domain, setDomain] = useState("general");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const result = await runShadowLoop({
        title: title.trim() || outcome.trim().slice(0, 80),
        outcome: outcome.trim(),
        domain,
      });
      navigate(`/goals/${result.goal.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run shadow loop");
    } finally {
      setBusy(false);
    }
  }

  return (
    <motion.section
      className="workspace-panel mx-auto w-full max-w-2xl"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      <header className="border-b border-border px-6 py-5">
        <Link
          to="/"
          className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm font-medium text-foreground no-underline transition-colors hover:bg-muted"
        >
          <ArrowLeft size={16} />
          Overview
        </Link>
        <h1 className="mt-5 text-[28px] font-semibold leading-none tracking-[-0.03em]">
          State an outcome
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Describe what should be true. JARVIS will plan and simulate under Shadow — no Live side
          effects.
        </p>
      </header>

      <form onSubmit={onSubmit} className="flex flex-col gap-5 px-6 py-6">
        <label className="block">
          <span className="text-[13px] font-medium text-foreground">What should be true?</span>
          <textarea
            required
            rows={5}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            className="mt-2 w-full resize-y rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-[var(--jarvis-brand)]/30"
            placeholder="e.g. Prepare a weekly company overview without duplicating work already in flight"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="text-[13px] font-medium text-foreground">Short title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--jarvis-brand)]/30"
              placeholder="Optional"
            />
          </label>
          <label className="block">
            <span className="text-[13px] font-medium text-foreground">Domain</span>
            <select
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-background/70 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[var(--jarvis-brand)]/30"
            >
              <option value="general">General</option>
              <option value="ops">Ops</option>
              <option value="engineering">Engineering</option>
              <option value="growth">Growth</option>
            </select>
          </label>
        </div>

        {error && (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
          <button
            type="submit"
            disabled={busy || !outcome.trim()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--jarvis-brand)] px-4 text-sm font-medium text-white disabled:opacity-40"
          >
            {busy && <ButtonSpinner />}
            {busy ? "Planning in Shadow…" : "Plan in Shadow"}
          </button>
          <span className="text-[12px] text-muted-foreground">Simulated · mock adapter</span>
        </div>
      </form>
    </motion.section>
  );
}
