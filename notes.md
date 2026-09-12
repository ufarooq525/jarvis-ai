# Working notes

## Checklist

- [x] Phases A–G
- [x] **Phase H** — Computer observe — 2026-09-12
  - [x] `GET /v1/computer/snapshot` (observe-only)
  - [x] `POST /v1/computer/act` → 403
  - [x] `/computer` UI panel
  - [ ] Manual: open Computer → see host metrics; act stays blocked

## Connection (FE)

Settings → Connection: adapter (Mock | Umer OS), Control API base, **work-graph** `project_id` from `/v1/work-projects` (e.g. `proj-2fced68d-…`). Save persists on API + localStorage. Promote Live uses that project for `POST /v1/work-graph/:id/plan`.

## Next

- [ ] Phase I — Voice (last; only after Attention model is solid)

## Run

```bash
pnpm dev:api
pnpm dev:web
```

Open http://127.0.0.1:5173/computer
