# Working notes — honest status

## Product stance (2026-09-14)

JARVIS is a **control-plane operator**, not a collection of feature demos.
Phases 1–12 shipped scaffolding; many planes are **PARTIAL / SHADOW-only**.
Do **not** treat “page exists” as “product complete.”

## Reconciliation (in progress)

- [x] Audit of pages / APIs / runtimes
- [x] Command Center (`/` Now) — operator narrative from real data
- [x] Goal Detail as mission control (honest Shadow vs Live)
- [x] Attention actionable (escalations + Shadow review)
- [x] Nav IA: Command / Work / Knowledge / Runtimes / System
- [ ] Full Live E2E research scenario still **incomplete** (see gaps)

## What is genuinely working

- Shadow Loop: outcome → goal → tasks → policy → simulated runs → evidence → journal
- Live promote: type `LIVE` → OS plan via `OsRuntimeAdapter` (generic plan body)
- Computer Live open (type `OPEN`), Browser allowlisted GET + WM facts
- Approvals store, kill switch, Settings connection checklist

## What is NOT complete (do not claim otherwise)

- “Find 10 Laravel SaaS opportunities…” does **not** produce 10 opportunities
- Shadow verification can pass with `research.opportunity_count = 0`
- Ops send / Skills execute / Browser act / Computer click → blocked
- Mission/Portfolio is aggregation UI, not a separate engine
- Escalation approve ≠ Live OS dispatch
- Model router not in Goal Engine path

## Verify

```bash
pnpm verify
pnpm verify:all
pnpm verify:live
```

See `docs/COMMAND_CENTER_RECONCILIATION.md` for the full report.
