# JARVIS — Live verification

Live verification exercises **real** developed paths (Umer OS promote, computer Live open).  
Unit/Shadow tests stay on `pnpm verify`. This suite does **not** use `/v1/escalations/demo` or stop at Shadow.

## Automated unit / Shadow (no OS write)

```bash
pnpm verify
pnpm shadow "Find 10 Laravel SaaS opportunities in Saudi Arabia."
```

Expect: `SIMULATED / No external action was performed`.

## Full Live suite (default)

Performs real actions:

1. Switch adapter to **Umer OS** + `project_id`
2. Goal intake → Strong-confirm **LIVE** → Control API plan (`os_run_id`)
3. `live-status` + evidence chain
4. Computer **Live open** Notepad (type `OPEN`) — launches the app
5. Kill switch blocks Live open; then clears
6. Click/act remains 403

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
4. Kill switch ON → Live blocked  
5. Do not rely on Approvals “demo” for Live confidence

### Phase E / Live exit criteria

- [ ] Without `LIVE` → no `POST …/plan`
- [ ] With `LIVE` + OS up + project_id → plan fires; JARVIS shows `os_run_id`
- [ ] Computer without `OPEN` → 428; with `OPEN` → real launch + LIVE notice
- [ ] Kill switch blocks Live
- [ ] Missing project_id fails closed
- [ ] Evidence / journal record Live decisions
- [ ] Click/type still blocked

## Architecture reminder

```text
UI / curl → JARVIS API → Goal Engine → OsRuntimeAdapter → Umer Control API
                         ComputerRuntime → allowlisted spawn (OPEN confirm)
```

Goal Engine never invents OS routes. Live writes only through the adapter after Strong-confirm.  
Computer Live open is a separate capability layer (not a second Goal Engine).
