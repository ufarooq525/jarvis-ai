/** Opt-in browser speech-to-text — push-to-talk only. No always-on listening. */

export type VoiceSupport = {
  supported: boolean;
  reason?: string;
};

type SpeechRec = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

function getSpeechRecognitionCtor(): (new () => SpeechRec) | null {
  const w = window as Window & {
    SpeechRecognition?: new () => SpeechRec;
    webkitSpeechRecognition?: new () => SpeechRec;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupport(): VoiceSupport {
  if (typeof window === "undefined") return { supported: false, reason: "ssr" };
  if (!getSpeechRecognitionCtor()) {
    return { supported: false, reason: "Web Speech API not available in this browser" };
  }
  return { supported: true };
}

export const VOICE_LS_KEY = "jarvis.voice_enabled";

export function isVoiceEnabled(): boolean {
  try {
    return localStorage.getItem(VOICE_LS_KEY) === "1";
  } catch {
    return false;
  }
}

export function setVoiceEnabled(on: boolean): void {
  localStorage.setItem(VOICE_LS_KEY, on ? "1" : "0");
}

/**
 * One-shot push-to-talk. Resolves with final transcript or rejects.
 * Caller must only invoke after explicit user gesture.
 */
export function listenOnce(opts?: { lang?: string; timeoutMs?: number }): Promise<string> {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return Promise.reject(new Error("Speech recognition not supported"));

  return new Promise((resolve, reject) => {
    const rec = new Ctor();
    rec.lang = opts?.lang ?? "en-US";
    rec.continuous = false;
    rec.interimResults = false;
    let done = false;

    const timer = window.setTimeout(() => {
      if (done) return;
      done = true;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      reject(new Error("Listening timed out — try again"));
    }, opts?.timeoutMs ?? 12_000);

    rec.onresult = (ev) => {
      const text = ev.results?.[0]?.[0]?.transcript?.trim() ?? "";
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      if (!text) reject(new Error("No speech detected"));
      else resolve(text);
    };
    rec.onerror = (ev) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      reject(new Error(ev.error ?? "Speech recognition error"));
    };
    rec.onend = () => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      reject(new Error("Listening ended without a result"));
    };

    try {
      rec.start();
    } catch (e) {
      window.clearTimeout(timer);
      reject(e instanceof Error ? e : new Error("Could not start microphone"));
    }
  });
}
