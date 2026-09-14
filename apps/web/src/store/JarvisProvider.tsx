import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getConnection,
  getGoal,
  getLiveStatus,
  listGoals,
  promoteLive,
  runShadowLoop,
} from "../api";
import { mapDetailToBoardGoal } from "./mapApiGoal";
import {
  nowStr,
  todayLabel,
  writesCount,
  type Goal,
  type LogEntry,
  type Mode,
  type Stage,
} from "./types";

type Overlay = Partial<Pick<Goal, "stage" | "progress" | "approvedAt" | "leaving" | "needsAttention" | "summary">>;

type JarvisContextValue = {
  mode: Mode;
  goals: Goal[];
  log: LogEntry[];
  loading: boolean;
  error: string | null;
  planning: boolean;
  drawerId: string | null;
  toast: { goalId: string; text: string } | null;
  liveFlash: boolean;
  composerMode: Mode;
  setComposerMode: (m: Mode) => void;
  openDrawer: (id: string) => void;
  closeDrawer: () => void;
  requestLiveMode: () => void;
  confirmLiveMode: () => void;
  stayShadow: () => void;
  liveConfirmOpen: boolean;
  setMode: (m: Mode) => void;
  approve: (id: string) => void;
  cancelPromote: () => void;
  confirmPromoteLive: (confirm?: string) => Promise<void>;
  promoteTarget: Goal | null;
  promoting: boolean;
  undo: (id: string) => void;
  discard: (id: string) => void;
  stopLive: (id: string) => void;
  planOutcome: (text: string, preferredMode?: Mode) => Promise<void>;
  refresh: () => Promise<void>;
  hideToast: () => void;
  byStage: (st: Stage | "done-col") => Goal[];
};

const JarvisContext = createContext<JarvisContextValue | null>(null);

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(() => {
    const saved = localStorage.getItem("jarvis.ui_mode");
    return saved === "live" ? "live" : "shadow";
  });
  const [composerMode, setComposerMode] = useState<Mode>("shadow");
  const [goals, setGoals] = useState<Goal[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [planning, setPlanning] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ goalId: string; text: string } | null>(null);
  const [liveFlash, setLiveFlash] = useState(false);
  const [liveConfirmOpen, setLiveConfirmOpen] = useState(false);
  const [promoteId, setPromoteId] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const tickRef = useRef<number | null>(null);
  const undoRef = useRef<number | null>(null);
  const overlays = useRef<Map<string, Overlay>>(new Map());

  useEffect(() => {
    document.documentElement.dataset.mode = mode;
  }, [mode]);

  const setMode = useCallback((m: Mode) => {
    setModeState(m);
    setComposerMode(m);
    localStorage.setItem("jarvis.ui_mode", m);
    document.documentElement.dataset.mode = m;
  }, []);

  const openDrawer = useCallback((id: string) => setDrawerId(id), []);
  const closeDrawer = useCallback(() => setDrawerId(null), []);

  const hideToast = useCallback(() => {
    setToast(null);
    if (undoRef.current) window.clearTimeout(undoRef.current);
  }, []);

  const appendLog = useCallback((entry: Omit<LogEntry, "id">) => {
    setLog((prev) => [{ ...entry, id: uid("log") }, ...prev]);
  }, []);

  const applyOverlays = useCallback((mapped: Goal[]): Goal[] => {
    return mapped.map((g) => {
      const o = overlays.current.get(g.id);
      if (!o) return g;
      // A stale "done" overlay must not hide a Shadow plan that still needs OPEN.
      if (g.stage === "shadow" && o.stage === "done") {
        return { ...g, ...o, stage: "shadow" };
      }
      return { ...g, ...o };
    });
  }, []);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const listed = await listGoals();
      const details = await Promise.all(
        listed.goals.map(async (g) => {
          try {
            return await getGoal(g.id);
          } catch {
            return null;
          }
        }),
      );
      const mapped = details
        .filter((d): d is NonNullable<typeof d> => Boolean(d))
        .map((d) => mapDetailToBoardGoal(d, overlays.current.get(d.goal.id)))
        .sort((a, b) => b.at.localeCompare(a.at));
      setGoals(applyOverlays(mapped));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load goals from API");
    } finally {
      setLoading(false);
    }
  }, [applyOverlays]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const byStage = useCallback(
    (st: Stage | "done-col") => {
      if (st === "done-col" || st === "done") {
        return goals.filter(
          (g) => g.stage === "done" || g.stage === "failed" || g.stage === "discarded",
        );
      }
      return goals.filter((g) => g.stage === st);
    },
    [goals],
  );

  const tick = useCallback(
    (id: string) => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        setGoals((prev) => {
          const g = prev.find((x) => x.id === id);
          if (!g || g.stage !== "live") {
            if (tickRef.current) window.clearInterval(tickRef.current);
            return prev;
          }
          const prog = g.progress ?? 1;
          if (prog >= g.steps.length) {
            if (tickRef.current) window.clearInterval(tickRef.current);
            const w = writesCount(g);
            overlays.current.set(id, {
              stage: "done",
              progress: undefined,
              summary: `Finished (session). ${w} write step(s) — still mock until Phase E.`,
            });
            appendLog({
              day: todayLabel(),
              time: nowStr(),
              kind: "dn",
              title: `Finished "${g.title}"`,
              detail: "Session Live simulation completed. No Control API write yet.",
              fx: `wrote ${w} · sent 0`,
              fxk: "real",
              real: true,
              goalId: id,
            });
            return prev.map((x) =>
              x.id === id
                ? {
                    ...x,
                    stage: "done" as const,
                    summary: `Finished (session). ${w} write step(s) — still mock until Phase E.`,
                    progress: undefined,
                  }
                : x,
            );
          }
          const next = { progress: prog + 1, stage: "live" as const };
          overlays.current.set(id, { ...overlays.current.get(id), ...next });
          return prev.map((x) => (x.id === id ? { ...x, progress: prog + 1 } : x));
        });
      }, 2200);
    },
    [appendLog],
  );

  const approve = useCallback(
    (id: string) => {
      const g = goals.find((x) => x.id === id);
      // Missing from the board is fine (Goal Detail). Live/failed/discarded may not re-promote.
      if (g && (g.stage === "live" || g.stage === "failed" || g.stage === "discarded")) return;
      setPromoteId(id);
    },
    [goals],
  );

  const cancelPromote = useCallback(() => {
    if (promoting) return;
    setPromoteId(null);
  }, [promoting]);

  const confirmPromoteLive = useCallback(async (confirm = "LIVE") => {
    if (!promoteId) return;
    const g = goals.find((x) => x.id === promoteId);
    if (!g) return;
    setPromoting(true);
    setError(null);
    try {
      const fromLs = localStorage.getItem("jarvis.os_project_id")?.trim();
      let projectId = fromLs || undefined;
      let adapter = "mock";
      try {
        const conn = await getConnection();
        if (conn.project_id) projectId = conn.project_id;
        adapter = conn.adapter;
      } catch {
        /* use localStorage */
      }
      const computerSlice = confirm.trim() === "OPEN";
      if (!computerSlice && adapter === "umer-read" && !projectId) {
        throw new Error(
          "No project selected — open Settings, click Umer OS (real), pick a project, then try again.",
        );
      }
      const result = await promoteLive(promoteId, {
        confirm,
        project_id: computerSlice ? undefined : projectId,
      });
      const detail = await getGoal(result.goal.id);
      const computerDone =
        computerSlice &&
        (detail.goal.status === "done" ||
          detail.goal.status === "succeeded" ||
          detail.goal.status === "blocked" ||
          detail.goal.status === "failed");
      const overlayStage: Stage = computerDone
        ? detail.goal.status === "blocked" || detail.goal.status === "failed"
          ? "failed"
          : "done"
        : "live";
      const mapped = mapDetailToBoardGoal(
        detail,
        result.os_run_id || overlayStage === "live"
          ? { stage: overlayStage, progress: overlayStage === "live" ? 1 : undefined, approvedAt: nowStr() }
          : { stage: overlayStage, approvedAt: nowStr() },
      );
      overlays.current.set(mapped.id, {
        stage: overlayStage,
        progress: overlayStage === "live" ? 1 : undefined,
        approvedAt: mapped.approvedAt,
      });
      setGoals((prev) => {
        const rest = prev.filter((x) => x.id !== mapped.id && x.id !== promoteId);
        return [mapped, ...rest];
      });
      appendLog({
        day: todayLabel(),
        time: nowStr(),
        kind: "lv",
        title: `Live promote "${result.goal.title}"`,
        detail: result.message,
        fx: result.os_run_id ? `os_run ${result.os_run_id}` : "live dispatch",
        fxk: "real",
        mine: true,
        real: true,
        goalId: result.goal.id,
      });
      setPromoteId(null);
      closeDrawer();
      setLiveFlash(true);
      window.setTimeout(() => setLiveFlash(false), 800);
      setToast({
        goalId: result.goal.id,
        text: result.os_run_id
          ? result.goal.status === "done"
            ? `Live run completed — ${result.os_run_id}`
            : `Live started — waiting for run completion (${result.os_run_id})`
          : `Live promote: ${result.message}`,
      });
      if (undoRef.current) window.clearTimeout(undoRef.current);
      undoRef.current = window.setTimeout(() => setToast(null), 7000);

      const gid = result.goal.id;
      if (!computerSlice) {
        let n = 0;
        const poll = window.setInterval(() => {
          n += 1;
          void getLiveStatus(gid)
            .then((s) => {
              if (s.os_run?.status === "succeeded" || s.run?.status === "succeeded") {
                overlays.current.set(gid, { stage: "done", progress: undefined });
                setGoals((prev) =>
                  prev.map((x) => (x.id === gid ? { ...x, stage: "done" as const } : x)),
                );
                window.clearInterval(poll);
              }
            })
            .catch(() => undefined);
          if (n >= 8) window.clearInterval(poll);
        }, 2500);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Live promote failed";
      setError(msg);
      appendLog({
        day: todayLabel(),
        time: nowStr(),
        kind: "fl",
        title: "Live promote failed",
        detail: msg,
        fx: "blocked",
        real: false,
        goalId: promoteId,
      });
    } finally {
      setPromoting(false);
    }
  }, [promoteId, goals, appendLog, closeDrawer]);

  const undo = useCallback(
    (id: string) => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      overlays.current.set(id, { stage: "shadow", progress: undefined, approvedAt: undefined });
      setGoals((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                stage: "shadow" as const,
                progress: undefined,
                approvedAt: undefined,
                leaving: false,
              }
            : x,
        ),
      );
      setLog((prev) => prev.filter((e) => !e.undoable));
      hideToast();
    },
    [hideToast],
  );

  const discard = useCallback(
    (id: string) => {
      overlays.current.set(id, { stage: "discarded" });
      setGoals((prev) =>
        prev.map((x) => (x.id === id ? { ...x, stage: "discarded" as const } : x)),
      );
      appendLog({
        day: todayLabel(),
        time: nowStr(),
        kind: "dn",
        title: "You discarded a plan",
        detail: "It never ran.",
        mine: true,
        goalId: id,
      });
      closeDrawer();
    },
    [appendLog, closeDrawer],
  );

  const stopLive = useCallback(
    (id: string) => {
      if (tickRef.current) window.clearInterval(tickRef.current);
      overlays.current.set(id, {
        stage: "failed",
        progress: undefined,
        summary: "Stopped — rolled back (session). Nothing left changed.",
      });
      setGoals((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                stage: "failed" as const,
                progress: undefined,
                summary: "Stopped — rolled back (session). Nothing left changed.",
              }
            : x,
        ),
      );
      appendLog({
        day: todayLabel(),
        time: nowStr(),
        kind: "fl",
        title: "You stopped a Live run",
        detail: "Session simulation rolled back. No Control API side effects.",
        fx: "rolled back · nothing changed",
        fxk: "real",
        real: true,
        mine: true,
        goalId: id,
      });
      closeDrawer();
    },
    [appendLog, closeDrawer],
  );

  const planOutcome = useCallback(
    async (text: string, preferredMode?: Mode) => {
      const title = text.trim().slice(0, 72) || "Untitled outcome";
      const pendingId = uid("pending");
      const at = nowStr();
      setPlanning(true);
      setError(null);
      setGoals((prev) => [
        {
          id: pendingId,
          title,
          summary: text.trim(),
          domain: "general",
          stage: "stated",
          at,
          steps: [],
          effects: null,
          source: "local",
        },
        ...prev,
      ]);
      appendLog({
        day: todayLabel(),
        time: at,
        kind: "",
        title: `You stated "${title}"`,
        detail:
          preferredMode === "live"
            ? "Planning in Shadow first, then asking for Live confirm…"
            : "Calling JARVIS Goal Engine (Shadow)…",
        mine: true,
        goalId: pendingId,
      });

      try {
        const result = await runShadowLoop({
          title,
          outcome: text.trim(),
          domain: "general",
        });

        const detail =
          result.detail ??
          (await getGoal(result.goal.id).catch(() => null));

        setGoals((prev) => {
          const withoutPending = prev.filter((g) => g.id !== pendingId);
          if (!detail) {
            const fallback: Goal = {
              id: result.goal.id,
              title: result.goal.title,
              summary: result.goal.outcome,
              domain: "general",
              stage: "shadow",
              at: nowStr(),
              steps: [],
              effects: {
                filesWritten: 0,
                messagesSent: 0,
                deletes: "no",
                reversible: "yes — Shadow simulation only",
              },
              source: "api",
            };
            return [fallback, ...withoutPending.filter((g) => g.id !== result.goal.id)];
          }
          const mapped = mapDetailToBoardGoal(detail);
          return [mapped, ...withoutPending.filter((g) => g.id !== mapped.id)];
        });

        const merged = result.decision_outcome === "merge_into_existing";
        appendLog({
          day: todayLabel(),
          time: nowStr(),
          kind: "sh",
          title: merged
            ? `Already had an active plan for "${result.goal.title}"`
            : `Planned "${result.goal.title}" in Shadow`,
          detail: merged
            ? "Merged into the existing active goal — no second Shadow run. Discard or finish that goal to plan it again."
            : preferredMode === "live"
              ? "Shadow plan ready. Confirm with OPEN or LIVE to run it for real."
              : result.message ||
                "Shadow plan ready. Waiting on your review — nothing reaches the outside world until you approve.",
          fx: "simulated · nothing sent",
          fxk: "sim",
          goalId: result.goal.id,
        });
        if (preferredMode === "live") {
          setPromoteId(result.goal.id);
        }
      } catch (e) {
        setGoals((prev) => prev.filter((g) => g.id !== pendingId));
        const msg = e instanceof Error ? e.message : "Shadow loop failed";
        setError(msg);
        appendLog({
          day: todayLabel(),
          time: nowStr(),
          kind: "fl",
          title: `Failed to plan "${title}"`,
          detail: msg,
          mine: true,
        });
      } finally {
        setPlanning(false);
      }
    },
    [appendLog],
  );

  const value = useMemo<JarvisContextValue>(
    () => ({
      mode,
      goals,
      log,
      loading,
      error,
      planning,
      drawerId,
      toast,
      liveFlash,
      composerMode,
      setComposerMode,
      openDrawer,
      closeDrawer,
      requestLiveMode: () => setLiveConfirmOpen(true),
      confirmLiveMode: () => {
        setMode("live");
        setLiveConfirmOpen(false);
      },
      stayShadow: () => setLiveConfirmOpen(false),
      liveConfirmOpen,
      setMode,
      approve,
      cancelPromote,
      confirmPromoteLive,
      promoteTarget: promoteId
        ? (goals.find((g) => g.id === promoteId) ?? {
            id: promoteId,
            title: "Goal",
            summary: "",
            domain: "general",
            stage: "shadow",
            at: nowStr(),
            steps: [],
            effects: null,
          })
        : null,
      promoting,
      undo,
      discard,
      stopLive,
      planOutcome,
      refresh,
      hideToast,
      byStage,
    }),
    [
      mode,
      goals,
      log,
      loading,
      error,
      planning,
      drawerId,
      toast,
      liveFlash,
      composerMode,
      openDrawer,
      closeDrawer,
      liveConfirmOpen,
      setMode,
      approve,
      cancelPromote,
      confirmPromoteLive,
      promoteId,
      promoting,
      undo,
      discard,
      stopLive,
      planOutcome,
      refresh,
      hideToast,
      byStage,
    ],
  );

  return <JarvisContext.Provider value={value}>{children}</JarvisContext.Provider>;
}

export function useJarvis() {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvis must be used within JarvisProvider");
  return ctx;
}
