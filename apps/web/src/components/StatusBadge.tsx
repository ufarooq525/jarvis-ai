import { cn } from "../lib/cn";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-[var(--success)]/12 text-[var(--success)] ring-[var(--success)]/25",
  done: "bg-muted text-foreground/80 ring-border",
  blocked: "bg-destructive/10 text-destructive ring-destructive/25",
  draft: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toLowerCase();
  const label =
    key === "active" ? "In progress" : key === "done" ? "Complete" : status.replace(/_/g, " ");

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold capitalize ring-1 ring-inset",
        STATUS_STYLES[key] ?? "bg-muted text-muted-foreground ring-border",
        className,
      )}
    >
      {label}
    </span>
  );
}

export function DomainBadge({ domain, className }: { domain: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground ring-1 ring-inset ring-border",
        className,
      )}
    >
      {domain}
    </span>
  );
}

export function ModeBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md bg-[var(--jarvis-brand)]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--jarvis-brand)] ring-1 ring-inset ring-[var(--jarvis-brand)]/20",
        className,
      )}
    >
      Shadow
    </span>
  );
}
