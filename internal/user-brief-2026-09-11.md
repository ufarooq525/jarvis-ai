# User brief — JARVIS × Umer AI OS (2026-09-11)

## Locked decisions
- Repo to audit: https://github.com/ufarooq525/umer-ai-os (actively under development — integration readiness audit, NOT production perfection audit)
- JARVIS = personal autonomous operator/CEO; Umer AI OS = workforce OS; computer = execution env; LM Studio = one local brain
- Do NOT throw away/rewrite Umer AI OS; evolve alongside; JARVIS operates it via APIs/events/tools (dashboard is for humans)
- First deep slice: **Goal Engine** (NOT Mission Control, NOT large computer-control, NOT dozens of agents)
- Hierarchy: Goal → Objectives → Projects/Missions → Tasks → Agent Runs → Actions → Observations → Evidence → Results → Learning → Replanning
- Phase-1 HARD: Trust/Delegation (SHADOW→LIMITED→APPROVED→TRUSTED→AUTONOMOUS; new domains default SHADOW); Tool Manifests; Evidence Chain
- Computer control = separate capability layer behind tool interface
- Memory: STM / LTM / Episodic / Knowledge / Procedural — not only vectors
- Learning system + Skill Library + Experiments = design for future; do not build full learning in first slice
- Event-driven where appropriate; reuse existing OS runtime; model router abstraction
- Do not overbuild phase 1 (no voice, full computer control, social automation, self-modifying AI, Mission Control redesign, etc.)

## Phase order (reassess between phases)
0 Integration audit → 1 Goal Engine arch → 2 Trust/Delegation → 3 Tool Manifest → 4 Evidence/Action/Audit → 5 Goal Engine ↔ Agent Runtime → 6 Computer/Browser layer → 7 World Model+Memory → 8 Skill/Learning → 9 Mission Control → 10 Voice+advanced autonomy

## Audit classification buckets
1 Stable/reusable now
2 In active development but design around
3 Experimental/provisional
4 Missing and required for JARVIS
5 Redesign later

## Deliverable before implementation (architecture report sections)
1 Current Umer AI OS architecture
2 Reusable components
3 Experimental components
4 Agent Runtime integration points
5 Proposed JARVIS boundary
6 Proposed Goal Engine architecture
7 Goal/objective/task/run data model
8 Trust/delegation model
9 Tool manifest contract
10 Evidence/action model
11 Proposed APIs/events between JARVIS and Umer AI OS
12 What stays in Umer AI OS
13 What belongs to JARVIS
14 Future work
15 Risks and concerns
16 Minimal implementation plan for first working slice

Also document audit findings across: architecture, domains, Agent Runtime, agents, workflows, tasks, events, decisions, CEO Attention, opportunities, evidence/artifacts, schema, APIs, dashboard, integrations, queues, LLM/LM Studio, config, auth, logging, testing, limitations.

Existing design docs to align with (do not ignore):
- docs/jarvis-architecture.md
- docs/architecture-brainstorm.md
- docs/project-context.md
- internal/vision-source.md

Output report to: docs/jarvis-integration-architecture-report.md
Update docs/project-context.md with locked decisions from this brief.
