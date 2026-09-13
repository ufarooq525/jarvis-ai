# Umer OS Adapter — Phase 4

**Status:** observation + gated Live plan + poll subscribe + best-effort cancel  
**Verified against:** `C:\laragon\www\umer-ai-os\apps\control-api\src\server.ts`  
**Config:** `JARVIS_ADAPTER=mock|umer-read`, `CONTROL_API_BASE=http://127.0.0.1:4000`, `JARVIS_OS_PROJECT_ID`, optional `JARVIS_OS_APPROVER`, `JARVIS_OS_CANCEL_AGENT_ID`

## Rule

```
JARVIS → Goal Engine → Adapter Contract → Mock | Umer OS Adapter → Control API
```

Goal Engine never imports OS packages. Do not invent routes — verify against Control API source.

## Method → HTTP mapping

| Adapter method | HTTP | Notes |
| --- | --- | --- |
| `listCapabilities` | `GET /v1/agents` | Falls back if empty/unreachable |
| `getCurrentState` | `GET /v1/dashboard` + `GET /v1/agent-runs?status=running` + `GET /v1/gates/pending` | |
| `getRun` | `GET /v1/agent-runs/:workPackageId` | Restores JARVIS correlation from adapter map; 404 may return retained “running” stub |
| `proposeRun` | **none** | Local simulate (OS has no dry-run) |
| `startRun` (shadow) | **none** | Local `noop_shadow` |
| `startRun` (live) | `POST /v1/work-graph/:projectId/plan` | Requires `project_id` + Strong-confirm in Goal Engine; adapter Live idempotency map |
| `cancelRun` | `POST /v1/commands` `{ name: "CancelWork", payload: { agentId, workPackageId } }` | Best-effort — plan `correlationId` may not be a workPackageId |
| `subscribeRun` | poll `getRun` | NATS not wired in JARVIS; controlled polling fallback |

## Confirmed OS gaps

| Need | Status |
| --- | --- |
| simulate / dry-run | **Missing** — local propose only |
| Dedicated HTTP abort | **Missing** — use CEO `CancelWork` |
| NATS event subscribe in JARVIS | **Not wired** — use `subscribeRun` poll |

## Safety

- Shadow never POSTs to Control API
- Live plan only after Goal Engine Strong-confirm (`LIVE`)
- Kill switch blocks Live in Goal Engine / policy
