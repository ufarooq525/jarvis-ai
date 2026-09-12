import { PanelRightOpen } from "lucide-react";
import { cn } from "../lib/cn";

type AttentionEdgeButtonProps = {
  onClick: () => void;
  hidden?: boolean;
};

/** Right-edge handle — always on screen until the drawer opens. */
export function AttentionEdgeButton({ onClick, hidden }: AttentionEdgeButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open attention drawer"
      title="Attention"
      className={cn(
        "fixed right-0 top-20 z-40 flex flex-col items-center gap-2 rounded-l-xl border border-r-0 border-border bg-card/95 px-2.5 py-4 text-muted-foreground shadow-lg backdrop-blur-sm transition-all duration-200",
        "hover:bg-card hover:text-foreground",
        hidden && "pointer-events-none translate-x-full opacity-0",
      )}
    >
      <PanelRightOpen size={15} />
      <span
        className="text-[10px] font-semibold tracking-[0.14em]"
        style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
      >
        Attention
      </span>
    </button>
  );
}
