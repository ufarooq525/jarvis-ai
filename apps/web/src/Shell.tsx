import { Outlet, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { getHealth } from "./api";
import { applyTheme, resolveTheme, toggleTheme, type Theme } from "./theme";
import { useJarvis } from "./store/JarvisProvider";
import { Composer } from "./components/Composer";
import { PlanDrawer } from "./components/PlanDrawer";
import { CommandPalette } from "./components/CommandPalette";
import { UndoToast } from "./components/UndoToast";
import { LiveConfirmDialog } from "./components/LiveConfirmDialog";
import { PromoteLiveDialog } from "./components/PromoteLiveDialog";
import { AttentionRail } from "./components/AttentionRail";
import { SideNav, type SideGroup } from "./components/SideNav";

const LS_SIDE = "jarvis.sidebar_collapsed";

export function Shell() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [adapter, setAdapterName] = useState<string>("mock");
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [attentionOpen, setAttentionOpen] = useState(false);
  const [sideCollapsed, setSideCollapsed] = useState(() => {
    try {
      return localStorage.getItem(LS_SIDE) === "1";
    } catch {
      return false;
    }
  });
  const [mobileNav, setMobileNav] = useState(false);
  const { mode, goals, requestLiveMode, setMode } = useJarvis();
  const location = useLocation();
  const onBoard = location.pathname === "/";

  const groups = useMemo<SideGroup[]>(
    () => [
      {
        id: "command",
        label: "Command",
        items: [
          { to: "/", label: "Board", end: true },
          { to: "/mission", label: "Mission" },
          { to: "/goals", label: "Goals", badge: goals.length || undefined },
          { to: "/approvals", label: "Approvals" },
        ],
      },
      {
        id: "work",
        label: "Work",
        items: [
          { to: "/world", label: "World" },
          { to: "/skills", label: "Skills" },
          { to: "/ops", label: "Ops" },
          { to: "/activity", label: "Activity" },
        ],
      },
      {
        id: "runtimes",
        label: "Runtimes",
        items: [
          { to: "/computer", label: "Computer" },
          { to: "/browser", label: "Browser" },
          { to: "/models", label: "Models" },
        ],
      },
      {
        id: "system",
        label: "System",
        items: [{ to: "/settings", label: "Settings" }],
      },
    ],
    [goals.length],
  );

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    getHealth()
      .then((h) => {
        setApiOk(true);
        setAdapterName(h.adapter ?? "mock");
      })
      .catch(() => setApiOk(false));
  }, [location.pathname]);

  useEffect(() => {
    setMobileNav(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
      if (e.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  function toggleSide() {
    setSideCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(LS_SIDE, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  return (
    <div
      className={`app-shell${sideCollapsed ? " side-collapsed" : ""}`}
      data-mode={mode === "live" ? "live" : "shadow"}
    >
      <SideNav
        collapsed={sideCollapsed}
        onToggle={toggleSide}
        groups={groups}
        mobileOpen={mobileNav}
        onNavigate={() => setMobileNav(false)}
      />

      <div className="shell-main">
        <header className="top">
          <button
            type="button"
            className="ico side-menu"
            aria-label="Open navigation"
            onClick={() => setMobileNav(true)}
          >
            ☰
          </button>

          <div className="top-r">
            <button type="button" className="kbd" onClick={() => setPaletteOpen(true)}>
              <span>Search or state an outcome</span>
              <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
            </button>

            <div className="guard">
              <span className="guard-dot" />
              <b>{mode === "live" ? "Live" : "Shadow"}</b>
              <span className="guard-copy">
                {mode === "live"
                  ? "Approval still required before anything runs"
                  : "Nothing reaches the outside world"}
              </span>
              <button
                type="button"
                onClick={() => (mode === "shadow" ? requestLiveMode() : setMode("shadow"))}
              >
                {mode === "shadow" ? "Switch to Live" : "Back to Shadow"}
              </button>
            </div>

            <button
              type="button"
              className="ico"
              aria-label="Toggle dark mode"
              onClick={() => setTheme((t) => toggleTheme(t))}
            >
              ◐
            </button>
          </div>
        </header>

        {apiOk === false && (
          <div className="offline">
            JARVIS API offline — run <code>pnpm dev:api</code> on :3020. Board UI still works with
            local Shadow plans.
          </div>
        )}

        {apiOk && adapter === "umer-read" && (
          <div
            className="offline"
            style={{ background: "var(--warn-bg, #f5f0e6)", color: "inherit" }}
          >
            Umer adapter — Shadow is local noop; Live requires typing LIVE (Phase E) and may POST
            /plan.
          </div>
        )}

        <div className="shell-content">
          <Outlet />
        </div>
      </div>

      <Composer visible={onBoard} />
      <PlanDrawer />
      <AttentionRail
        open={attentionOpen}
        onOpen={() => setAttentionOpen(true)}
        onClose={() => setAttentionOpen(false)}
      />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <UndoToast />
      <LiveConfirmDialog />
      <PromoteLiveDialog />
    </div>
  );
}
