import { motion } from "framer-motion";
import { cn } from "../../lib/cn";

type LoaderProps = {
  label?: string;
  className?: string;
  /** `page` = centered block for route loads; `inline` = compact for buttons/rows */
  size?: "page" | "inline" | "sm";
};

/** Calm Intelligence loader — soft pulse + orbit, not a neon spinner. */
export function Loader({
  label = "Loading",
  className,
  size = "page",
}: LoaderProps) {
  const isPage = size === "page";
  const ring = size === "inline" ? 18 : size === "sm" ? 14 : 36;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        "flex items-center gap-3 text-muted-foreground",
        isPage && "min-h-[240px] flex-col justify-center gap-4 py-12",
        className,
      )}
    >
      <span className="relative inline-flex items-center justify-center" style={{ width: ring, height: ring }}>
        <motion.span
          className="absolute inset-0 rounded-full border border-border"
          animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.92, 1, 0.92] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.span
          className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--jarvis-brand)] border-r-[var(--jarvis-brand)]/30"
          animate={{ rotate: 360 }}
          transition={{ duration: 1.1, repeat: Infinity, ease: "linear" }}
        />
        <motion.span
          className="h-1.5 w-1.5 rounded-full bg-[var(--jarvis-brand)]"
          animate={{ opacity: [0.45, 1, 0.45], scale: [0.85, 1.1, 0.85] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>

      {label && (
        <motion.p
          className={cn("text-sm", isPage && "text-[13px] tracking-wide")}
          animate={{ opacity: [0.55, 1, 0.55] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        >
          {label}
        </motion.p>
      )}
      <span className="sr-only">{label}</span>
    </div>
  );
}

/** Tiny spinner for primary buttons while a request runs. */
export function ButtonSpinner({ className }: { className?: string }) {
  return (
    <motion.span
      aria-hidden
      className={cn(
        "inline-block h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white/30 border-t-white",
        className,
      )}
      animate={{ rotate: 360 }}
      transition={{ duration: 0.8, repeat: Infinity, ease: "linear" }}
    />
  );
}
