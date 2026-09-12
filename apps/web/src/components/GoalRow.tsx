import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { GoalSummary } from "../api";
import { cn } from "../lib/cn";

function statusTone(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "bg-[var(--success)]";
  if (s === "blocked") return "bg-destructive";
  if (s === "done") return "bg-foreground/25";
  return "bg-muted-foreground/40";
}

function statusLabel(status: string) {
  const s = status.toLowerCase();
  if (s === "active") return "In progress";
  if (s === "done") return "Complete";
  return status.replace(/_/g, " ");
}

type GoalRowProps = {
  goal: GoalSummary;
  className?: string;
};

/** Linear-like command row — status mark, not badge spam. */
export function GoalRow({ goal, className }: GoalRowProps) {
  return (
    <Link
      to={`/goals/${goal.id}`}
      className={cn(
        "group relative flex items-start gap-4 px-5 py-4 no-underline transition-colors hover:bg-foreground/[0.03]",
        className,
      )}
    >
      <span
        className={cn("mt-2 h-2 w-2 shrink-0 rounded-full", statusTone(goal.status))}
        aria-hidden
      />

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="truncate text-[15px] font-semibold tracking-tight text-foreground">
            {goal.title}
          </p>
          <span className="text-[12px] text-muted-foreground">{statusLabel(goal.status)}</span>
        </div>
        <p className="mt-1 line-clamp-1 text-sm text-muted-foreground">{goal.outcome}</p>
        <p className="mt-2 text-[12px] text-muted-foreground/80">
          {goal.domain}
          <span className="mx-1.5 text-border">/</span>
          Shadow
        </p>
      </div>

      <ChevronRight
        size={16}
        className="mt-1 shrink-0 text-muted-foreground/40 transition-all group-hover:translate-x-0.5 group-hover:text-foreground"
      />
    </Link>
  );
}
