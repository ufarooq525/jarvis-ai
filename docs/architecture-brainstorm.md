# JARVIS Architecture Brainstorm — Gaps Beyond RFC 0.1

Status: design brainstorm (not an RFC rewrite)  
Audience: Umer + architects  
Depends on: [jarvis-architecture.md](./jarvis-architecture.md), vision 2026-09-11  
Rule: propose what to **add / strengthen**; do not restate the whole RFC.

---

## 0. What’s solid vs what’s thin

**RFC already nails:** boundaries (JARVIS / OS / Computer / models), Goal→Result chain, Decision + Policy + Orchestrator, autonomy 0–4, approval matrix, memory tiers, decoupling, phased roadmap, non-goals.

**Under-specified for a CEO-operator that can hurt you:** trust & identity of who/what is acting; what a tool is *allowed* to do in machine terms; money/time/attention as scarce resources; dry-run before blast; evidence that can be replayed; how competing goals lose; how many agents under one human stay safe; how humans escalate without drowning; how skills don’t silently rot or self-modify into liability.

This doc ranks those gaps.

---

## 1. Control plane vs data plane (missing lens)

RFC folds everything into “engines + event bus.” Split them explicitly:

```
CONTROL PLANE (JARVIS)                    DATA / EXEC PLANE
─────────────────────                     ─────────────────
Goal Engine, Decision, Policy             Umer AI OS Runtime
Budget / Attention / Escalation           Computer Runtime
Model Router policy                       Knowledge Runtime
Capability grants & sandboxes             Event bus payloads
Shadow vs Live mode switch                Results + side effects
```

**Why:** Policy without a control plane becomes scattered if-statements in agents. Control plane owns *authorization, budgets, mode, and escalation*; data plane owns *execution and evidence*. Trust boundary sits between them: no runtime adapter invents its own autonomy.

**Phase:** 0 design (name it) → 1 enforce on every action proposal.  
**Skip risk:** agents become peer to Policy; firewall is theater.

---

## 2. Major additions (concrete)

### 2.1 Identity & Trust Graph — must-have

**What:** First-class principals: `Human(Umer)`, `JARVIS`, `OS Agent`, `Computer Session`, `Model Backend`, `Skill`, `External Account`. Edges: `owns`, `delegates`, `can_invoke`, `can_spend`, `can_publish`, `attested_by`. Every Action carries `principal_id` + `delegation_chain`.

**Why:** “Multi-tenant-of-one” — one human, many agents — fails without who-acted-as-whom. Audit and strong-confirm need a chain, not a log line saying “agent.”

**Plugs in:** Policy Engine (who may propose vs execute); Decision Journal (attribution); Computer Runtime (session ≠ JARVIS ≠ OS agent).

**Phase:** 0 schema → 1 stamp every run → later revoke/rotate credentials in graph.  
**Skip risk:** unattributable actions; can’t revoke a rogue skill/agent without nuking everything.

---

### 2.2 Tool Capability Manifests — must-have

**What:** Every tool/adapter declares a **manifest**:

| Field | Example |
| --- | --- |
| `effects` | `read` / `write` / `external` / `irreversible` / `spend` |
| `resources` | filesystem paths, APIs, OS agent types, window scopes |
| `blast_radius` | local / account / org / public |
| `idempotent` | bool |
| `dry_run_supported` | bool |
| `required_autonomy` | min level per domain |
| `side_channels` | clipboard, network, screenshots |

Orchestrator rejects any tool call that exceeds the grant for that principal + domain + mode.

**Why:** Approval matrix today is action-*class* prose. Manifests make it enforceable and reviewable. Computer control without manifests is remote code execution with a chat UI.

**Plugs in:** Policy, Computer Runtime, Umer AI OS adapters, Model Router (tools exposed to model ⊆ granted set).

**Phase:** 0 define schema → 1 every Phase-1 tool has a manifest → later generate manifests from OS APIs.  
**Skip risk:** “approve send email” while tool can also dump wallet keys.

---

### 2.3 Simulation / Dry-Run Gate — must-have (before Live external)

**What:** Two-phase act: `PROPOSE → SIMULATE → (approve?) → COMMIT`. Simulation returns predicted world-model delta, cost, blast, and conflicts — no external side effects. Tools without `dry_run_supported` default to Approve/Strong and never Auto at L≤2.

**Why:** “Know when not to act” needs a cheap preview. Decision Engine candidates without simulation are vibes.

**Plugs in:** Decision Engine (candidates scored on sim output); Policy (Auto only if sim risk ≤ threshold); World Model (hypothetical branch, discarded or journaled).

**Phase:** 0 design contract → 1 for OS agent runs + any external → later computer UI dry-run (harder).  
**Skip risk:** first irreversible mistake teaches you why you needed it.

---

### 2.4 Provenance / Evidence Chain — must-have

**What:** Append-only chain per material outcome:

```
stimulus → decision_id → policy_verdict → tool_invocations[]
  → raw_results_refs → world_model_patches → metrics → expected_vs_actual
```

Content-addressed artifacts (hashes). Journal links into this chain; chain is the source of truth for audit/replay.

**Why:** Decision Journal without provenance is a diary. CEO-operator needs “show me why we spent / sent / deleted.”

**Plugs in:** Memory (episodic points at chain IDs); Experiments (results are evidence nodes); Orchestrator (emits spans).

**Phase:** 0 ID schema → 1 persist chain for every non-read action → later signed/exportable packs.  
**Skip risk:** un-debuggable autonomy; no learning loop you can trust.

---

### 2.5 Cost / Energy / Attention Budget — force-multiplier (design early)

**What:** Scarce resources as first-class budgets per domain / goal / day:

- **$** (API, spend actions, ads)
- **tokens / inference energy** (local + external)
- **human attention** (escalations/hour, interrupt weight)
- **computer focus** (exclusive UI lock time)

Budget Engine sits on control plane; Orchestrator refuses or degrades when exhausted. Soft vs hard caps; soft triggers replan.

**Why:** Unbounded CEO agents optimize for “busy.” Calendar/time economics and financial guardrails are the same pattern with different units.

**Plugs in:** Policy (spend class); Model Router (cheap vs expensive brain); Goal Engine (opportunity under remaining budget); Escalation taxonomy (attention is currency).

**Phase:** 0 define units + where caps live → 1 token+$ soft caps on Phase-1 slice → later full calendar economics.  
**Skip risk:** runaway bills, notification spam, thrashing the desktop.

---

### 2.6 Attention / Interrupt Model — force-multiplier

**What:** Not every event is equal. Classify:

| Class | Behavior |
| --- | --- |
| `background` | queue; no interrupt |
| `batch` | digest at schedule |
| `interrupt` | pause current low-priority work |
| `page` | human now (safety / money / deadline) |

JARVIS maintains an **attention stack** (current goal focus + deferred). Interrupts must cite policy reason + budget cost.

**Why:** Event-driven without attention policy = ADHD agent. Conflicts with “current-state awareness” if everything is urgent.

**Plugs in:** Orchestrator priorities; Mission Control later (digest UI); Decision Engine “do not act / defer.”

**Phase:** 0 taxonomy → 1 implement classes on bus → later learned priorities.  
**Skip risk:** user trains the system by rage-quitting.

---

### 2.7 Conflict Resolution for Competing Goals — force-multiplier

**What:** Explicit arbitrator when goals contend for money, calendar, agents, or machine focus:

1. Detect conflict via World Model resource locks + Goal graph edges.  
2. Rank by: explicit user priority → deadline → expected value under budget → autonomy domain rules.  
3. Emit `CONFLICT` decision with alternatives; Auto-resolve only inside policy; else escalate.

**Why:** Goal Engine decomposes; it does not yet say who wins. Without this, two agents book the same slot or spend the same pot.

**Plugs in:** Goal Engine, World Model (locks), Policy, Escalation.

**Phase:** 0 rules sketch → 1 resource locks on tasks → later multi-objective optimization.  
**Skip risk:** silent thrash; duplicate work the RFC already fears.

---

### 2.8 Shadow Mode vs Live — must-have for autonomy ramp

**What:** Global + per-domain mode:

- **Shadow:** full plan/sim/journal; adapters no-op or write to sandbox; compare to human/OS baseline.  
- **Live:** real side effects under Policy.

Promotion Shadow→Live is itself Strong-confirm + Experiment metrics gate.

**Why:** Autonomy levels say *how much* to auto; Shadow says *whether reality is touched*. Orthogonal and necessary for L2+.

**Plugs in:** Orchestrator mode flag; Experiments (shadow A/B); Evaluation harness.

**Phase:** 0 define → 1 default Shadow for new domains → later auto-promote candidates.  
**Skip risk:** “L2 in production” on day one of a new skill.

---

### 2.9 Capability Sandboxing for Computer Control — must-have before Auto computer

**What:** Computer Runtime never gets raw “drive the OS.” Grants are scoped:

- allowlisted apps / URL patterns / directories  
- input modes: observe-only → click within bounds → type in focused field → shell with command allowlist  
- screenshot retention policy  
- session TTL + kill switch  

Separate **observe plane** (machine state into World Model) from **act plane**.

**Why:** Computer is the highest blast-radius local adapter. Manifests alone aren’t enough without OS-level containment.

**Plugs in:** Trust Graph (session principal); Policy matrix row for computer; Dry-run (limited).

**Phase:** 0 threat model → 1 observe-only in slice C → act plane only with sandbox + Approve.  
**Skip risk:** one prompt injection = wipe disk / send mail as user.

---

### 2.10 Human Escalation Taxonomy — force-multiplier

**What:** Replace generic “approval required” with typed escalations:

| Type | SLA feel | Example |
| --- | --- | --- |
| `confirm` | binary yes/no | send draft |
| `choose` | pick among N | vendor A/B |
| `edit` | amend plan | budget reallocation |
| `inform` | FYI, no block | weekly digest |
| `veto_window` | auto unless stopped | low-risk publish after N min |
| `emergency_stop` | halt all Live | kill switch |

Each type has UI contract, attention cost, and expiry (stale approvals die).

**Why:** Firewall matrix without UX semantics produces either rubber-stamping or deadlock.

**Plugs in:** Policy classes; Attention model; Mission Control later; Decision Journal outcomes.

**Phase:** 0 enum → 1 `confirm` + `inform` in text UI → later full set.  
**Skip risk:** approval fatigue → humans Strong-confirm everything blindly.

---

### 2.11 Anti-Sycophancy / Challenge Umer — force-multiplier (CEO-grade)

**What:** Decision Engine mode: **Challenge**. Before committing material plans, generate steelman objections, missing evidence, and “do not act” case. Policy can require Challenge for spend / publish / L≥3. User can demand Challenge always for a domain.

**Why:** Personal CEO that flatters is a liability. Vision says outcomes/strategy and “know when NOT to act” — Challenge operationalizes that against the human’s own bias, not only the model’s.

**Plugs in:** Decision Journal (`alternatives` + `challenge_record`); Experiments; Escalation `choose`.

**Phase:** 0 prompt/policy contract → 1 on Strong-confirm paths → later calibrated disagreement scoring.  
**Skip risk:** confident wrong execution with a smiling rationale.

---

### 2.12 World-Model Entity Schema (versioned) — must-have

**What:** RFC lists entity *names*. Lock a minimal schema:

- Stable `entity_id`, `type`, `version`, `provenance`, `confidence`, `last_verified_at`, `owners[]`, `links[]`  
- Resource locks / claims  
- Soft-delete + tombstones (never silent drop)  
- Machine-state entities ephemeral with TTL vs durable business entities

**Why:** Without schema, “world model” becomes a junk drawer and Goal Engine can’t query “current state” reliably.

**Plugs in:** Memory LTM; OS sync adapters; Conflict locks; Evidence patches.

**Phase:** 0 types for Phase-1 slice only → 1 CRUD + query API → later full graph.  
**Skip risk:** duplicate work; contradictory facts; unmeasurable goals.

---

### 2.13 Replay / Debug of Decision Traces — force-multiplier

**What:** Given `decision_id` or `run_id`, replay: inputs, model route, tool grants, sim output, policy verdict, results — in a debugger (CLI first). Deterministic where possible; record model temps/seeds/provider IDs.

**Why:** Provenance without replay is forensics by hand. Skill/policy bugs need time-travel.

**Plugs in:** Evidence chain; Shadow mode (compare replay to live); Evaluation harness.

**Phase:** 0 event shape for replayability → 1 export JSON trace → later interactive UI.  
**Skip risk:** “it did something weird” with no fix path → autonomy freeze forever.

---

### 2.14 Versioned Skills & Rollback — later (design hooks now)

**What:** Skills are immutable versions: `skill@semver` with manifest, tests, confidence, parent experiment. Runtime pins version. Rollback = pin previous; never hot-edit Live skill in place. Self-improvement writes **candidates** only.

**Why:** Vision’s skill learning + self-improvement without versioning is uncontrolled code deploy.

**Plugs in:** Skill Library; Experiments; Policy (promote skill = Strong); Shadow.

**Phase:** 0 version fields in library design → 1 pin v1 hand-authored skills → later learn-from-source pipeline.  
**Skip risk:** silent skill drift; can’t undo a “helpful” update that emails clients wrong.

---

### 2.15 Evaluation Harness for Skills / Experiments — force-multiplier

**What:** Offline + shadow eval suites: golden tasks, regression traces, metric gates (success, cost, policy violations, human override rate). No skill/domain autonomy bump without harness green + human review.

**Why:** Experiments section exists but has no CI-for-agents. Autonomy levels need evidence, not vibes.

**Plugs in:** Shadow mode; Skill rollback; KPI/OKR coupling; Phase gates L1→L2.

**Phase:** 0 define metrics → 1 manual checklist + logged scores → later automated suite.  
**Skip risk:** autonomy theater; regressions discovered in production email.

---

### 2.16 KPI / OKR Coupling to Goal Engine — later (schema now)

**What:** Goals carry measurable `key_results[]` with sources in World Model / Evidence. Orchestrator schedules **measure** events; Decision Engine adapts or escalates on miss. OKRs are not dashboard candy — they close the RFC loop (measurement → learning → adapt).

**Why:** Without forced measurement, Goal Engine is a task tree.

**Plugs in:** Experiments; Budget; Mission Control later; Decision Journal expected vs actual.

**Phase:** 0 KR fields on Goal → 1 one metric on thin slice → later portfolio OKRs.  
**Skip risk:** activity without outcomes; CEO cosplay.

---

### 2.17 Financial Guardrails (specialized Policy pack) — force-multiplier

**What:** Domain pack: per-vendor limits, daily/weekly caps, dual-control above threshold, merchant allowlists, refund/chargeback playbooks, “no crypto send / no wire” defaults. All spend tools require manifests + dry-run + evidence of quote.

**Why:** Generic “Strong confirm for spend” is necessary but insufficient (fatigue + social engineering).

**Plugs in:** Budget Engine; Trust Graph; Escalation `confirm`/`choose`; Shadow.

**Phase:** 0 defaults → 1 if slice touches money else stub → always before L≥2 on spend domain.  
**Skip risk:** one compromised session drains accounts.

---

### 2.18 Calendar / Time Economics — later

**What:** Treat human calendar and agent compute windows as schedulable resources with opportunity cost. Goal Engine plans against free busy + attention budget; Conflict Resolver owns double-booking.

**Why:** Personal CEO without time economics optimizes everything except the human’s day.

**Plugs in:** Attention model; World Model (calendar entities); Conflict resolution.

**Phase:** later (after Goal + Attention exist); schema hooks in World Model phase 0–1.  
**Skip risk early:** low — but don’t pretend scheduling is “just a skill.”

---

### 2.19 Multi-Tenant-of-One Safety Kit — must-have (compose 2.1–2.9)

**What:** Explicit package of rules for one human, N agents:

- single Live kill switch  
- per-agent concurrency caps  
- no agent elevates another’s grants  
- shared World Model with write ACLs by principal  
- quarantine queue for untrusted tool output before it becomes LTM fact  

**Why:** The failure mode isn’t “many users” — it’s many semi-autonomous selves racing under one identity.

**Phase:** 0 write as invariant list → 1 enforce kill switch + concurrency + grant non-escalation.  
**Skip risk:** agent storms; prompt-injected memory poisoning.

---

## 3. ASCII: where additions sit

```
                    ┌─ Budgets ($ / tokens / attention)
                    ├─ Mode (Shadow|Live)
 YOU ──► JARVIS ────┼─ Trust Graph + Grants
                    ├─ Escalation Taxonomy
                    └─ Challenge (anti-sycophancy)
                           │
                     Policy + Decision
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
         Dry-Run      Orchestrator   Conflict
         / Sim                         Resolver
              │            │
              ▼            ▼
        Evidence Chain ◄── Adapters (OS / Computer / Knowledge)
              │                 │
              ▼                 ▼
         Journal / Replay   World Model (versioned schema)
              │
              ▼
         Eval Harness → Skill versions / Autonomy bumps
```

---

## 4. Top 10 — add these

Ranked for Phase 0–1 leverage. Tags: **MH** must-have · **FM** force-multiplier · **L** later

| # | Addition | Tag | Earliest phase |
| --- | --- | --- | --- |
| 1 | Tool capability manifests + grant checks | **MH** | 0→1 |
| 2 | Identity & trust graph (delegation on every action) | **MH** | 0→1 |
| 3 | Provenance / evidence chain (journal’s backbone) | **MH** | 0→1 |
| 4 | Shadow mode vs Live (orthogonal to autonomy level) | **MH** | 0→1 |
| 5 | Simulation / dry-run before external & irreversible | **MH** | 0→1 |
| 6 | Computer capability sandbox (observe ≠ act) | **MH** | 0; act later |
| 7 | Cost / token / attention budgets | **FM** | 0 design, 1 soft caps |
| 8 | Human escalation taxonomy (+ stale approval expiry) | **FM** | 0→1 |
| 9 | World-model entity schema (versioned, minimal) | **MH** | 0→1 |
| 10 | Evaluation harness + versioned skills (hooks) | **FM** | 0 hooks, 1 manual |

**Honorable (next wave):** Conflict resolver, Challenge-Umer, Replay debugger, Financial guardrail pack, KPI/OKR coupling, Calendar economics.

---

## 5. Trap ideas — sound cool, do NOT build early

1. **Full self-improving skill-from-YouTube pipeline** — Vision candy; without manifests, eval harness, versioning, and Shadow, it’s unsupervised code deploy into your life. Hand-author v1 skills.  
2. **Mission Control / beautiful CEO dashboard first** — RFC already warns; UI before evidence chain and firewall creates a toy that can’t be trusted to go Live.  
3. **Voice + always-on desktop agent** — Max interrupt surface + max computer blast before Attention model and sandbox exist.  
4. **“One brain” forever-local or forever-frontier** — Violates decoupling; also skips Model Router policy and cost budgets. Keep LM Studio as *a* backend.  
5. **Autonomous multi-agent swarms / org-chart of AIs** — Multi-tenant-of-one safety isn’t solved by adding more agents. Concurrency caps and one Goal Engine first; swarm theater later if ever.

---

## 6. Suggested RFC deltas (pointers only)

When RFC bumps past 0.1, add sections (do not expand here into full RFC):

- § Control plane vs data plane + Shadow/Live  
- § Principals & trust graph  
- § Tool capability manifests  
- § Evidence chain & replay contract  
- § Budgets & attention/interrupt classes  
- § Escalation types  
- § Computer observe/act sandbox  
- § Eval gates for autonomy and skill promotion  

Open questions to add for Umer:

- Kill-switch UX preference (global hotkey / chat command / both)?  
- Hard monthly $ and external-token caps?  
- Default new domains to Shadow until N successful evals?  
- Which entity types are in Phase-1 World Model (minimum set)?

---

## Document control

| Field | Value |
| --- | --- |
| Version | 0.1 brainstorm |
| Complements | jarvis-architecture.md RFC 0.1 |
| Tracking | Top 10 accepted in principle — see [improvement-roadmap.md](./improvement-roadmap.md) §3; RFC §11 lists section stubs |
| Next | Fold accepted items into RFC 0.2 after OS audit unblocks; Umer still answers kill-switch / budget / entity-min questions |
