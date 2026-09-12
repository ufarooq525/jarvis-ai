# Jarvis-ai — Phased Implementation Plan (Frontend + Backend)

Status: **approved direction** (2026-09-12)  
Rule: every phase delivers **backend + frontend** and is **verified before the next phase starts**.  
Depends on: [project-context.md](./project-context.md), [jarvis-integration-architecture-report.md](./jarvis-integration-architecture-report.md)

---

## Permanent architecture (do not break)

```
YOU (UI)
   │
JARVIS API / Web
   │
Goal Engine
   │
Adapter Contract          ← Goal Engine never imports Umer AI OS
   │
┌──┴──────────────┐
│                 │
Mock Adapter    Umer OS Adapter
│                 │
SHADOW          Control API / NATS → Umer AI OS
```

| Invariant | Meaning |
| --- | --- |
| Adapter isolation | FE and Goal Engine never call control-api directly — only via adapter (or JARVIS API that uses the adapter) |
| Shadow default | New domains start SHADOW; UI must show mode clearly |
| FE + BE together | No phase ships API-only or UI-only |
| Verify gate | Checklist must pass before starting the next phase |
| OS jarvis-* | Chat peer inside Umer AI OS — **not** this product’s Goal Engine UI |

---

## How to verify every phase

Each phase ends with:

1. **Automated:** unit/integration tests green (`pnpm test` + phase-specific tests)
2. **Manual FE:** click-through script in that phase’s “Verify” section
3. **Manual BE:** curl/CLI or API smoke against the local JARVIS API
4. **Sign-off:** update [notes.md](../notes.md) — mark phase `[x]` with date

**Do not start Phase N+1 until Phase N is signed off.**

---

## Stack recommendation (phase A)

| Layer | Choice | Why |
| --- | --- | --- |
| Backend | Node 20 + TypeScript (extend current `src/`) | Matches OS; Goal Engine already here |
| JARVIS HTTP API | Lightweight HTTP (e.g. `hono` or Node `http`) on port **3020** | Separate from OS control-api `:4000` and OS jarvis-api `:3010` |
| Frontend | Next.js (App Router) in `apps/web` **or** `web/` | Fast UI; keep JARVIS branding separate from OS Command Center |
| Store (early) | In-memory → SQLite sidecar | JARVIS-owned; not OS MySQL |
| Adapter | Mock until Phase D; Umer adapter from Phase D |

Exact package names can be chosen in Phase A without changing this plan.

---

## Phase map (overview)

| Phase | Name | Adapter | FE focus | BE focus | Outcome |
| --- | --- | --- | --- | --- | --- |
| **0** | Done — Audit + Shadow core | Mock | Docs only | Goal Engine CLI | Baseline exists |
| **A** | Control shell + Shadow UI | Mock | Create goal, see runs/evidence | JARVIS API wrapping Goal Engine | Visible Shadow Loop |
| **B** | Trust · Manifests · Escalation UI | Mock | Approvals, trust badges, kill switch | Policy/trust APIs | Firewall visible |
| **C** | Evidence · Journal · Replay | Mock | Evidence timeline, journal, export | Persist + export APIs | Auditability |
| **D** | Observe OS (read-only adapter) | **Mock + Umer read** | Live OS snapshot panel | Umer adapter `getState`/`getRun`/`listCapabilities` | Observation without side effects |
| **E** | Delegate (Approve → Live plan) | Umer write under Approve | Confirm / reject Live | `startRun` behind Strong-confirm | Safe delegation |
| **F** | World Model + Memory (thin) | Umer | Entity/status views | Minimal WM + STM | Current-state UX |
| **G** | Mission Control (JARVIS) | Umer | Goals portfolio dashboard | Aggregation APIs | CEO surface |
| **H** | Computer observe (later) | Computer adapter | Machine state panel | Observe-only tools | Prep for act |
| **I** | Voice + advanced (last) | — | Voice UX | Attention model | Deferred |

Phases **0–C** stay on **mock only**. Phase **D** introduces real OS **reads**. Phase **E** is the first **Live write** (always Approve).

---

## Phase 0 — Baseline (COMPLETE)

**Already done:** audit, adapter contract, mock Shadow Loop, CLI, tests.

### Verify (reconfirm anytime)

- [x] `pnpm test` green  
- [x] `pnpm cli "…"` prints SHADOW + evidence JSON  
- [x] No import of `umer-ai-os` from Goal Engine  

---

## Phase A — Control shell + Shadow Loop UI

**Goal:** First usable product: type an outcome → see plan, runs, evidence in the browser. Still **mock only**.

### Backend

| Deliverable | Detail |
| --- | --- |
| `apps/api` (or `src/api`) | HTTP server on `:3020` |
| `POST /v1/goals/shadow-loop` | Body `{ title, outcome, domain? }` → `GoalEngine.runShadowLoop` |
| `GET /v1/goals` | List goals from store |
| `GET /v1/goals/:id` | Goal + tasks + runs |
| `GET /v1/goals/:id/evidence` | Evidence chain JSON |
| Adapter wiring | **Inject `MockOsRuntimeAdapter` only** |
| Persistence | In-memory OK; document swap to SQLite in Phase C |

### Frontend

| Deliverable | Detail |
| --- | --- |
| App shell | Brand “JARVIS”, mode badge **SHADOW**, nav: Goals |
| Create Goal page | Form: title, outcome, domain → submit |
| Goal detail | Objectives/tasks, run statuses, adapter=`mock` |
| Evidence panel | Collapsible JSON / simple timeline |
| Empty / error states | Clear copy when API down |

### Verify

- [x] `pnpm test` + API smoke: create goal via curl returns `mode: shadow`  
- [ ] UI: submit outcome → detail shows 2+ runs, all `simulated` / noop *(manual in browser)*  
- [x] API responses include **SHADOW** / **adapter: mock**  
- [x] API surface is `:3020` only — no control-api `:4000` wiring  
- [x] Mock works without OS processes  

**Status (2026-09-12):** Phase A **implemented** — `apps/api` + `apps/web`. Sign off UI click-through, then mark complete in `notes.md`.

**Exit criterion:** Non-technical walkthrough: “I typed an outcome and saw a shadow plan with evidence.”

---

## Phase B — Trust, manifests, escalation UI

**Goal:** Make the approval firewall and trust model visible and operable in UI (still mock).

### Backend

| Deliverable | Detail |
| --- | --- |
| `GET /v1/tools` | List manifests from registry |
| `GET /v1/trust/status` | Principals, domain trust tiers, kill switch |
| `POST /v1/trust/kill-switch` | Engage / clear |
| Escalation store | `confirm` / `inform` records with expiry |
| Policy hooks | Force `approval_required` path for a demo Live-shaped proposal **without** calling OS (mock returns waiting_approval) |

### Frontend

| Deliverable | Detail |
| --- | --- |
| Trust panel | Domain → SHADOW/LIMITED/… badges |
| Tool catalog | Manifest table (effects, blast, dry_run) |
| Approvals inbox | Confirm / reject / expire |
| Kill switch control | Big, reversible; confirm dialog |
| Run detail | Show `delegation_chain`, `policy_verdict_id` |

### Verify

- [ ] Manifest missing → API rejects (hard)  
- [ ] Kill switch ON → Live-shaped path rejected; Shadow still allowed  
- [ ] UI: approve/reject a pending escalation; stale ones expire  
- [ ] Every run in UI shows delegation + verdict ids  

**Exit criterion:** You can explain “who may do what” from the UI alone.

---

## Phase C — Evidence, journal, persistence, replay

**Goal:** Durable audit trail + replay export; FE makes it browsable.

### Backend

| Deliverable | Detail |
| --- | --- |
| SQLite (or Postgres) sidecar | Goals, runs, evidence, journal survive restart |
| `GET /v1/journal` | Decision records |
| `GET /v1/replay/:decision_id` | Full trace JSON |
| Migration scripts | Versioned schema |

### Frontend

| Deliverable | Detail |
| --- | --- |
| Evidence timeline | Stimulus → decision → policy → sim → tool → metric |
| Journal page | List decisions; open replay |
| Export button | Download evidence/replay JSON |
| After restart demo | Create goal → restart API → goal still listed |

### Verify

- [ ] Restart API; goals + evidence still present  
- [ ] Replay JSON opens for a decision and matches UI timeline  
- [ ] Duplicate goal still merges / `do_not_act` after restart  

**Exit criterion:** “Show me why we did X” answered from UI + export file.

---

## Phase D — Observe Umer AI OS (read-only adapter)

**Goal:** First real OS contact — **reads only**. Goal Engine still only sees the adapter contract.

### Backend

| Deliverable | Detail |
| --- | --- |
| `UmerOsRuntimeAdapter` (read subset) | Implement `listCapabilities`, `getCurrentState`, `getRun` |
| Re-verify routes | Diff against `umer-ai-os/.../server.ts` before merge (update `src/adapters/umer-os/README.md`) |
| `startRun` / `proposeRun` | Still **mock noop** or throw `NotImplemented` for Live write |
| Config | `JARVIS_ADAPTER=mock\|umer-read`, `CONTROL_API_BASE=http://127.0.0.1:4000` |
| `GET /v1/os/snapshot` | Proxied state for UI (via adapter) |

### Frontend

| Deliverable | Detail |
| --- | --- |
| Adapter switcher | Mock vs Umer-read (dev only; default mock) |
| OS snapshot panel | Specialists count, active runs, pending gates (from adapter) |
| StateInspector view | Overlap warnings before shadow plan |
| Banner | “Observation mode — no Live side effects” |

### Verify

- [ ] With OS down + `umer-read`: UI shows clear error; mock still works  
- [ ] With OS up: snapshot matches `GET :4000/v1/dashboard` / specialists / gates (spot-check)  
- [ ] Shadow Loop with `umer-read` still does **not** call `POST .../plan`  
- [ ] Wireshark/network or logs: only GET routes to control-api  

**Exit criterion:** You can see real OS state in JARVIS UI without changing OS state.

---

## Phase E — Delegate (Approve → Live startRun)

**Goal:** Safe path simulation → observation → **delegation** → real execution.

### Backend

| Deliverable | Detail |
| --- | --- |
| `startRun` on Umer adapter | Map to `POST /v1/work-graph/:projectId/plan` (approver required) + correlation map |
| Hard gates | Only if domain not SHADOW **and** human Strong-confirm **and** kill switch off  
| Idempotency | JARVIS dedupe before plan  
| Poll `getRun` | Map `workPackageId` → UI status  
| No silent Auto Live | Policy forbids Auto on external until dry-run exists |

### Frontend

| Deliverable | Detail |
| --- | --- |
| Promote flow | Shadow result → “Request Live execution” |
| Strong confirm UI | Typed confirm / second click; show blast + manifest  
| Live run monitor | Status from polled `getRun` |
| Gate awareness | Link/open pending OS gates as inform/confirm  

### Verify

- [ ] Without confirm → no `POST .../plan`  
- [ ] With confirm + OS up → plan fires; JARVIS shows `os_run_id`  
- [ ] Kill switch blocks Live even after confirm  
- [ ] Idempotent retry does not double-dispatch  
- [ ] SHADOW domain still cannot Live  

**Exit criterion:** One real OS plan from JARVIS UI, fully evidenced and approved.

---

## Phase F — World Model + Memory (thin)

**Goal:** Minimal shared picture so UI shows “current state” beyond a single goal.

### Backend

| Deliverable | Detail |
| --- | --- |
| WM entities | goals, os_runs, approvals, specialists (versioned stubs) |
| STM | Active goal + open approvals |
| Quarantine | Untrusted adapter text not written straight to LTM |

### Frontend

| Deliverable | Detail |
| --- | --- |
| Now panel | Active goal, open approvals, OS run count |
| Simple entity list | Search goals / runs |
| Confidence / provenance badges | From WM fields |

### Verify

- [ ] After Live run, Now panel updates without full page inventing state  
- [ ] Poisonous/long tool output does not become durable “fact” without quarantine  

---

## Phase G — Mission Control (JARVIS frontend)

**Goal:** CEO portfolio UI **after** core loop + evidence + firewall are real. Evolve toward OS dashboard consumption later — do not redesign OS Command Center first.

### Backend

| Deliverable | Detail |
| --- | --- |
| Portfolio APIs | Goals by domain, KR rollup, escalation SLA |
| Read models | Aggregate journal metrics |

### Frontend

| Deliverable | Detail |
| --- | --- |
| Mission Control home | Goals · Approvals · Evidence · OS health |
| Domain trust board | Shadow → … promotion candidates (manual) |
| Deep links | Into goal detail / replay |

### Verify

- [ ] First viewport is brand + one job (not a widget dump)  
- [ ] Every card links to evidence or approval — no dead metrics  

---

## Phase H — Computer observe (later)

Observe-only computer adapter + UI panel. **No act plane** until sandbox + manifests + Approve. FE+BE together when scheduled.

## Phase I — Voice + advanced autonomy (last)

Only after Attention model + escalation UX exist. Explicit non-goal until then.

---

## Cross-cutting verification matrix

| Concern | A | B | C | D | E | G |
| --- | --- | --- | --- | --- | --- | --- |
| FE + BE shipped | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Mock works offline | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| No Goal Engine → OS import | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Evidence on material path | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Real OS GET only | | | | ✓ | ✓ | ✓ |
| Real OS POST plan | | | | | ✓ | ✓ |
| Strong-confirm before Live | | | | | ✓ | ✓ |

---

## Suggested calendar (flexible)

| Phase | Rough effort | Depends on |
| --- | --- | --- |
| A | 2–4 days | Phase 0 |
| B | 2–3 days | A |
| C | 2–4 days | A |
| D | 3–5 days | A–C; OS running locally |
| E | 4–6 days | D signed off |
| F | 3–5 days | E |
| G | 1–2 weeks | F |
| H–I | Later | G + policy gates |

Reassess after each phase; cut scope rather than skip verify gates.

---

## What we explicitly will not do mid-phase

- Building OS Mission Control / replacing `apps/web` Command Center early  
- Voice before Attention model  
- Live computer control  
- Agent swarms  
- Letting FE call `:4000` directly  
- Implementing Umer `startRun` before Phase E sign-off  

---

## Immediate next step

**Start Phase A** when you say go: JARVIS HTTP API + Shadow Loop web UI on mock adapter, with the Phase A verify checklist as the definition of done.

---

## Document control

| Field | Value |
| --- | --- |
| Version | 1.0 |
| Created | 2026-09-12 |
| Owner | Umer + jarvis-ai builders |
| Next | Execute Phase A (FE + BE) after explicit go |
