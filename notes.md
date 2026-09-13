# Working notes

## Checklist

- [x] Phases 1–10
- [x] **Phase 11** — Command Center UI — 2026-09-14
  - [x] Attention rail (CSS drawer) + escalations / Now
  - [x] Goal detail route `/goals/:id` + progressive disclosure
  - [x] Board hierarchy gloss (doing → decisions → happened)
- [x] **Phase 12** — Reliability — 2026-09-14
  - [x] `/v1/system/status` + `pnpm verify:all`
  - [x] Live docs: local verify SoT; demo ≠ Live truth
- [x] **Phase I Voice** — opt-in push-to-talk — 2026-09-14
  - [x] Settings toggle + Composer Mic (fills text only)
  - [x] `/v1/voice/status` — no always-on / no Live bypass

## Verify

```bash
pnpm verify
pnpm verify:all
pnpm verify:live
```
