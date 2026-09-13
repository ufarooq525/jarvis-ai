import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { getHealth } from "./api";
import { applyTheme, resolveTheme, toggleTheme, type Theme } from "./theme";
import { useJarvis } from "./store/JarvisProvider";
import { Composer } from "./components/Composer";
import { PlanDrawer } from "./components/PlanDrawer";
import { CommandPalette } from "./components/CommandPalette";
import { UndoToast } from "./components/UndoToast";
import { LiveConfirmDialog } from "./components/LiveConfirmDialog";
import { PromoteLiveDialog } from "./components/PromoteLiveDialog";

export function Shell() {
  const [apiOk, setApiOk] = useState<boolean | null>(null);
  const [adapter, setAdapterName] = useState<string>("mock");
  const [theme, setTheme] = useState<Theme>(() => resolveTheme());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { mode, goals, requestLiveMode, setMode } = useJarvis();
  const location = useLocation();
  const onBoard = location.pathname === "/";

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
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <div>
      <header className="top">
        <Link to="/" className="mark">
          <span className="mark-glyph">
            <span />
          </span>
          <b>JARVIS</b>
        </Link>

        <nav className="nav">
          <NavLink to="/" end>
            Board
          </NavLink>
          <NavLink to="/mission">Mission</NavLink>
          <NavLink to="/goals">
            Goals <em>{goals.length}</em>
          </NavLink>
          <NavLink to="/world">World</NavLink>
          <NavLink to="/computer">Computer</NavLink>
          <NavLink to="/browser">Browser</NavLink>
          <NavLink to="/activity">Activity</NavLink>
          <NavLink to="/approvals">Approvals</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>

        <div className="top-r">
          <button type="button" className="kbd" onClick={() => setPaletteOpen(true)}>
            <span>Search or state an outcome</span>
            <kbd>{isMac ? "⌘K" : "Ctrl K"}</kbd>
          </button>

          <div className="guard">
            <span className="guard-dot" />
            <b>{mode === "live" ? "Live" : "Shadow"}</b>
            <span>
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
        <div className="offline" style={{ background: "var(--warn-bg, #f5f0e6)", color: "inherit" }}>
          Umer adapter — Shadow is local noop; Live requires typing LIVE (Phase E) and may POST
          /plan.
        </div>
      )}

      <Outlet />

      <Composer visible={onBoard} />
      <PlanDrawer />
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <UndoToast />
      <LiveConfirmDialog />
      <PromoteLiveDialog />
    </div>
  );
}
