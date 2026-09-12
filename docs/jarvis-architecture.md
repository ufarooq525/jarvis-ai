# JARVIS Architecture RFC

Status: draft (design / audit phase)  
Audience: Umer + Jarvis-ai builders  
Source: vision brainstorm 2026-09-11  
Rule: consume & extend Umer AI OS — do not rebuild it.

---

## 1. Purpose

JARVIS is a **personal AI CEO / operator**: outcomes in, strategy and execution out — via Umer AI OS, computer control, and memory — with an approval firewall and explicit non-action.

This RFC defines system boundaries, core engines, event flow, autonomy/approval, roadmap, non-goals, and open questions. It is the durable design contract before implementation.

---

## 2. System boundaries

| Layer | Role | Owns | Does not own |
| --- | --- | --- | --- |
| **JARVIS** | Personal autonomous operator above the OS | Goals, decisions, policy/approval, orchestration, world model, memory strategy, skill library, experiments, decision journal, model routing | Company workforce runtime internals; raw hardware drivers |
| **Umer AI OS** | OS for autonomous business / workforce | Agent runtime, ops workflows, existing dashboard/APIs, business agents, OS-level events | Personal CEO strategy; per-user STM/episodic narrative unless exposed as APIs |
| **Computer** | Physical/desktop environment | Windows, tabs, apps, terminal, input/automation surfaces | Business goal graph; long-term company knowledge |
| **Local models (e.g. LM Studio)** | One local brain among many | Local inference for reasoning/coding/fast under policy | Routing policy; tool execution; memory persistence |

### Mental model

```
YOU ──NL / voice / UI──► JARVIS (CEO + Computer Agent)
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
        Umer AI OS      Computer Control   Knowledge & Memory
         Operations
```

### Relationship (intent)

- User states **outcomes**.
- JARVIS decides **what work** and **when to escalate**.
- Umer AI OS **performs** workforce/ops work.
- JARVIS **observes, measures, learns**, and asks the human when policy requires it.
- Prefer **reuse and plug-in points** over greenfield rebuild.

---

## 3. Decoupling rule (day one)

Never tightly couple to one model, browser, API, or UI.

- Tools and runtimes sit behind **stable interfaces**.
- Model Router selects backends (local LM Studio, external models) under Policy.
- Computer control and Umer AI OS are **adapters**, not hard-coded assumptions.
- Mission Control / chat / voice are interchangeable frontends to the same event bus and engines.

---

## 4. Core engines

### 4.1 Goal Engine

Decomposes outcomes into executable structure:

```
GOAL → OBJECTIVE → PROJECT → TASK → AGENT RUN → ACTION → RESULT
```

- Thinks in **outcomes/strategy**, not only commands.
- Loop: goal → current state → analysis → opportunities → plan → execution → measurement → learning → adapt.
- Must query **current state** (assets, running work, history, attention) before acting to avoid duplicate work.

### 4.2 Decision Engine

Chooses among options given world state, memory, policy, and confidence.

- Emits candidates with rationale and expected outcomes.
- Writes to **Decision Journal**.
- Can conclude **do not act**.

### 4.3 Policy / Approval Engine

Classifies every proposed action:

| Class | Behavior |
| --- | --- |
| Automatic | Proceed within autonomy + domain rules |
| Approval required | Pause; human yes/no (or edit) |
| Strong confirmation | Explicit second factor / typed confirm for irreversible or high-blast actions |

Policy is **configurable per domain** and tied to autonomy level (see §6).

### 4.4 Orchestrator

Event-driven conductor: event → queue → agent/tool → result → next events.

- Fans out to Umer AI OS Runtime, Computer Runtime, Knowledge Runtime.
- Idempotent where possible; correlates runs with goals and evidence.

### 4.5 World Model

Structured awareness of:

skills · assets · goals · people · companies · projects · accounts · repos · clients · leads · agents · tasks · experiments · knowledge

Plus **machine state**: windows, browser tabs, apps, terminal, LM Studio availability.

World Model is the shared picture JARVIS consults before planning and after results.

### 4.6 Memory

| Tier | Role |
| --- | --- |
| **STM** | Active context: current goal, recent turns, open approvals, live machine state |
| **LTM** | Durable facts, preferences, assets, procedures, entity graph |
| **Episodic** | Time-stamped episodes: what happened, why, outcome |

Not “one vector DB only” — retrieval may use vectors, but tiers and episode structure are first-class.

### 4.7 Skill Library

Reusable procedures with confidence.

Later learning path (post–phase 0):

```
source (video / article / PDF)
  → extract → understand → skill candidate
  → practice → verify → library (confidence ↑/↓)
```

### 4.8 Experiments

Controlled learning:

hypothesis · control / variant · metric · duration · result · conclusion

Feeds Decision Journal and Skill/Policy updates under safeguards.

### 4.9 Decision Journal

For each material decision: decision · why · evidence · alternatives · expected vs actual · confidence.

Used for audit, learning, and “know when not to act.”

### 4.10 Model Router

Routes by task class under Policy:

| Class | Typical use |
| --- | --- |
| Reasoning | Strategy, tradeoffs, “do not act” judgment |
| Coding | Implementation / tool scripts |
| Fast | Classification, routing, short replies |

Local (LM Studio) preferred when policy and capability allow; external models only under explicit policy.

---

## 5. Event-driven flow (sketch)

```
[User / Timer / Sensor / OS event]
            │
            ▼
     Event Bus / Queues
            │
            ▼
        Orchestrator
            │
     ┌──────┼──────────────┐
     ▼      ▼              ▼
  Goal   Decision      Policy/
 Engine   Engine       Approval
     │      │              │
     └──────┼──────────────┘
            ▼
   Plan + Action proposals
            │
            ├──(auto)──► Runtime adapters
            │              ├─ Umer AI OS Runtime
            │              ├─ Computer Runtime
            │              └─ Knowledge Runtime
            │
            └──(gate)──► Human approval UI ──► Runtime adapters
            │
            ▼
     Results / Evidence
            │
            ▼
   Memory + World Model update
            │
            ▼
   Decision Journal / Metrics / next Events
```

---

## 6. Autonomy levels & approval firewall

### Autonomy levels (0–4)

Configurable **per domain** (e.g. research vs spend vs computer control).

| Level | Name | Operator behavior |
| --- | --- | --- |
| **0** | Advisor | Propose only; no side effects without approval |
| **1** | Assisted | Auto for low-risk read/analyze; approve writes |
| **2** | Supervised operator | Auto within domain playbooks; approve exceptions & high blast |
| **3** | Trusted operator | Auto for most domain actions; strong confirm for irreversible / money / external publish |
| **4** | Autonomous business operator | Broad auto within policy envelope; human for out-of-policy and strong-confirm class only |

### Approval firewall matrix (summary)

| Action class | L0 | L1 | L2 | L3 | L4 |
| --- | --- | --- | --- | --- | --- |
| Read / analyze / summarize | Approve | Auto | Auto | Auto | Auto |
| Internal draft / plan | Approve | Auto* | Auto | Auto | Auto |
| OS / workforce agent run (in-policy) | Approve | Approve | Auto | Auto | Auto |
| Computer control (local, reversible) | Approve | Approve | Auto* | Auto | Auto |
| External send / publish | Approve | Approve | Approve | Strong | Strong |
| Spend / delete / irreversible | Approve | Strong | Strong | Strong | Strong |
| Policy / autonomy change | Strong | Strong | Strong | Strong | Strong |

\*Auto only inside domain allowlists; else Approve.

**Know when not to act** is a first-class Decision Engine outcome at every level.

---

## 7. Phased roadmap

```
Phase 0  Design / audit
    │
    ▼
Phase 1  Thin vertical slice (text → agent → tools → memory → [computer|OS])
    │
    ▼
Phase 2  Expand engines (world model depth, skills, experiments, journal)
    │
    ▼
Phase 3  Mission Control UI (evolve Umer AI OS dashboard — after core loop)
    │
    ▼
Phase 4  Voice (last among primary interaction modes)
```

Self-improvement of JARVIS / Umer AI OS remains **aspirational** and gated by Policy + Experiments + human review.

---

## 8. Phase 0 non-goals

Explicitly **out of scope** until audit + this RFC are accepted and a slice is chosen:

- Building JARVIS UI / Mission Control first
- Voice interface
- Rebuilding Umer AI OS from scratch
- Full Skill-from-video/PDF pipeline
- Broad autonomy (treat production as ≤ L1 until proven)
- Tight coupling to a single model, browser, or dashboard
- Unbounded self-modification without safeguards

Phase 0 **does**: audit Umer AI OS (architecture, APIs, agent runtime, decisions, opportunities, events, reuse vs refactor, plug-in points, OS vs JARVIS responsibilities); lock boundaries; pick first vertical slice.

---

## 9. Open questions (Umer)

1. **Umer AI OS repo / API access** — Can builders read the existing OS codebase and runtime APIs for the Phase 0 audit? If yes, where and what is the source of truth? **Still blocked as of 2026-09-12** (private 404 without token).
2. **First vertical slice priority** — **LOCKED: A.** Goal Engine loop (goal → plan → OS agent → result → memory). B and C deferred per brief.
3. Which **domains** start at which autonomy levels (defaults for L0–L2)?
4. What is the preferred **event bus / queue** already in Umer AI OS (reuse vs introduce)?
5. Where should **Decision Journal** and **World Model** persist relative to OS storage? **Interim recommendation:** JARVIS-owned sidecar store.
6. Policy defaults for **local vs external models** (LM Studio first?).

---

## 10. Success criteria (early)

- Clear JARVIS vs OS vs Computer vs models boundaries in code and docs
- One thin vertical slice completes the outcome loop with evidence in Memory / Journal
- Approval firewall enforced for non-auto actions
- No single-vendor lock-in at model, browser, API, or UI layers
- Mission Control and voice deferred until the core loop is real

---

## 11. Planned RFC 0.2 deltas (accepted in principle)

Do not implement until OS audit unblocks coding. Spec detail: [architecture-brainstorm.md](./architecture-brainstorm.md), sequencing: [improvement-roadmap.md](./improvement-roadmap.md).

When bumping to 0.2, add sections for:

- Control plane vs data plane + Shadow|Live
- Principals & trust graph (delegation on every action)
- Tool capability manifests + grant checks
- Evidence chain & replay contract
- Budgets & attention/interrupt classes
- Escalation types (`confirm` / `inform` minimum)
- Computer observe/act sandbox (observe first)
- Eval gates for autonomy and skill promotion

---

## Document control

| Field | Value |
| --- | --- |
| Version | 0.1 (+ §11 preview toward 0.2) |
| Phase | 0 — design / audit |
| Repo home | `jarvis-ai` (migrated 2026-09-12) |
| Next update | After Umer answers remaining §9 items and OS audit findings; then RFC 0.2 |
