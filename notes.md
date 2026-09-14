# Working notes — honest status

## Product stance (2026-09-14)

JARVIS is a **personal operator / control plane**, not a collection of feature demos.
Architectural truth: `docs/JARVIS_ARCHITECTURE_TRUTH.md`.

## Operator loop (current)

Canonical path inside Goal Engine:

```text
outcome → goal → decision → policy → orchestrator → runtime → observation → evidence → verification → done | blocked
```

- Research outcomes use `browser.research` + memory + ops qualify — **not** an OS noop pretending to be research.
- Outcome KRs (`research.opportunity_count`) are measured from qualifying observations only.
- Unmet KRs **block** the goal. Shadow lifecycle is not outcome fulfillment.
- “Find 10 Laravel SaaS opportunities in Saudi Arabia” still does **not** yield 10 opportunities from allowlisted/simulated sources. That is a real block, not a fake `done`.

## Reconciliation

- [x] Audit of pages / APIs / runtimes
- [x] Command Center + Goal Detail honesty
- [x] Architecture truth map
- [x] Thin Decision Engine + Orchestrator over existing runtimes
- [ ] Full Live E2E through Umer AI OS with outcome payload still **incomplete**

## What is genuinely working

- Shadow operator loop: inspect → (OS start_run **or** browser research) → observations → evidence → verify outcome KRs
- Live promote: type `LIVE` → OS plan via `OsRuntimeAdapter` (generic `{ approver }` body — plan ≠ outcome)
- Computer Live open (`OPEN`), Browser allowlisted GET
- Approvals store, kill switch, Settings connection checklist

## What is NOT complete

- Live plan body still does not carry the research outcome
- Ops send / Skills execute / Browser act / Computer click → blocked
- Memory does not yet change later decisions beyond this loop’s KR
- Model router not in Goal Engine path
- Escalation approve ≠ Live OS dispatch

## Verify

```bash
pnpm verify
pnpm verify:all
pnpm verify:live
```
