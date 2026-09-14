# Working notes — honest status

## Product stance (2026-09-14)

JARVIS is a **personal computer operator**. Architectural truth: `docs/JARVIS_ARCHITECTURE_TRUTH.md` (see §14).

## Operator loop (current)

```text
outcome → model plan (fallback: decomposer) → decide → policy → orchestrator → runtime → observe → verify → done | blocked | active
```

- ModelRouter plans capability JSON when available; deterministic templates are fallback only.
- Computer observe / locate / shadow-open / gated Live `type_text` (OPEN) into the launched pid (Notepad, Cursor); click/scroll/focus still blocked.
- `knowledge.pdf.read` stores observation facts. No video/audio.
- Live: poll `getRun` until terminal. Plan accepted is not done.

## Reconciliation

- [x] Audit of pages / APIs / runtimes
- [x] Command Center + Goal Detail honesty
- [x] Architecture truth map
- [x] Thin Decision Engine + Orchestrator over existing runtimes
- [x] Model planner + ComputerRuntime + PDF read + Live poll
- [ ] Full Live E2E through Umer AI OS with outcome payload still **incomplete**

## What is genuinely working

- Shadow operator loop with model plan or fallback decomposer
- Computer on Orchestrator (observe/locate/open + Live `type_text` into identified pid after OPEN — Notepad and Cursor)
- PDF text → world-model facts
- Live promote stays in progress until `getRun` is terminal
- Computer Live open (`OPEN`), Browser allowlisted GET
- Approvals store, kill switch, Settings connection checklist

## What is NOT complete

- Live plan body still does not carry the research/business outcome
- Click / coords / Live browser act / ops send → blocked
- `computer_type` is a removable Notepad/Cursor open→type template, not general intent planning
- Memory does not yet change later decisions beyond planner facts
- Escalation approve ≠ Live OS dispatch
- Video/audio, Upwork/Fiverr, general browsing

## Verify

```bash
pnpm verify
pnpm verify:all
pnpm verify:live
```
