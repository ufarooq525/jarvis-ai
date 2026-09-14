# JARVIS — Live verification

Live verification exercises **real** developed paths (Umer OS promote, computer Live open).  
Unit/Shadow tests stay on `pnpm verify`. This suite does **not** use `/v1/escalations/demo` or stop at Shadow.

**Source of truth while evolving:** local verification (`pnpm verify`, then `pnpm verify:live` when OS is up). CI is optional. Demo escalations are practice only — never Live truth.

## Automated unit / Shadow (no OS write)

```bash
pnpm verify
pnpm verify:all          # verify + verify:live:dry (gates only)
pnpm shadow "Find 10 Laravel SaaS opportunities in Saudi Arabia."
```

Expect: `SIMULATED / No external action was performed`.

System reliability snapshot (no side effects):

```bash
curl -s http://127.0.0.1:3020/v1/system/status
curl -s http://127.0.0.1:3020/v1/voice/status
```

## Full Live suite (default)

Performs real actions:

1. Switch adapter to **Umer OS** + `project_id`
2. Goal intake → Strong-confirm **LIVE** → Control API plan (`os_run_id`)
3. `live-status` + evidence chain
4. Computer **Live open** Notepad (type `OPEN`) — launches the app
5. Goal path **Open Notepad|Cursor and type Hello from Jarvis** → Shadow simulates; Live `OPEN` types into that pid (see manual note below)
6. Kill switch blocks Live open; then clears
7. Browser **SHADOW research** against `https://example.com/` (allowlisted GET + facts)
8. Click / scroll / focus_window remain 403 (computer + browser)

### Prerequisites

| Requirement | Default |
| --- | --- |
| Umer Control API | `http://127.0.0.1:4000` |
| JARVIS API | `http://127.0.0.1:3020` (`pnpm dev:api`) |
| Work-graph project id | From OS `/v1/work-projects` or Settings |

### PowerShell

```powershell
$env:JARVIS_API_BASE = "http://127.0.0.1:3020"
$env:CONTROL_API_BASE = "http://127.0.0.1:4000"
$env:JARVIS_OS_PROJECT_ID = "proj-YOUR-ID"

pnpm verify:live
```

### Opt-outs

```powershell
# Gates only — no OS plan, no app launch
$env:VERIFY_LIVE_DRY = "1"
pnpm verify:live

# Skip one plane
$env:VERIFY_LIVE_SKIP_OS = "1"
$env:VERIFY_LIVE_SKIP_COMPUTER = "1"
pnpm verify:live
```

Also available: `pnpm verify:live:dry` (same as `VERIFY_LIVE_DRY=1`).

Fails closed if JARVIS/Control is down, `project_id` missing, adapter is mock, or kill switch was already engaged.

### Manual UI checklist

1. Settings → Connection → adapter **Umer OS**, Control API base, **project_id** → Save  
2. Board: create goal → Request Live → type **LIVE** → expect `os_run_id`  
3. Computer → **Live open…** → type **OPEN** → app launches  
3b. Board: goal **Open Notepad and type Hello from Jarvis.** → Request Live → type **OPEN** (not LIVE) → Notepad launches, text is typed into that window, report shows process/window/read-back  
4. Kill switch ON → Live blocked  
5. Do not rely on Approvals “practice demo” for Live confidence  
6. Attention rail (right edge) shows pending decisions + Now  
7. Goals → open a goal detail (`/goals/:id`) for progressive evidence disclosure  
8. Settings → Voice (opt-in) → Mic on Board fills text only (no execute)

### Phase E / Live exit criteria

- [ ] Without `LIVE` → no `POST …/plan`
- [ ] With `LIVE` + OS up + project_id → plan fires; JARVIS shows `os_run_id`
- [ ] Computer without `OPEN` → 428; with `OPEN` → real launch + LIVE notice
- [ ] Kill switch blocks Live
- [ ] Missing project_id fails closed
- [ ] Evidence / journal record Live decisions
- [ ] Click/scroll/focus_window still blocked; `computer.type_text` Live only after OPEN on the identified pid

### Manual Live note — “Open Notepad and type Hello from Jarvis”

This path touches **real OS window state**. Unit tests cover Shadow (assert `typeInto` is never called) and Live with an injected typer. They do **not** launch Notepad.

Do this on a Windows host when you want the real slice:

1. `pnpm shadow "Open Notepad and type Hello from Jarvis."`  
   Expect two tasks (`computer.open_app` → `computer.type_text`), `SIMULATED`, **no** Notepad window, report says no keystrokes sent.
2. In the UI, Request Live on that goal and type **OPEN** (not `LIVE`).  
   Expect: a new Notepad process (on Windows 11 this may be `WindowsApps\...\Notepad.exe`, not the spawn stub); `Hello from Jarvis` in that window’s text editor; Goal Detail report names the pid/hwnd and the UIA text read-back.
3. If the window cannot be identified, or read-back does not match, the goal must stay **blocked** with that reason — never “task completed.”
4. Same loop for **Open Cursor and type Hello from Jarvis.** — type **OPEN**; expect a Cursor window (`--new-window`; do not type into an unidentified existing session).
5. Click / scroll / focus_window must still refuse.

Known gap: if UIA `ValuePattern` is missing, the script falls back to `SendKeys` after focusing that editor control. Verification still reads the same control; mismatch → blocked.

### Phase 12 reliability checklist

- [ ] `pnpm verify` passes (unit + typecheck)
- [ ] `/v1/system/status` reports `demo_escalations_are_truth: false`
- [ ] Cancel / retry / idempotency covered in Shadow Loop tests
- [ ] Live path uses `verify:live`, not Approvals demo
- [ ] Voice never bypasses LIVE/OPEN confirm

## Architecture reminder

JARVIS is the control plane; Umer AI OS is execution. Keep `OsRuntimeAdapter`. No second Goal Engine.
