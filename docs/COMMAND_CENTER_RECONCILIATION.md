# Command Center reconciliation report

Date: 2026-09-14  
Scope: Product + architecture reconciliation over the **current** implementation.  
Not Phase 13. Source: `docs/JARVIS_IMPLEMENTATION_REQUIREMENTS.md`.

---

## 1. Current architecture audit (summary)

JARVIS is a solid **control-plane skeleton**: Goal Engine Shadow Loop, policy/trust, evidence/journal, SQLite sidecar, `OsRuntimeAdapter` (mock + umer-read), gated Live promote, and side planes (Computer / Browser / WM / Skills / Ops / Models).

It is **not** yet a closed-loop personal operator for research outcomes. Many “completed phases” are scaffolding: pages and endpoints exist; outcome fulfillment often does not.

Ideal lifecycle:

```text
Outcome → Goal → Objectives → Plan → Tasks → Policy → Shadow/Live
  → Execution → Observation → Evidence → Verification → Goal state → Memory
```

Actual: Outcome→Goal→Obj→Tasks→Policy→noop/simulated OS→Evidence→Verification→`done` works as a **simulator**. Research execution, Memory←engine, Ops←engine, and KR fulfillment do **not**.

---

## 2. Pages kept

| Page | Role |
|------|------|
| `/` Now (Board) | **Command Center** — primary |
| `/goals`, `/goals/:id` | Goals list + mission control detail |
| `/approvals` | Full approvals inbox |
| `/activity` | Decision journal / replay |
| `/mission` | Portfolio aggregation (renamed in nav) |
| `/world` | Durable facts / entities |
| `/settings` | Connection, kill switch, voice |
| Computer / Browser / Skills / Ops / Models | Capability / debug surfaces |

---

## 3. Pages redesigned

| Page | Change |
|------|--------|
| `/` | Kanban-first → **operator Command Center** (state, current work, attention, recent, command). Pipeline board optional. |
| `/goals/:id` | Story panels → **mission control** (status, KR honesty, plan marks, activity, next, tech folded). |
| Attention rail | Status dump → **actionable** (Shadow review + confirm/reject + why interrupted). |

---

## 4. Pages consolidated / hidden (nav IA)

Primary nav regrouped:

- **Command:** Now, Goals, Attention  
- **Work:** Portfolio, Activity  
- **Knowledge:** World, Skills, Ops  
- **Runtimes:** Computer, Browser, Models  
- **System:** Settings  

Not deleted: Skills / Ops / Models / Portfolio remain reachable but are no longer the product identity.

Orphans still present (safe to delete later): `OverviewPage`, `NewOutcomePage`, Tailwind `AttentionDrawer*`, `SEED_*` (unused).

---

## 5. Demo / mock functionality discovered

| Item | Notes |
|------|------|
| Escalation `/demo` | Practice inbox — not Live truth |
| Skills practice / execute | Practice simulated; execute 403 |
| Ops send/publish/bid | 403 |
| Browser/computer act | 403 |
| Mock adapter Live | Still simulated |
| Model complete | Advisory; not Goal Engine path |
| SEED_GOALS / SEED_LOG | Unused hardcoded leftovers |
| Shadow “done” with KR=0 | Lifecycle verified, outcome not |

---

## 6. Real functionality discovered

- Shadow Loop end-to-end with evidence + journal  
- Persist goals/tasks/runs/evidence/escalations/facts/skills/ops (SQLite)  
- Promote Live with strong-confirm `LIVE` → Control API plan  
- Computer Live open with `OPEN`  
- Browser allowlisted GET + WM fact ingest  
- Kill switch, policy preview, tool manifests  
- Voice opt-in PTT (fills composer text only)

---

## 7. Data-flow problems

1. Goal Engine does not call Browser/Ops for research goals.  
2. Live plan body is `{ approver }` — outcome/constraints not sent.  
3. `research.opportunity_count` stays 0; verification can still pass.  
4. Escalation approve ≠ OS dispatch (still need `LIVE` promote).  
5. Session undo/stop are mostly UI overlays.  
6. Composer Live segment ignored by `planOutcome`.  
7. Attention ≈ Approvals store (intentional thin UX now).

---

## 8. Duplicate functionality

| Pair | Status |
|------|--------|
| Attention vs Approvals | Same store; Attention is interrupt surface |
| Mission vs Portfolio vs Goals | Mission UI = portfolio DTO; Goals are first-class |
| WM entities vs facts | Entities projected; facts durable |
| PlanDrawer vs Goal Detail | Both show plan/evidence; Detail is SoT for story |
| Two Live confirms | Mode switch vs per-goal `LIVE` / computer `OPEN` |

---

## 9. Runtime integration status

| Boundary | Status |
|----------|--------|
| `OsRuntimeAdapter` | KEEP — correct architecture |
| Mock | KEEP for tests |
| umer-read observe | Works when Control API up |
| umer-read Live plan | PARTIAL — plan accept ≠ research done |
| Computer / Browser | Separate planes; not auto-selected by Goal Engine |

---

## 10. UI changes

- Command Center overview  
- Goal Detail mission control + honest Shadow copy  
- Attention actionable  
- Nav IA regroup + “Now” / “Attention” / “Portfolio” labels  
- Operator state model (`lib/operator-state.ts`)  
- Fixed done Shadow goals mapping to `done` (not forever “waiting”)

---

## 11. API changes

None required for this reconciliation pass (UI/integration of existing APIs).

---

## 12. Tests

- Existing suite expected green after stage-mapping fix.  
- No fake E2E research assertions added (would lie).

---

## 13. Verification performed

Run after UI changes: `pnpm verify` (and `verify:live:dry` when API up).

---

## 14. Real end-to-end result (“10 Laravel SaaS…”)

| Mode | Result |
|------|--------|
| **Shadow** | Produces goal/plan/evidence. Does **not** find 10 opportunities. KR remains 0. Honest UI now says so. |
| **Live** | Can promote to OS plan. Does **not** run market research pipeline. |

Exact gaps: research tasks, allowlist for real sources, facts→ops→KR update, verification fail when KR unmet, outcome in Live plan payload.

---

## 15. What is genuinely complete

Control-plane foundations: Shadow lifecycle, policy, evidence, journal, adapter boundary, gated Live promote, limited computer open, browser GET research, Command Center **honesty**.

---

## 16. What remains incomplete

Closed-loop opportunity finding; capability auto-selection inside Goal Engine; Ops send; Skills execute; computer/browser act; Mission as true work graph; treating demo escalations as Live; dark-first Geist redesign (kept existing Space Grotesk system to avoid fighting chrome).

---

## 17. Architectural risks

1. Claiming phase-complete in docs/notes mis-sets expectations.  
2. Verification that passes without outcome fulfillment teaches the wrong success signal.  
3. Side-plane pages invite “dashboard of demos” regression — keep Command Center primary.  
4. Live plan without intent payload may start the wrong OS work.  
5. Deleting side planes would destroy useful work — hide/integrate instead.

---

## Definition of Done (this pass)

Opening JARVIS should answer within ~10 seconds: state, current goal, progress (real KRs), recent journal, attention, next action, Shadow vs Live — **without inventing activity**.

It should **not** claim research outcomes that did not happen.
