# JARVIS — Architecture Truth Map

Date: 2026-09-14  
North star: original JARVIS personal-operator architecture (User → JARVIS → Goal / Decision / Policy → Orchestrator → Runtimes → Events → Evidence → Memory → Future decisions).  
Method: repository inspection of runtime paths, not pages, class names, or phase checklists.  
Related: `docs/JARVIS_IMPLEMENTATION_REQUIREMENTS.md`, `docs/COMMAND_CENTER_RECONCILIATION.md`, `docs/jarvis-architecture.md`, `notes.md`.

---

## 0. The fundamental question

> If Umer gives JARVIS an outcome, can JARVIS determine what needs to happen, decide which capabilities are required, execute them, observe reality, verify the actual outcome, and continue/replan until the outcome is achieved or genuinely blocked?

**Answer today: no.**

What exists is a **control-plane simulator** plus **disconnected capability planes**.

What does **not** exist is a closed operator loop in which JARVIS coordinates Goal → Decision → Policy → Orchestration → Runtime → Observation → Evidence → Verification → Outcome state → Memory → next Decision.

Do not hide this behind UI. Command Center reconciliation made the UI more honest. Honesty is not fulfillment.

---

## 1. Actual runtime path (traced)

```text
Umer (UI :5173 / CLI)
        │
        ▼
JARVIS API :3020   (Hono — apps/api/src/app.ts)
        │  POST /v1/goals/shadow-loop
        ▼
GoalEngine.runShadowLoop()
        │  normalizeOutcome (heuristics, no LLM)
        │  inspectState (adapter.getCurrentState + overlapping goals)
        │  decomposeGoal (fixed 2-task template)
        │  DispatchBridge.dispatchTask × N
        │     ToolRegistry.require(manifest)
        │     classifyProposal (policy)
        │     adapter.proposeRun + adapter.startRun
        │  verifyShadowLoop (lifecycle evidence, NOT outcome KRs)
        │  mark goal done | blocked
        ▼
SQLite sidecar + Decision Journal + Evidence chain
        │
        ▼
UI polls GET /v1/goals, /journal, /wm/now  (presents state)
```

**Live path (separate, human-gated):**

```text
POST /v1/goals/:id/promote-live  confirm=LIVE
        │
        ▼
GoalEngine.promoteToLive()
        │  DispatchBridge.dispatchLiveApproved
        │  UmerOsRuntimeAdapter.startRun
        │     POST /v1/work-graph/:projectId/plan  body = { approver }
        ▼
OS plan accepted  ≠  business outcome achieved
```

**Side planes (NOT selected by Goal Engine):**

```text
POST /v1/browser/shadow-research  → BrowserRuntime → optional WM ingest
POST /v1/computer/live-open       → ComputerRuntime (confirm OPEN)
POST /v1/ops/opportunities/*      → OpportunityStore (manual / from-facts)
POST /v1/skills/*                 → SkillStore (practice simulated; execute 403)
POST /v1/models/complete          → ModelRouter (advisory; not on Goal Engine path)
```

There is **no** event bus in this repo. There is **no** `DecisionEngine` class. There is **no** Orchestrator that chooses among OS / Computer / Knowledge / Browser. `DispatchBridge` is an OS-only execution helper used by Goal Engine.

---

## 2. Classification legend

| Label | Meaning |
| --- | --- |
| **REAL** | Used on a runtime path; does what the architecture name implies |
| **PARTIAL** | Real code with a narrower or incomplete role |
| **SCAFFOLD** | Structure exists; behavior is incomplete |
| **MOCK** | Intentional simulation (Shadow / mock adapter) |
| **DEMO** | Practice / seed path; not Live truth |
| **ORPHANED** | Code or page unused by the operator loop |
| **DUPLICATED** | Parallel surface for the same concern |
| **MISSING** | Named in the north-star architecture; no implementation |

---

## 3. Answers to the audit questions

### JARVIS

JARVIS is **primarily presenting state**. Coordination is limited to `GoalEngine.runShadowLoop` (always OS inspect + OS start_run, always Shadow noops unless Live promote).

It does **not** coordinate Computer, Browser, Knowledge, Ops, Skills, or Models as runtimes of one operator. Those are API/UI planes the human (or a separate page) must invoke.

Classification: **PARTIAL** (control plane) / **SCAFFOLD** (personal operator).

### Goal Engine

| Question | Answer |
| --- | --- |
| Create goals? | **Yes** — `runShadowLoop` persists Goal |
| Decompose goals? | **Partial** — one objective + two hardcoded tasks (`os.runtime.get_state`, `os.runtime.start_run`) keyed by `plan_kind` |
| Track objectives? | **Partial** — Objective rows exist; they are not independently progressed |
| Create executable tasks? | **Partial** — tasks are OS-only templates, not capability-selected work |
| Determine completion? | **Misleading** — `verifyShadowLoop` checks lifecycle evidence. Research KR `research.opportunity_count` is **forced to 0** and **not required** to pass. Goal is marked `done` anyway |

Classification: **PARTIAL**.

### Decision Engine

**Does not exist as a component.**

What exists instead:

- Heuristic `normalizeOutcome` (domain / geography / target_count)
- Duplicate-goal merge (`do_not_act`)
- `DecisionJournal` **records** after the fact (`shadow_loop_complete`, `promote_to_live`, `cancel_goal`, `replan`)
- Evidence nodes with `kind: "decision"` that describe decomposition, not a next-action choice

No module answers: *given goal state, observations, evidence, constraints, policy, and available capabilities, what should JARVIS do next?*

Minimum abstraction required (do **not** build a giant planner): a deterministic `decideNext(context) → OperatorDecision` used by the operator loop. Inputs: goal, objectives, tasks, observations, evidence, verification, capabilities, memory facts, policy, previous decisions. Output: decision, reason, selected capability/action, expected result, risk, authorization, next verification condition.

Classification: **MISSING**.

### Policy Engine

`src/policy/classify.ts` is **REAL on the OS dispatch path**.

- Every `DispatchBridge` dispatch requires a tool manifest and calls `classifyProposal`.
- Kill switch rejects Live.
- Shadow short-circuits to `automatic` (simulate/noop only).
- Live uses trust tier, autonomy ceiling, blast/effects, approval_requirement.

Gaps:

- Browser / computer / ops / skills API routes **do not** go through Goal Engine policy. They have their own 403 blocks and confirm tokens (`OPEN`, `LIVE`).
- Escalation approve **does not** dispatch OS work; Live still requires typing `LIVE`.
- Policy is **not** a gate in front of every capability — only OS tasks via DispatchBridge.

Classification: **PARTIAL** (enforced for OS Goal Engine path; represented/blocked ad hoc elsewhere).

### Orchestrator

**No orchestration layer exists.**

Goal Engine **directly** calls `DispatchBridge`, which **directly** calls `OsRuntimeAdapter`. It never selects BrowserRuntime, ComputerRuntime, or Knowledge.

Umer AI OS has its own orchestration-worker / work graph **inside the OS**. That is not JARVIS’s orchestrator. JARVIS must not rebuild it.

Minimum abstraction: `Orchestrator.execute(decision)` routes a selected capability to the matching runtime adapter (OS / Browser / Computer / Knowledge). It must not invent goals.

Classification: **MISSING** (DispatchBridge is an OS adapter helper, not an orchestrator).

### Runtime layer

| Runtime | Reality |
| --- | --- |
| **Umer AI OS Runtime** | **PARTIAL** — `OsRuntimeAdapter` contract is real. Mock is **REAL for Shadow tests**. `UmerOsRuntimeAdapter` list/get/cancel/subscribe (poll) are real against Control API. Live `startRun` posts plan `{ approver }` only — **plan accepted ≠ outcome**. Shadow `startRun` is **noop_shadow**. |
| **Computer Runtime** | **PARTIAL** — observe/locate/shadow-open real; Live open gated by `OPEN`; click/type/focus **blocked**. Not on Goal Engine path. |
| **Knowledge Runtime** | **SCAFFOLD** — no unified runtime. Fact store + skill store + opportunity store + model router exist as separate planes. Goal Engine does not read them when deciding. |
| **Browser Runtime** | **PARTIAL** — allowlisted GET + extract + WM ingest. Click/publish blocked. Not on Goal Engine path. Not WebMachine; this repo uses HTTP GET, not a browser automation runtime. |

### Events / Queues

- JARVIS: **MISSING**. `subscribeRun` is controlled **polling** of `getRun`. Comment in adapter: “NATS subscribe not wired in JARVIS yet.”
- Escalation store is a **confirm/inform inbox**, not a runtime event queue.
- OS events (`evt.runtime.*`) live in Umer AI OS; JARVIS does not consume them except via poll.

Events do **not** drive JARVIS state transitions. Goal status is set synchronously in `runShadowLoop` / `promoteToLive` / `syncLiveRun` / `cancelGoal`.

### Results / Evidence

Evidence chain is **REAL as an audit log** (persisted, correlated, integrity tests).

It is **not** a full observation→evidence→result model:

- Action, observation, and result are mixed as `EvidenceNode.kind` strings (`stimulus`, `decision`, `tool_invocation`, `observation`, `metric`, `expected_vs_actual`, …).
- Shadow “results” are adapter summaries (`SHADOW noop — would invoke os.runtime.start_run`).
- Research opportunity results are **not** produced; KR is hardcoded `current = 0`.
- Browser observations exist only if the **browser API** is called, not because the Goal Engine observed the web.

Classification: **PARTIAL**.

### Memory

Persisted in SQLite: goals, objectives, tasks, runs, evidence, journal, escalations, WM facts/links, skills, opportunities, settings.

Retrievable via API (`/v1/wm/facts`, `/v1/journal`, …).

**Does not influence future Goal Engine decisions.** Overlap detection uses goal title/outcome tokens only, not facts. No episodic replay into `decideNext`. STM in `/v1/wm/now` is a projection for UI.

Classification: **PARTIAL** (durable store) / **MISSING** (memory → future decisions).

### Learning

Skills ingest/practice/verify exist as a **SHADOW store + page**. Practice is simulated. Execute is **403**. No promotion into Goal Engine capabilities. Model router is advisory.

Classification: **SCAFFOLD** (page/model) — not a learning loop.

---

## 4. Architecture matrix

| Component | Intended role | Current implementation | Reality | Used by | Gap |
| --- | --- | --- | --- | --- | --- |
| JARVIS | Personal operator | API + UI Command Center wrapping Goal Engine | PARTIAL | Human via UI/CLI | Does not coordinate runtimes toward outcomes |
| Goal Engine | Outcome management | `src/goal-engine/*` — normalize, decompose, dispatch OS, verify lifecycle | PARTIAL | `/v1/goals/shadow-loop`, CLI, promote-live | No capability selection; completion ≠ outcome |
| Decision Engine | Decide next action | Journal labels + evidence `kind=decision` | MISSING | — | Need thin `decideNext` → structured OperatorDecision |
| Policy Engine | Safety / trust | `classifyProposal` + manifests + kill switch | PARTIAL | DispatchBridge OS path | Not universal execution boundary |
| Orchestrator | Runtime selection / execution | None (`DispatchBridge` is OS-only) | MISSING | — | Route decision → capability → runtime adapter |
| Umer OS Runtime | Workforce execution | `OsRuntimeAdapter` mock + umer-read | PARTIAL | Goal Engine only | Live plan body lacks outcome; plan ≠ done |
| Computer Runtime | Local computer | `ComputerRuntime` observe / gated open | PARTIAL | `/v1/computer/*` pages | Not operator-selected; act blocked |
| Browser Runtime | Web research / browse | `BrowserRuntime` allowlist GET | PARTIAL | `/v1/browser/*` | Not operator-selected; not WebMachine |
| Knowledge Runtime | Memory / learning | Fact/skill/ops stores + model router | SCAFFOLD | Side APIs/UI | No single runtime; unused by Goal Engine |
| Events | Runtime communication | Poll `getRun`; escalation inbox | MISSING / SCAFFOLD | Live status sync | No bus; events don’t drive transitions |
| Evidence | Proof | Persisted chain + integrity tests | PARTIAL | Goal Engine, UI Activity | Mixed with actions; research proof not produced |
| Memory | Future context | SQLite facts + journal | PARTIAL | UI World; ingest from browser API | Does not feed decisions |
| Learning / Skills | Skill acquisition | Ingest → practice(sim) → verify flag | SCAFFOLD | Skills page | No execute; not in operator loop |
| Model Router | Model-agnostic brains | LM Studio + mock completer | PARTIAL | `/v1/models/complete` | Not on Goal Engine path |
| Approvals | Human gates | Escalation store + LIVE/OPEN tokens | PARTIAL | Attention, Approvals, promote | Approve ≠ dispatch; demo escalations |
| Agent runtime | Workforce agents | **Umer AI OS only** (correct) | REAL (in OS, out of repo) | Via adapter Live plan | Must not be rebuilt here |
| Command API | JARVIS HTTP | Hono `:3020` | REAL | Web UI | Many routes are side-plane, not loop |
| UI state | Operator narrative | `operator-state.ts` + Command Center | PARTIAL | Web | Maps `blocked` goals to Shadow “waiting” |
| Persistence | Sidecar SoT | SQLite migrations 001–006 | REAL | Runtime singleton | Fine; don’t duplicate |
| Tests | Prove loop | Shadow lifecycle tests **assert done + KR=0** | PARTIAL / DEMO-risk | `pnpm verify` | Tests encode the wrong success signal |
| Tool manifests | Capability contract | `PHASE1_MANIFESTS` | PARTIAL | Policy + `/v1/tools` | Close to capability model; unused as catalog for selection |
| Demo escalations | Practice inbox | `createLiveApprovalDemo` | DEMO | `/v1/escalations/demo` | Not Live truth |
| Overview/NewOutcome pages | Legacy UI | Still in repo | ORPHANED | Not primary nav | Safe to ignore; do not revive |
| SEED_* | Hardcoded demo data | Unused leftovers | ORPHANED | — | Do not treat as truth |

---

## 5. Canonical operator lifecycle (target)

This is the **only** JARVIS loop. Future capabilities must fit it. It is **not** implemented end-to-end today.

```text
USER OUTCOME
     ↓
GOAL
     ↓
OBJECTIVES
     ↓
PLAN
     ↓
TASKS
     ↓
DECISION
     ↓
POLICY / TRUST
     ↓
ORCHESTRATION
     ↓
CAPABILITY / RUNTIME
     ↓
ACTION
     ↓
OBSERVATION
     ↓
EVIDENCE
     ↓
VERIFICATION
     ↓
OUTCOME STATE
     ↓
     ┌───────────────┐
     │               │
   COMPLETE        INCOMPLETE
     │               │
     ▼               ▼
   MEMORY          DECISION
                     │
                     ▼
                   REPLAN
                     │
                     └──────→ EXECUTION
```

**Current mapping:** USER OUTCOME → GOAL → OBJECTIVES → TASKS → (implicit “always OS”) → POLICY → OS noop ACTION → evidence-shaped RESULT → lifecycle VERIFICATION → `done`. Missing: Decision, Orchestration across runtimes, Observation≠Action, outcome Verification, Memory→Decision, Replan on unmet KR.

---

## 6. Responsibilities (as they must be)

### Goal Engine

Create/decompose/track goals, objectives, tasks, measurable KRs, goal state. **Must not** become the browser executor or OS agent runtime.

### Decision Engine

Given current goal state, observations, evidence, constraints, policy, and available capabilities: **what should JARVIS do next?** Structured decision only. Not research-hardcoded forever — research is the first *use*, not the only *shape*.

### Policy Engine

Permission, trust, risk, approval, reversibility, side effects. Enforced at execution boundaries. UI is not policy.

### Orchestrator

Execute the selected decision on the appropriate runtime. Do not invent goals.

### Runtimes

```text
JARVIS → Orchestrator → Capability → Runtime Adapter → Runtime
```

Examples already intended:

- Browser research → BrowserRuntime → allowlisted fetch (later: WebMachine if/when that adapter exists)
- OS work → OsRuntimeAdapter → Umer AI OS (do not rebuild agent runtime / work graph / message fabric)
- Knowledge store/retrieve → fact store / journal (thin Knowledge adapter)

---

## 7. Capability contract

A catalog already exists as `ToolManifest` (`src/tools/registry.ts`). It is **almost** the capability contract (id, inputs/outputs, risk, trust, approval, reversibility, side effects, evidence, execution_context). It is **not** used to *select* work.

Do not create dozens of new capabilities. Start with those present:

| id | Runtime | Operator-loop status |
| --- | --- | --- |
| `os.runtime.get_state` | OS | Used by Goal Engine |
| `os.runtime.start_run` | OS | Used by Goal Engine (noop Shadow / plan Live) |
| `os.runtime.get_run` | OS | Live sync |
| `browser.research` / `browser.fetch` / `browser.extract` | Browser | Side API only |
| `computer.observe.snapshot` / `computer.open_app` | Computer | Side API only |
| `wm.facts.upsert` | Knowledge | Side API + browser ingest |
| `ops.opportunity.create` | Knowledge/ops | Side API |
| `skill.*` / `model.complete` | Knowledge | Side / advisory |
| `*.act.click` / send / publish | — | Blocked; keep blocked |

---

## 8. OsRuntimeAdapter — method truth

Contract: `listCapabilities`, `getCurrentState`, `proposeRun`, `startRun`, `getRun`, `cancelRun`, optional `subscribeRun`.

| Method | Mock | umer-read |
| --- | --- | --- |
| `listCapabilities` | Canned OS tools | `GET /v1/agents` (fallback stub if down) |
| `getCurrentState` | In-process runs | `GET /v1/dashboard` + agent-runs + gates |
| `proposeRun` | Local simulate | Local simulate (**OS has no dry-run**) |
| `startRun` shadow | `noop_shadow` | `noop_shadow` (no OS write) |
| `startRun` live | Still simulated in mock | `POST /v1/work-graph/:projectId/plan` **`{ approver }` only** |
| `getRun` | Map lookup | `GET /v1/agent-runs/:id` (plan correlation may 404 → “running”) |
| `cancelRun` | In-memory cancel | `POST /v1/commands` CancelWork (best-effort; plan id ≠ workPackage id) |
| `subscribeRun` | Poll | Poll — **not NATS** |

Verified routes are documented in `src/adapters/umer-os/umer-os-runtime-adapter.ts`. Do not invent OS endpoints.

---

## 9. Observation vs action (missing distinction)

Today a Shadow “result” is often the action description itself (`would invoke os.runtime.start_run`).

Required distinction:

| Concept | Should mean | Today |
| --- | --- | --- |
| INTENT | User outcome / task.intent | Present |
| DECISION | Next action choice | Journaled after the fact |
| ACTION | Capability invocation | `tool_invocation` / adapter startRun |
| OBSERVATION | What reality showed | Mixed; computer/browser have before/after only on their own APIs |
| EVIDENCE | Attributable proof chain | Present as log |
| RESULT | Measured outcome (e.g. 1 validated opportunity) | **Not produced** for research |
| VERIFICATION | Independent check of expected vs actual | Lifecycle-only; can pass with KR=0 |

---

## 10. What must not be built

- A second Umer AI OS, work graph, agent runtime, or message fabric
- A research-only architecture that cannot later host computer/OS/knowledge
- New dashboards, agents, marketplace, or demo phases
- Parallel Decision/Orchestrator systems beside Goal Engine (they sit **under** JARVIS, **used by** Goal Engine)
- Treating `plan accepted` as `business outcome achieved`
- Fabricating 10 Saudi Laravel SaaS opportunities to make a test green

---

## 11. First operator-loop slice (reuse, don’t parallelize)

Prefer:

```text
existing Goal Engine + manifests + policy + DispatchBridge + BrowserRuntime + fact store + opportunity store
        ↓
capability catalog view + decideNext + Orchestrator.execute
        ↓
operator loop (Shadow first)
```

Proof, even when the world does not yield 10 opportunities:

1. Outcome normalizes to a research goal with KR `research.opportunity_count=10`.
2. Decision selects `os.runtime.get_state` then `browser.research` (not fake OS research).
3. Policy checks the manifest.
4. Orchestrator runs BrowserRuntime (Shadow: simulate or allowlisted GET — never click/publish).
5. Observations are recorded (visited or not; facts with source; **no visit lie**).
6. Knowledge ingest stores observations, not conclusions.
7. Ops opportunities are created **only** from qualifying candidate facts — not from encyclopedia titles.
8. Verification **fails** if KR unmet. Goal is **blocked**, not `done`.
9. Memory retains the attempt. Next decision can replan or stay blocked honestly.

That is a real loop: execute → observe → verify → stop when genuinely blocked.

Non-research ops/general goals keep the existing OS inspect + shadow start_run lifecycle, because their KR is plan-evidence, not market count.

---

## 12. UI / API note

No new pages. Command Center, Goal Detail, and Attention stay the surfaces.

Known honesty bug (fixed this pass): API `goal.status=blocked` was mapped to Board stage `shadow`. It now maps to `failed`.

---

## 13. Delta after this pass (2026-09-14)

The audit above is still the honest pre-loop picture. This pass added the **minimum** operator loop on existing code — not a second OS, not new pages.

| Piece | Change |
| --- | --- |
| Capability catalog | View over `PHASE1_MANIFESTS` (`src/capabilities/`) |
| Decision Engine | Thin `decideNext` (`src/decision/engine.ts`) |
| Orchestrator | Routes OS → DispatchBridge, research → BrowserRuntime, memory → fact store, ops → qualify-only create |
| Goal Engine | `runShadowLoop` uses Decision → Orchestrator instead of always OS start_run |
| Research tasks | `browser.research` instead of fake OS research |
| Verification | Outcome KRs must be met; unmet `research.opportunity_count` **blocks** |
| UI | `blocked` goals map to failed, not Shadow “waiting” |

Still true after this pass:

- “Find 10 Laravel SaaS…” does **not** invent 10 opportunities.
- Live `startRun` still posts `{ approver }` only; plan accepted ≠ outcome.
- Computer click / browser act / ops send remain blocked.
- No event bus; no second agent runtime.

---

## Document control

| Field | Value |
| --- | --- |
| Status | Architectural truth as of 2026-09-14 audit |
| Next | Implement the first operator loop using existing runtimes; do not add product surface |
