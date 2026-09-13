# Working notes

## Checklist

- [x] Phases A–G
- [x] **Phase H** — Computer observe — 2026-09-12
  - [x] `GET /v1/computer/snapshot` (observe-only)
  - [x] `POST /v1/computer/act` → 403
  - [x] `/computer` UI panel
- [x] **Phase 5** — Computer Runtime SHADOW slice — 2026-09-13
  - [x] Locate targets (VS Code / browser / terminal / file manager / notepad)
  - [x] `GET /v1/computer/targets` + `POST /v1/computer/shadow-open` (simulated; no launch)
  - [x] Before/after observe + verify; evidence when `goal_id` set
  - [x] Tool manifests: locate / open_app / focus / click / type
  - [x] Click/type remain blocked; Live open gated with type OPEN
  - [ ] Manual: Computer → Live open… → type OPEN → Notepad launches

## Connection (FE)

Settings → Connection: adapter (Mock | Umer OS), Control API base, **work-graph** `project_id` from `/v1/work-projects` (e.g. `proj-2fced68d-…`). Save persists on API + localStorage. Promote Live uses that project for `POST /v1/work-graph/:id/plan`.

## Next

- [ ] Phase I — Voice (last; only after Attention model is solid)
- [x] Live verification docs + `pnpm verify:live` — 2026-09-13
- [x] Phase 2 slice: full manifests, durable escalations, policy bypass fix — 2026-09-13
- [x] Phase 3 slice: evidence task/action IDs, assumptions, integrity — 2026-09-13
- [x] Phase 4 slice: adapter cancel/poll/correlation/status sync — 2026-09-13
- [x] Phase 5 slice: computer locate + SHADOW open (click/type blocked) — 2026-09-13
- [x] Phase 5+ gated Live open (type OPEN, allowlisted spawn) — 2026-09-13

## Verify

```bash
pnpm verify          # unit/integration + typecheck (Shadow-safe)
pnpm verify:live     # REAL Live: OS promote + computer OPEN (needs Control API + project_id)
pnpm verify:live:dry # Live gates only (no OS write / no app launch)
```

See `docs/LIVE_VERIFICATION.md`.
