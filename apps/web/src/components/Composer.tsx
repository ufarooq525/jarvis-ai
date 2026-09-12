import { useState, type FormEvent } from "react";
import { useJarvis } from "../store/JarvisProvider";
import type { Mode } from "../store/types";

export function Composer({ visible }: { visible: boolean }) {
  const { composerMode, setComposerMode, planOutcome, planning, error } = useJarvis();
  const [text, setText] = useState("");

  if (!visible) return null;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || planning) return;
    const outcome = text.trim();
    setText("");
    await planOutcome(outcome, composerMode);
  }

  function setSeg(m: Mode) {
    setComposerMode(m);
  }

  return (
    <div className="comp">
      <form className="comp-in" onSubmit={onSubmit}>
        <div className="field">
          <input
            id="say"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Get the Monday note out before I wake up"
            aria-label="State an outcome"
            disabled={planning}
          />
          <div className="seg">
            <button
              type="button"
              data-m="shadow"
              aria-pressed={composerMode === "shadow"}
              onClick={() => setSeg("shadow")}
            >
              Shadow
            </button>
            <button
              type="button"
              data-m="live"
              className="lv"
              aria-pressed={composerMode === "live"}
              onClick={() => setSeg("live")}
            >
              Live
            </button>
          </div>
          <button type="submit" className="btn" style={{ padding: "9px 15px" }} disabled={planning}>
            {planning ? "Planning…" : "Plan it"}
          </button>
        </div>
        <p className="comp-hint">
          {error
            ? error
            : "Describe the outcome, not the steps. Calls JARVIS API Shadow Loop (mock adapter). Live still asks before it runs."}
        </p>
      </form>
    </div>
  );
}
