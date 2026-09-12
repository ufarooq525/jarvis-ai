# Umer OS Adapter — Phase D (read-only)

**Status:** implemented 2026-09-12 — observation only (`umer-read`)  
**Verified against:** `C:\laragon\www\umer-ai-os\apps\control-api\src\server.ts`  
**Config:** `JARVIS_ADAPTER=mock|umer-read`, `CONTROL_API_BASE=http://127.0.0.1:4000`

## Rule

```
JARVIS → Goal Engine → Adapter Contract → Mock | Umer OS Adapter → Control API (GET only)
```

Goal Engine never imports this folder’s HTTP details beyond the adapter class.

## Phase D mapping (used)

| Adapter method | HTTP | Notes |
| --- | --- | --- |
| `listCapabilities` | `GET /v1/agents` | Falls back to observe stub if empty |
| `getCurrentState` | `GET /v1/dashboard` + `GET /v1/agent-runs?status=running` + `GET /v1/gates/pending` | Parallel where useful |
| `getRun` | `GET /v1/agent-runs/:workPackageId` | 404 → `null` |
| `proposeRun` | **none** | Local simulate (OS has no dry-run) |
| `startRun` (shadow) | **none** | Local `noop_shadow` |
| `startRun` (live) | **none** | Throws `NotImplemented` until Phase E |
| `cancelRun` | **none** | Returns `{ ok: false }` |

## Writes forbidden in Phase D

| Path | Reason |
| --- | --- |
| `POST /v1/work-graph/:projectId/plan` | Live delegation — Phase E |
| `POST /v1/intake` | Side effects |
| `POST /v1/commands` | Side effects |
| Gate resolve / approve routes | Side effects |

## Confirmed OS gaps

| Need | Status |
| --- | --- |
| simulate / dry-run | **Missing** — local propose only |
| `GET /v1/ceo/attention` | **Missing** |
| Dedicated cancel → AbortSignal | **Missing** |

## Future Phase E+

`startRun` Live → `POST /v1/work-graph/:projectId/plan` with required `approver` + `JARVIS_OS_PROJECT_ID`.
Shadow path remains local noop. Strong-confirm is enforced in GoalEngine.promoteToLive (type `LIVE`).
