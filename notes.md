# Working notes

## Checklist

- [x] Design pack + OS audit + adapter boundary
- [x] §16 Shadow Loop (mock / CLI)
- [x] Phased FE+BE plan
- [x] **Phase A–D** — API + Board + trust + SQLite + umer-read observe
  - [x] Manual A–D smoke (user 2026-09-12)
- [x] **Phase E** — Approve → Live startRun — 2026-09-12
  - [x] `promoteToLive` + `POST /v1/goals/:id/promote-live` (type `LIVE`)
  - [x] Umer adapter Live → `POST /v1/work-graph/:projectId/plan` `{ approver }`
  - [x] Hard gates: confirm phrase, kill switch, elevate off SHADOW, idempotent Live key
  - [x] FE PromoteLiveDialog + live-status poll
  - [x] Manual: Strong-confirm LIVE path verified (user 2026-09-12)

## Next

- [ ] **Phase F** — World Model + Memory (thin)
- [ ] Phase G — Mission Control
- [ ] Phase H — Computer use
- [ ] Phase I — Voice

## Run

```bash
pnpm install
pnpm dev:api
pnpm dev:web
pnpm test
```

Live against real OS (optional):

```bash
set JARVIS_ADAPTER=umer-read
set JARVIS_OS_PROJECT_ID=<work-graph-project-id>
set CONTROL_API_BASE=http://127.0.0.1:4000
pnpm dev:api
```

## Rule

```
JARVIS → Goal Engine → Adapter Contract → Mock | Umer OS Adapter
```

Shadow never POSTs plan. Live only after Strong-confirm `LIVE` + kill switch clear.
