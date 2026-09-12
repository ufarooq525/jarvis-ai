# Jarvis-ai — improvement roadmap (planning + brainstorm)

Status: living plan after migrating agent-store docs into this repo (2026-09-12)  
Audience: Umer + builders  
Depends on: [project-context.md](./project-context.md), [jarvis-architecture.md](./jarvis-architecture.md), [architecture-brainstorm.md](./architecture-brainstorm.md), [jarvis-integration-architecture-report.md](./jarvis-integration-architecture-report.md)

---

## 1. Verdict on the existing pack

**What’s strong**

- Clear product shape: JARVIS = control plane; Umer AI OS = exec plane; Computer = later adapter.
- Locked first slice (**Goal Engine**), hierarchy, phase-1 hard requirements (Trust · Manifests · Evidence).
- Brainstorm correctly ranks “CEO that can hurt you” gaps (Shadow|Live, dry-run, budgets, escalation taxonomy).
- Integration report already has enforceable TypeScript contracts for goals, manifests, evidence, and `OsRuntimeAdapter`.

**What’s weak / next**

| Gap | Why it matters | Fix |
| --- | --- | --- |
| ~~OS audit empty~~ | ~~Adapter routes invented~~ | **Done** — local `C:\laragon\www\umer-ai-os` |
| Docs overlap | Brief / vision / RFC / brainstorm / report repeat locks | Keep **project-context** as SSOT |
| RFC still 0.1 | Top-10 must-haves live only in brainstorm | Fold into RFC **0.2** |
| No runnable skeleton | Design-only drift | Scaffold Goal Engine Shadow Loop (§5) |
| OS `plan` has no dry-run | Live = side effects | Mock first; Approve-only until simulate exists |
| Missing `/v1/ceo/attention` | jarvis-tools broken for attention | Derive from gates/runs or OS PR |
| OS jarvis-* vs this repo | Name collision | Chat peer in OS ≠ personal Goal Engine |

**Do not “improve” by building early:** Mission Control, voice, skill-from-video, agent swarms, Live computer control.

---

## 2. Doc hygiene improvements (this repo)

Done or in progress with the migration:

1. **Single entrypoint** — root `README.md` with doc map and unblock steps.
2. **Relative links** — notes + internal index point at `docs/` / `internal/` here, not Cursor store URLs.
3. **Improvement roadmap** — this file; separates *product* improvements from *doc* improvements.
4. **Status honesty** — still mark §§1–4 UNKNOWN until clone succeeds (no invented paths).

Recommended next doc edits (small, high leverage):

| Edit | Target | Purpose |
| --- | --- | --- |
| RFC 0.2 sections | `jarvis-architecture.md` | Control plane, trust graph, manifests, evidence, Shadow\|Live, budgets, escalation, sandbox |
| Close answered §9 items | RFC + project-context | Slice = Goal Engine already locked; remove stale A/B/C ambiguity |
| Domain autonomy pack stub | `docs/domain-autonomy-defaults.md` (new, after OS map) | L0–L2 defaults per OS domain |
| ADR folder | `docs/adr/` | One decision per file when we start coding (bus, store, language) |

---

## 3. RFC 0.2 — accept brainstorm Top 10

Fold these from [architecture-brainstorm.md](./architecture-brainstorm.md) into the RFC (pointers already sketched in brainstorm §6):

| # | Addition | Phase-1 stance |
| --- | --- | --- |
| 1 | Tool capability manifests + grant checks | **Hard reject** without manifest |
| 2 | Identity & trust graph + delegation on every action | Stub principals + stamp every run |
| 3 | Provenance / evidence chain | Append-only for non-read outcomes |
| 4 | Shadow \| Live orthogonal to autonomy 0–4 | New domains default **SHADOW** |
| 5 | Simulation / dry-run gate | Required before external/irreversible Auto |
| 6 | Computer observe ≠ act sandbox | Design only until phase 6 |
| 7 | Cost / token / attention budgets | Soft caps stub OK |
| 8 | Escalation taxonomy (`confirm` / `inform` first) | Stale approvals expire |
| 9 | Versioned world-model entity schema (minimal) | Hooks only in phase 1 |
| 10 | Eval harness + versioned skills | Manual checklist + version fields |

**Trap list stays:** no dashboard-first, no voice-first, no swarm theater, no forever-one-model.

---

## 4. Product improvement sequence (reaffirm)

```
0  Unblock OS audit → fill §§1–4 + findings index
1  Goal Engine architecture (mostly done in report)
2  Trust / Delegation enforcement
3  Tool Manifest registry + grant checks
4  Evidence chain + Decision Journal
5  Goal Engine ↔ real OsRuntimeAdapter
6  Computer observe (then sandboxed act)
7  World Model + memory tiers
8  Skills / learning (versioned, Shadow eval)
9  Mission Control (frontend to JARVIS APIs)
10 Voice + advanced autonomy
```

Between each phase: reassess against classification buckets (stable / active-dev / experimental / missing / redesign-later).

---

## 5. First code slice (when unblocked)

**Name:** Goal Engine Shadow Loop  
**Source of truth:** integration report §16

Acceptance (do not dilute):

- SHADOW domain never hits Live side effects.
- Every run has `decision_id`, `policy_verdict_id`, manifest, `delegation_chain`.
- Evidence chain exportable as JSON.
- Overlapping goal → `do_not_act` or merge (tested).
- Mock `OsRuntimeAdapter` first; real OS binding only after symbol map.

Suggested scaffold (language TBD after OS stack audit — prefer matching OS runtime):

```
jarvis-ai/
  README.md
  docs/ ...
  packages/ or src/
    goal-engine/
    policy/
    trust/
    tools/          # manifests + registry
    evidence/
    adapters/os/    # mock → real
    cli/ or api/    # thin text entry
```

---

## 6. Brainstorm — highest-leverage improvements beyond the docs

1. **Make Policy a real gate, not prose** — one `classify(proposal) → verdict` function used by DispatchBridge only; agents never call adapters directly.
2. **Correlation IDs as a wire standard** — `jarvis_goal_id` / `task` / `run` / `decision` / `principal` / `mode` on every OS call; JARVIS owns the map if OS can’t store them yet.
3. **Idempotency everywhere** — `idempotency_key = jarvis_run_id`; kills double-dispatch.
4. **Challenge mode on Strong-confirm** — steelman “do not act” before money/publish; cheap CEO-grade upgrade.
5. **Kill switch + concurrency caps day one** — multi-tenant-of-one safety without waiting for full trust graph UI.
6. **Quarantine tool output** — never write untrusted adapter text straight into LTM.
7. **Measure one KR on the thin slice** — otherwise Goal Engine is just a task tree.

---

## 7. Decisions still needed from Umer

1. ~~How to grant read access to `umer-ai-os`~~ — **answered:** `C:\laragon\www\umer-ai-os`
2. Kill-switch UX: global hotkey, chat command, or both?
3. Hard monthly `$` and external-token caps?
4. Confirm: all new domains stay Shadow until N successful evals (default yes)?
5. Phase-1 world-model entity minimum set (goals, tasks, os_runs, approvals — anything else)?
6. Preferred persistence for JARVIS store — **interim locked:** sidecar (SQLite/Postgres) owned by JARVIS
7. Should personal Goal Engine live only in `jarvis-ai`, or eventually as an OS package that calls control-api? (Recommend: separate repo; HTTP adapter.)

---

## Document control

| Field | Value |
| --- | --- |
| Version | 0.2 |
| Updated | 2026-09-12 (local OS audit) |
| Next | Scaffold Shadow Loop behind mock adapter; RFC 0.2 stubs |
