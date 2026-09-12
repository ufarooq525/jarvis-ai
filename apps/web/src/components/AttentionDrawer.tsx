import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Surface } from "./ui/card";
import { cn } from "../lib/cn";

type AttentionDrawerProps = {
  open: boolean;
  onClose: () => void;
};

/** Right slide-in Attention drawer — opened via the side edge tab. */
export function AttentionDrawer({ open, onClose }: AttentionDrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50" role="presentation">
          <motion.button
            type="button"
            aria-label="Close attention drawer"
            className="absolute inset-0 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={onClose}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Attention"
            className={cn(
              "absolute inset-y-0 right-0 flex w-[min(100%,360px)] flex-col border-l border-border bg-card shadow-xl",
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "tween", duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-4">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Attention
                </h2>
                <p className="text-[12px] text-muted-foreground">Decisions and alerts</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4 md:p-5">
              <Surface className="p-4" initial={false}>
                <p className="text-sm font-medium text-foreground">Shadow mode is on</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Plans are simulated. Nothing reaches Umer AI OS until you later approve Live.
                </p>
              </Surface>
              <p className="text-[13px] text-muted-foreground">Approvals appear here in Phase B.</p>
            </div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
