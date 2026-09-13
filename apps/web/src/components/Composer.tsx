import { useState, type FormEvent } from "react";
import { useJarvis } from "../store/JarvisProvider";
import type { Mode } from "../store/types";
import { isVoiceEnabled, listenOnce, voiceSupport } from "../lib/voice/stt";

export function Composer({ visible }: { visible: boolean }) {
  const { composerMode, setComposerMode, planOutcome, planning, error } = useJarvis();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);

  if (!visible) return null;

  const voiceOn = isVoiceEnabled() && voiceSupport().supported;

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

  async function onPushToTalk() {
    if (listening || planning) return;
    setVoiceNote(null);
    setListening(true);
    try {
      const transcript = await listenOnce();
      setText((prev) => (prev.trim() ? `${prev.trim()} ${transcript}` : transcript));
      setVoiceNote("Filled from voice — review before Plan it. Does not bypass Live confirm.");
    } catch (err) {
      setVoiceNote(err instanceof Error ? err.message : "Voice failed");
    } finally {
      setListening(false);
    }
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
          {voiceOn ? (
            <button
              type="button"
              className={`btn sec voice-ptt${listening ? " listening" : ""}`}
              style={{ padding: "9px 12px" }}
              disabled={planning || listening}
              onClick={() => void onPushToTalk()}
              aria-pressed={listening}
              title="Push to talk — fills the outcome field only"
            >
              {listening ? "Listening…" : "Mic"}
            </button>
          ) : null}
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
            : voiceNote
              ? voiceNote
              : "Describe the outcome, not the steps. Calls JARVIS API Shadow Loop (mock adapter). Live still asks before it runs."}
        </p>
      </form>
    </div>
  );
}
