# Working notes

## Checklist

- [x] Phases A–G
- [x] **Phase H / 5** — Computer Runtime (observe, locate, Shadow + gated Live open)
- [x] **Phase 6** — Browser SHADOW research — 2026-09-13
  - [x] Allowlisted read-only GET + extract (fact / inference / uncertainty)
  - [x] `GET /v1/browser/snapshot|allowlist`, `POST /v1/browser/shadow-research`, act → 403
  - [x] Evidence + never claim visit on failed fetch
  - [x] `/browser` UI
  - [ ] Manual: Browser → Research example.com → facts with source URL

## Connection (FE)

Settings → Connection: adapter (Mock | Umer OS), Control API base, **work-graph** `project_id` from `/v1/work-projects`. Save persists on API + localStorage.

## Next

- [ ] Phase 7 — Memory & World Model
- [ ] Phase I — Voice (last)
- [x] Live verification (OS + computer + browser) — `pnpm verify:live`
- [x] Phases 1–5 foundation slices

## Verify

```bash
pnpm verify          # unit/integration + typecheck (Shadow-safe)
pnpm verify:live     # REAL Live: OS promote + computer OPEN + browser research
pnpm verify:live:dry # Live gates only
```

See `docs/LIVE_VERIFICATION.md`.
