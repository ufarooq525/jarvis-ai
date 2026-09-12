# Jarvis-ai

Personal **Goal Engine / control plane** above Umer AI OS.

```
YOU (UI :5173)
   │
JARVIS API (:3020)
   │
Goal Engine
   │
Adapter Contract → Mock (Phase A) | Umer OS Adapter (later)
```

## Phase A — run locally

```bash
pnpm install

# terminal 1 — API (mock adapter only)
pnpm dev:api

# terminal 2 — UI
pnpm dev:web
```

Open **http://127.0.0.1:5173** — create an outcome, view runs + evidence.

```bash
pnpm test
curl -s http://127.0.0.1:3020/health
curl -s -X POST http://127.0.0.1:3020/v1/goals/shadow-loop ^
  -H "content-type: application/json" ^
  -d "{\"title\":\"Weekly overview\",\"outcome\":\"Prepare a weekly company overview plan\",\"domain\":\"ops\"}"
```

UI talks **only** to `:3020`. Never to Umer control-api `:4000`.

## Docs

| Doc | Role |
| --- | --- |
| [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md) | **Calm Intelligence** UI system |
| [docs/implementation-phases.md](./docs/implementation-phases.md) | FE+BE phased plan + verify gates |
| [docs/project-context.md](./docs/project-context.md) | Locked decisions + adapter rule |
| [docs/jarvis-integration-architecture-report.md](./docs/jarvis-integration-architecture-report.md) | Integration report |
| [notes.md](./notes.md) | Checklist |

## Explicit non-goals (now)

Live OS adapter · voice · Mission Control redesign · FE calling `:4000`
