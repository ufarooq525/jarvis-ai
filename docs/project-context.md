# Jarvis-ai — project context

Stable goals, constraints, and decisions. Detail lives in [jarvis-architecture.md](./jarvis-architecture.md) and the integration report [jarvis-integration-architecture-report.md](./jarvis-integration-architecture-report.md). Planning deltas: [improvement-roadmap.md](./improvement-roadmap.md).

**Home:** this repo (`c:\laragon\www\jarvis-ai`) — design pack migrated from Cursor agent store on 2026-09-12.

## Goals

- JARVIS = personal AI CEO/operator: outcomes → plan → execute → measure → learn.
- Consume and extend **Umer AI OS**; do not rebuild it.
- Design / audit first; thin vertical slice before Mission Control or voice.

## Constraints

- **Decoupling**: no hard lock to one model, browser, API, or UI.
- **Adapter boundary (permanent)**: Goal Engine depends only on the `OsRuntimeAdapter` contract — never on Umer AI OS implementation details.

```
JARVIS → Goal Engine → Adapter Contract → Mock Adapter | Umer OS Adapter → Control API/NATS → Umer AI OS
```

- **Approval firewall** + autonomy levels 0–4 (per domain).
- Memory is STM / LTM / Episodic / Knowledge / Procedural — not only a vector store.
- Local models (e.g. LM Studio) are one brain behind the Model Router, not the whole system.
- Phase-1 hard: Trust/Delegation, Tool Manifests, Evidence Chain.
- New domains default **SHADOW**; Shadow|Live is orthogonal to autonomy level.
- First slice uses **mock adapter exclusively**; real OS adapter only after Shadow Loop is green and routes re-verified.

## Decisions (locked) — 2026-09-11 brief

| Decision | Choice |
| --- | --- |
| Product shape | JARVIS above Umer AI OS + Computer + Knowledge |
| OS source of truth | https://github.com/ufarooq525/umer-ai-os (evolve alongside; no rewrite) |
| Phase 0 | Integration readiness audit + architecture (no app scaffolding unless report needs it) |
| First deep slice | **Goal Engine** (not Mission Control, not broad computer control, not agent swarms) |
| Hierarchy | Goal → Objectives → Projects/Missions → Tasks → Agent Runs → Actions → Observations → Evidence → Results → Learning → Replanning |
| Trust ramp | SHADOW → LIMITED → APPROVED → TRUSTED → AUTONOMOUS; new domains default SHADOW |
| Phase-1 hard requirements | Trust/Delegation · Tool Manifests · Evidence Chain |
| Computer control | Separate capability layer behind tool interface (observe ≠ act until sandboxed) |
| Interaction order | Text → agent → tools → memory → computer/OS first; Mission Control after core loop; voice last |
| Build stance | Reuse OS runtime via **adapter contract** only; dashboard remains human-facing |
| Adapter boundary | Permanent: Goal Engine ↛ OS packages; Mock exclusive for §16 |
| Model routing | Abstraction; LM Studio = one local backend under policy |
| Learning / Skills / Experiments | Design for future; do not build full learning in first slice |

## Phase order (reassess between phases)

**Execution plan (FE+BE each phase):** [implementation-phases.md](./implementation-phases.md)

Legacy roadmap labels: 0 audit → 1 Goal Engine → 2 Trust → 3 Manifest → 4 Evidence → 5 GE↔Runtime → 6 Computer → 7 World Model → 8 Skills → 9 Mission Control → 10 Voice  

Mapped to new letters: 0 done · A shell+Shadow UI · B trust/escalation · C evidence/persist · D OS observe · E Live delegate · F WM · G Mission Control · H computer · I voice.

## Audit classification buckets

1. Stable/reusable now  
2. In active development but design around  
3. Experimental/provisional  
4. Missing and required for JARVIS  
5. Redesign later  

## Open / blocked

- **OS repo (GitHub)**: still private/404 without token — **local SoT:** `C:\laragon\www\umer-ai-os` (audited 2026-09-12; report §§1–4 filled).
- Domain-specific default autonomy levels (L0–L2 packs) still to set — seed from OS specialists / departments next.
- Persistence home for Decision Journal / World Model — **confirmed interim:** JARVIS-owned sidecar store (OS MySQL stays exec-plane).
- OS gaps to track: missing `GET /v1/ceo/attention`; no simulate API; cancel incomplete; agent-run durability often in-memory.
- Naming: OS `jarvis-api`/`jarvis-tools` = chat operator; this repo = personal Goal Engine — do not merge.
- RFC 0.2 not yet written — Top 10 from brainstorm accepted in principle via [improvement-roadmap.md](./improvement-roadmap.md).

## Explicit non-goals (phase 1)

Voice · full computer control · social automation · self-modifying AI · Mission Control redesign · skill-from-video pipeline · multi-agent swarm theater.
