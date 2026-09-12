# JARVIS × Umer AI OS — Integration Architecture Report

Status: **Phase 0 audit grounded** (local OS tree read); Phase 1 design ready  
Date: 2026-09-11 (initial) · **Updated 2026-09-12** (local audit)  
Audience: Umer + Jarvis-ai builders  
Rule: evolve Umer AI OS; JARVIS plugs in via APIs / events / tools — no rewrite.  
Sources: locked brief `internal/user-brief-2026-09-11.md`, `docs/jarvis-architecture.md`, `docs/architecture-brainstorm.md`, `docs/project-context.md`, live tree `C:\laragon\www\umer-ai-os`.

### Audit access status

| Item | Status |
| --- | --- |
| Target repo (GitHub) | `https://github.com/ufarooq525/umer-ai-os` (private / still 404 without token) |
| **Local source of truth** | **`C:\laragon\www\umer-ai-os`** — audited 2026-09-12 |
| Clone via GitHub (2026-09-11) | BLOCKED — unauthenticated 404 |
| §§1–4 + Appendix A | **FILLED** from local tree (paths/symbols below) |
| Goal Engine contracts (§5–11, §13–16) | Still valid; §4/§11 now map to real control-api + NATS surfaces |
| Doc home | `jarvis-ai` repo; see [improvement-roadmap.md](./improvement-roadmap.md) |

Naming note: OS already ships `apps/jarvis-api`, `packages/jarvis-core|memory|tools` — that is the **OS chat / operator assistant** (human UI → control-api). This repo’s JARVIS = **personal Goal Engine / control plane above the OS**. Do not merge them; personal JARVIS should call control-api / Message Fabric the same way `jarvis-tools` does, not fork a second agent loop.

---

## 0. Locked decisions (do not revisit in phase 1)

| Decision | Value |
| --- | --- |
| Roles | JARVIS = personal autonomous operator/CEO; Umer AI OS = workforce OS; Computer = execution env; LM Studio = one local brain |
| First deep slice | **Goal Engine** |
| Hierarchy | Goal → Objectives → Projects/Missions → Tasks → Agent Runs → Actions → Observations → Evidence → Results → Learning → Replanning |
| Phase-1 HARD | Trust/Delegation · Tool Manifests · Evidence Chain |
| Trust ramp | SHADOW → LIMITED → APPROVED → TRUSTED → AUTONOMOUS; **new domains default SHADOW** |
| Shadow\|Live | Orthogonal to autonomy 0–4 |
| Non-goals now | Voice · full computer · social automation · self-modifying AI · Mission Control redesign · skill-from-video · agent swarms |
| Phase order | 0 audit → 1 Goal Engine arch → 2 Trust → 3 Manifest → 4 Evidence → 5 GE↔Agent Runtime → 6 Computer → 7 World Model+Memory → 8 Skill/Learning → 9 Mission Control → 10 Voice |

---

## 1. Current Umer AI OS architecture

**Grounded:** local tree `C:\laragon\www\umer-ai-os` (pnpm@9.15 + turbo monorepo, Node ≥20). Architecture V1 frozen per root `README.md`; execution truth in `AUTONOMY_STATUS.md` (live eng/QA/security verified 2026-09-12).

### 1.1 Layout

| Layer | Paths |
| --- | --- |
| Apps | `apps/control-api`, `agent-worker`, `orchestration-worker`, `jarvis-api`, `web`, `api-gateway`, `audit-sink`, `extension-worker` |
| Key packages | `packages/agent-runtime`, `orchestration`, `message-fabric`, `contracts`, `control-plane`, `artifacts`, `db`, `model-routing`, `trust`, `opportunity-intelligence`, `jarvis-core`, `jarvis-tools`, `jarvis-memory`, `event-bus`, … |
| Specialists | `specialists/**/*.md` (mandates; loaded by agent-worker) |
| Projects catalog | `projects/catalog.json` (Laragon apps; `UMER_PROJECTS_ROOT`) |
| Infra | `infra/docker/docker-compose.yml` (MySQL, NATS, …) |

### 1.2 Runtime entrypoints

| Process | Entry | Role |
| --- | --- | --- |
| control-api | `apps/control-api/src/main.ts` → `server.ts` | HTTP control plane (default port **4000**); read models, plan, gates, company loop |
| agent-worker | `apps/agent-worker/src/main.ts` | Consumes `cmd.agent.dispatch` / `workpackage.dispatch` → `AgentRuntime.execute` |
| orchestration-worker | `apps/orchestration-worker/src/main.ts` | Work Graph planner + dispatch via Message Fabric |
| jarvis-api | `apps/jarvis-api/src/main.ts` | OS chat API (~3010); tools hit control-api |
| web | `apps/web` (Next.js) | Human Command Center / Attention / Gates / `JarvisChat` |

**Dispatch chain (real):**  
`POST /v1/work-graph/:projectId/plan` → fabric `workgraph.plan` → `ReadyWorkPackagePlanner` → `publishCommand(SUBJECTS.CMD_AGENT_DISPATCH)` (`packages/orchestration`) → `AgentWorker` → `AgentRuntime.execute` → events on `evt.runtime.*`.

### 1.3 Persistence & bus

| Concern | Reality |
| --- | --- |
| Primary DB | **MySQL** — hand-written migrations in `packages/db/src/*-migration*.ts`, applied via `ALL_MYSQL_MIGRATIONS` / `migrate()` (not Prisma/Drizzle) |
| Also configured | Postgres `DATABASE_URL`, Redis, S3/MinIO (artifacts) |
| Event/command bus | **NATS JetStream** via `@umer/message-fabric` — streams `UMER_COMMANDS`, `UMER_EVENTS`, `UMER_DLQ`; subjects in `packages/message-fabric/src/constants.ts` |
| In-process shim | `@umer/event-bus` — experimental/QA watchdog only; **do not** use as production bus |

### 1.4 Domains (verified)

Work Graph + Work Packages · Requirements · Tasks · Agent runs/registry · Specialists · Gates (`@umer/control-plane`) · Opportunities / commercial pipeline · Artifacts / `.umer/` evidence · Company overview + graph · Intake · CEO commands (`POST /v1/commands`) · Learnings / calibration.

**No first-class Mission entity** — “mission” appears as specialist mandate prose. Map JARVIS “Projects/Missions” → OS Work Projects / Work Graph / Work Packages.

### 1.5 Control vs data plane (confirmed)

```
CONTROL PLANE (jarvis-ai Goal Engine)     DATA / EXEC PLANE (umer-ai-os)
─────────────────────────────────────     ──────────────────────────────
Goal / Decision / Policy / Trust          AgentRuntime + AgentWorker
Budgets + Shadow|Live                     Orchestration + Work Graph
Tool manifests + grants                   control-api HTTP + NATS commands
Evidence chain authority (personal)       Artifacts + audit-sink + .umer/
                                          Message Fabric (reuse)
```

Trust boundary: personal JARVIS never bypasses gates; Live dispatch goes through existing plan/intake + Policy verdict. OS runtimes must not invent personal autonomy levels.

---

## 2. Reusable components

Bucket legend: **1** stable · **2** active-dev · **3** experimental · **4** missing for personal JARVIS · **5** redesign later.

| Component | Path / symbol | Bucket | JARVIS stance |
| --- | --- | --- | --- |
| Agent Runtime | `packages/agent-runtime` — `AgentRuntime`, `createAgentWorker`, `subscribeAgentRunReadModel` | **1** | Prefer via control-api/NATS; do not reimplement |
| Message Fabric | `packages/message-fabric` — `SUBJECTS.CMD_AGENT_DISPATCH`, `EVT_RUNTIME` | **1** | Subscribe for run events; optional for Shadow (mock) |
| control-api | `apps/control-api/src/server.ts` | **1** / **2** | Primary HTTP adapter surface |
| Work Graph plan | `POST /v1/work-graph/:projectId/plan` | **1** | Primary `startRun` path (needs `approver`) |
| Gates | `GET /v1/gates/pending`, `/review`, `POST …/resolve` | **1** | Map to escalation / Strong-confirm |
| Artifacts | `@umer/artifacts`, `GET /v1/artifacts` | **1** | Evidence blob host candidate |
| Opportunities | `packages/opportunity-intelligence`, `GET /v1/opportunities` | **1** | Later Goal Engine inputs |
| model-routing | `packages/model-routing` — LM Studio / openai-compatible | **1** | One backend under personal Model Router policy |
| `@umer/trust` + MySQL grants | `packages/trust`, `trust-grants-migration` | **2** | Align personal Trust Graph; wrap, don’t fork blindly |
| OS jarvis-api/tools | `apps/jarvis-api`, `packages/jarvis-tools` | **2** | Peer/consumer of control-api — **not** the Goal Engine |
| Dashboard / Command Center | `apps/web` `/command-center`, `/attention`, `/gates` | **1** (human) | Frontend later; not phase-1 code target |
| Agent run read model | Often `InMemoryAgentRunReadModelStore` in control-api | **2** | Durable MySQL path exists but not always default — design around restart loss |
| Intake | `POST /v1/intake` | **1** | Alternate start path (`delegate_work` in jarvis-tools) |

---

## 3. Experimental / provisional / gaps

| Item | Path / note | Bucket | Implication |
| --- | --- | --- | --- |
| `@umer/event-bus` | In-process QA shim | **3** | Ignore for GE↔Runtime |
| Browser voice | `apps/web/src/lib/jarvis-voice/*` | **3** | Phase-1 non-goal |
| `GET /v1/ceo/attention` | Called by `jarvis-tools` / `jarvis-api`; **not implemented** in control-api | **4** | Attention tools broken until OS adds route or JARVIS derives from dashboard/gates/failed-runs |
| Dedicated simulate / dry-run API | None — `plan` dispatches | **4** | Shadow Loop must mock or no-op Live; Policy Approve-only when no dry-run |
| HTTP cancel → AbortSignal | Runtime supports `AbortSignal`; no control-api kill wiring found; CEO `CancelWork` via commands | **4** | Adapter `cancelRun` = best-effort command + map |
| Deployment live Docker/K8s | Deferred in `AUTONOMY_STATUS.md` | **3**/defer | Out of scope for JARVIS phase 1 |
| `CONTROL_API_SEED_DEMO` | Fabricates demo state | **3** | Never use in Shadow eval truth |

Do **not** treat unfinished OS modules as defects. Do **not** invent a second intake, gate system, or agent loop (OS rules + AUTONOMY_STATUS forbid duplicates).

---

## 4. Agent Runtime integration points

### 4.1 `OsRuntimeAdapter` → real OS mappings

| Adapter method | Map to | Notes |
| --- | --- | --- |
| `listCapabilities()` | `GET /v1/specialists` (+ agent registry / capability IDs on `agent.run.started`) | Manifests authored in JARVIS; `os_binding.agent_type` / specialist id |
| `getCurrentState(query)` | `GET /v1/dashboard`, `/v1/company/overview`, `/v1/company/graph`, `/v1/agent-runs`, `/v1/gates/pending`, `/v1/work-packages` | StateInspector mandatory before Live |
| `proposeRun` / simulate | **Gap** — closest: inspect work-graph `GET /v1/work-graph/:id`; intake without claiming execution | Shadow: mock adapter; Live Auto only when dry-run exists or Approve |
| `startRun(spec)` | **Primary:** `POST /v1/work-graph/:projectId/plan` with `approver`. **Alt:** `POST /v1/intake` (jarvis-tools `delegate_work`) | Return / map `workPackageId` as `os_run_id` |
| `getRun(os_run_id)` | `GET /v1/agent-runs/:workPackageId` | List: `GET /v1/agent-runs?status=` |
| `cancelRun(os_run_id)` | `POST /v1/commands` CEO `CancelWork` (best-effort) | No dedicated abort HTTP yet |
| `subscribe(events)` | NATS `evt.runtime.*` via `subscribeAgentRunReadModel`; or poll `GET /v1/agent-runs/:id` | Prefer poll shim in phase 1 if JARVIS isn’t on fabric yet |

Web client reference: `apps/web/src/lib/control-api.ts` (`getAgentRuns`, `executeCommand`, `resolveGate`, `getCompanyOverview`, …).  
Tool reference: `packages/jarvis-tools/src/index.ts`.

### 4.2 Correlation IDs (hard)

OS already threads `correlationId` on commands/events (`runId = \`${workPackageId}:${correlationId}\`` in Agent Runtime).

Every JARVIS→OS call still carries (JARVIS-owned map if OS ignores extras):

```
jarvis_goal_id · jarvis_task_id · jarvis_run_id · decision_id
· principal_id · delegation_chain[] · mode (shadow|live) · policy_verdict_id
```

Persist `os_run_id` (= workPackageId) → `jarvis_*` in JARVIS store.

### 4.3 Idempotency

Prefer `idempotency_key = jarvis_run_id`. OS plan/intake may not honor this yet — **JARVIS must dedupe** before calling `startRun` (check open AgentRuns / StateInspector). Track as OS extension candidate (bucket **4**).

---

## 5. Proposed JARVIS boundary

| Belongs to JARVIS (control) | Belongs to Umer AI OS (exec) | Belongs to Computer (later) |
| --- | --- | --- |
| Goals / objectives / prioritization | Agent Runtime internals | Window/app/browser observe+act |
| Decision + Policy + Trust grants | Workforce agents & workflows | Local shell/UI automation |
| Tool grant checks vs manifests | Ops domain data | Session sandbox |
| Evidence chain + Decision Journal (authority) | Artifact blob host (optional) | Screenshots under retention policy |
| Model Router policy | Existing LLM helpers (callable) | LM Studio process health (sensor) |
| Shadow\|Live mode switch | Side-effect execution when Live | — |
| Escalation to human | Human dashboard (consume JARVIS APIs later) | — |

**Decoupling:** Mission Control / chat / voice are interchangeable frontends. JARVIS never imports OS UI. OS never embeds Goal Engine logic.

---

## 6. Proposed Goal Engine architecture

### 6.1 Responsibility

Decompose **outcomes** into the locked hierarchy; query current state before acting; emit plans as **action proposals** (never raw side effects); close the loop with measurement → (future) learning → replanning.

### 6.2 Internal modules (phase 1)

```
GoalEngine
├── GoalStore          # CRUD + graph edges
├── Decomposer         # Goal → Objectives → … → Tasks (LLM via Model Router)
├── StateInspector     # OS adapter + World Model stubs + memory STM
├── Planner            # Task graph, resource claims, conflict detect (minimal)
├── DispatchBridge     # Proposals → Policy → (Shadow no-op | Live adapter)
├── ProgressTracker    # Observations → Results → goal status
└── Replanner          # On failure / KR miss / conflict — phase-1: escalate or simple retry policy
```

Decision Engine / Policy Engine sit **beside** Goal Engine on the control plane (not inside Decomposer). Goal Engine may *request* decisions; it does not bypass Policy.

### 6.3 Loop (phase-1 vertical)

```
User outcome
  → Goal.create (SHADOW domain default)
  → StateInspector.snapshot
  → Decomposer.plan (Decision Journal entry)
  → Policy.classify each Task/Run proposal
  → [Shadow] simulate + journal only
  → [Live + Auto] OsRuntimeAdapter.startRun
  → [Approve] Escalation(confirm|choose|edit)
  → Observations/Evidence append
  → ProgressTracker.update KRs
  → next event (replan | complete | escalate)
```

### 6.4 Current-state awareness (mandatory)

Before `DispatchBridge` emits Live work, `StateInspector` must answer:

- Existing goals/tasks overlapping intent?
- Active OS runs for same domain?
- Open approvals / attention items?
- Budget remaining (tokens/$ soft caps — stub OK)?

If duplicate risk: Decision outcome **do_not_act** or **merge_into_existing** — first-class, journaled.

---

## 7. Goal / objective / task / run data model

IDs: ULID/UUID. Timestamps: ISO-8601 UTC. Soft-delete via `tombstoned_at`.

### 7.1 Core entities

```ts
type TrustTier = "SHADOW" | "LIMITED" | "APPROVED" | "TRUSTED" | "AUTONOMOUS";
type Mode = "shadow" | "live";
type AutonomyLevel = 0 | 1 | 2 | 3 | 4;

interface KeyResult {
  id: string;
  label: string;
  metric_ref: string;          // World Model / Evidence pointer
  target: number | string;
  current?: number | string;
  last_measured_at?: string;
}

interface Goal {
  id: string;
  title: string;
  outcome: string;             // user-facing success statement
  domain: string;              // trust/policy key
  status: "draft" | "active" | "blocked" | "done" | "cancelled";
  priority: number;
  trust_tier: TrustTier;      // domain default SHADOW
  autonomy_ceiling: AutonomyLevel;
  mode: Mode;                  // effective mode (usually domain mode)
  key_results: KeyResult[];
  owner_principal_id: string;  // Human(Umer)
  created_at: string;
  updated_at: string;
  provenance: ProvenanceRef;
}

interface Objective {
  id: string;
  goal_id: string;
  title: string;
  success_criteria: string;
  status: Goal["status"];
  order: number;
}

interface ProjectOrMission {
  id: string;
  objective_id: string;
  kind: "project" | "mission";
  title: string;
  status: Goal["status"];
}

interface Task {
  id: string;
  parent_id: string;           // project/mission id
  goal_id: string;             // denormalized
  title: string;
  intent: string;
  status: "pending" | "ready" | "running" | "waiting_approval" | "done" | "failed" | "cancelled";
  assignee_kind: "os_agent" | "computer" | "human" | "jarvis_internal";
  tool_ids: string[];          // must exist in ToolRegistry + granted
  resource_claims: ResourceClaim[];
  idempotency_key: string;
}

interface AgentRun {
  id: string;                  // jarvis_run_id
  task_id: string;
  goal_id: string;
  decision_id: string;
  os_run_id?: string;          // correlation when dispatched
  principal_id: string;
  delegation_chain: string[];
  mode: Mode;
  policy_verdict_id: string;
  status: "proposed" | "simulated" | "approved" | "running" | "succeeded" | "failed" | "cancelled";
  tool_invocations: string[];  // evidence node ids
}

interface Action {
  id: string;
  run_id: string;
  tool_id: string;
  input: unknown;
  dry_run: boolean;
  status: "proposed" | "simulated" | "committed" | "rejected" | "failed";
  principal_id: string;
  delegation_chain: string[];
}

interface Observation {
  id: string;
  run_id: string;
  action_id?: string;
  summary: string;
  raw_ref?: ContentAddressedRef;
  at: string;
}

interface Result {
  id: string;
  goal_id: string;
  run_id?: string;
  kind: "success" | "partial" | "failure" | "do_not_act";
  summary: string;
  expected_vs_actual?: { expected: string; actual: string };
  evidence_head: string;       // evidence chain tip id
}
```

### 7.2 Resource claims (minimal conflict)

```ts
interface ResourceClaim {
  resource_type: "agent" | "budget_usd" | "tokens" | "attention" | "computer_focus" | "os_entity";
  resource_id: string;
  exclusive: boolean;
  until?: string;
}
```

Phase 1: detect exclusive conflicts → escalate `CONFLICT` (no fancy multi-objective solver).

### 7.3 Persistence home

| Data | Phase-1 home | Notes |
| --- | --- | --- |
| Goal graph + AgentRun mapping | **JARVIS store** | Source of truth for control plane |
| OS native task/run rows | **OS DB** | Mapped via `os_run_id` |
| Evidence artifacts (blobs) | OS object store **or** JARVIS files | Content-addressed; chain metadata in JARVIS |
| Decision Journal | JARVIS | Links evidence IDs |

**Grounded:** OS has Work Projects / Requirements / Work Packages / Tasks — **no Goal or Mission tables**. Prefer **JARVIS-owned goal tables** (sidecar) and correlate via `os_run_id` / `workPackageId` / `projectId` (avoids OS schema churn).

---

## 8. Trust / delegation model

### 8.1 Principals

`Human(Umer)` · `JARVIS` · `OS_Agent(<id>)` · `Computer_Session(<id>)` · `Model_Backend(<id>)` · `Skill(<id>@semver)` · `External_Account(<id>)`

### 8.2 Trust tiers (phase-1 hard)

| Tier | Meaning | Side effects |
| --- | --- | --- |
| SHADOW | Plan/sim/journal only | Adapters no-op or sandbox |
| LIMITED | Reads + low-blast internal writes per allowlist | External/irreversible blocked |
| APPROVED | Human-approved playbooks | Within grant + manifest |
| TRUSTED | Broad in-domain auto under policy | Strong-confirm still for spend/publish/irreversible |
| AUTONOMOUS | Max within policy envelope | Out-of-policy → human |

**Default:** new `domain` → **SHADOW**. Promotion is Strong-confirm + eval evidence (manual checklist OK in phase 1).

### 8.3 Delegation chain

Every `Action` / `AgentRun` stamps:

```ts
interface DelegationEdge {
  from: string;  // principal_id
  to: string;
  grant_id: string;
  scope: string[];           // tool_ids or domains
  expires_at?: string;
}

// delegation_chain ordered root→leaf, e.g. Human → JARVIS → OS_Agent:research
```

Invariants (multi-tenant-of-one kit):

1. No principal elevates another’s grants.
2. Global Live **kill switch** halts all `mode=live` dispatches.
3. Per-agent concurrency caps.
4. Untrusted tool output quarantined before LTM write.

### 8.4 Mapping to autonomy 0–4

Trust tier ∩ autonomy level ∩ action class → Policy verdict. Shadow mode short-circuits side effects regardless of autonomy.

---

## 9. Tool manifest contract

Phase-1 hard: **no tool call without a manifest + grant check**.

```ts
type Effect = "read" | "write" | "external" | "irreversible" | "spend";

interface ToolManifest {
  tool_id: string;                 // stable
  version: string;                 // semver
  adapter: "umer_os" | "computer" | "knowledge" | "jarvis_internal";
  display_name: string;
  effects: Effect[];
  resources: string[];             // paths, APIs, agent types, window scopes
  blast_radius: "local" | "account" | "org" | "public";
  idempotent: boolean;
  dry_run_supported: boolean;
  required_autonomy: AutonomyLevel; // minimum
  required_trust_tier: TrustTier;
  side_channels: string[];         // clipboard, network, screenshots, ...
  input_schema: object;            // JSON Schema
  output_schema?: object;
  os_binding?: {                   // when adapter=umer_os
    agent_type?: string;
    workflow_id?: string;
    api_route?: string;            // fill from real OS after audit
  };
}
```

### Enforcement

```
Orchestrator/DispatchBridge:
  grant = TrustGraph.grant(principal, tool_id, domain)
  if !grant || !manifest: REJECT
  if mode==shadow && effects intersects {external, irreversible, spend}:
      force dry_run or no-op
  if !manifest.dry_run_supported && effects high-blast:
      forbid Auto at autonomy ≤ 2
  Policy.verdict(action_class, domain, autonomy, trust_tier, sim)
```

Phase-1 tools (minimal set): `os.runtime.get_state`, `os.runtime.start_run`, `os.runtime.get_run`, `jarvis.goal.*` (internal), `jarvis.journal.append`. Computer tools = stubs only.

---

## 10. Evidence / action model

Phase-1 hard: append-only chain for every non-read material outcome.

```ts
interface ContentAddressedRef {
  hash: string;          // sha256
  media_type: string;
  uri: string;           // storage locator
  bytes?: number;
}

interface EvidenceNode {
  id: string;
  prev_id?: string;      // chain link
  goal_id: string;
  run_id?: string;
  kind:
    | "stimulus"
    | "decision"
    | "policy_verdict"
    | "simulation"
    | "tool_invocation"
    | "raw_result"
    | "observation"
    | "world_model_patch"
    | "metric"
    | "expected_vs_actual";
  at: string;
  principal_id: string;
  payload_ref?: ContentAddressedRef;
  payload_summary: string;
  correlation: {
    decision_id?: string;
    policy_verdict_id?: string;
    os_run_id?: string;
  };
}
```

### Decision Journal link

```ts
interface DecisionRecord {
  id: string;
  goal_id?: string;
  decision: string;
  why: string;
  alternatives: string[];
  challenge_record?: string;     // anti-sycophancy; optional phase 1
  evidence_head: string;
  expected?: string;
  actual?: string;
  confidence: number;            // 0..1
  outcome: "act" | "do_not_act" | "escalate" | "defer";
}
```

Replay (phase 1): export JSON trace by `decision_id` / `jarvis_run_id` (CLI later). No UI required.

---

## 11. Proposed APIs / events between JARVIS and Umer AI OS

Transport: **HTTP to control-api** (primary for phase 1) + optional **NATS JetStream** subscribe for run events. Contract remains conceptually the same; concrete routes below replace UNKNOWN.

### 11.1 JARVIS → OS (commands) — concrete

| Adapter intent | OS route / mechanism |
| --- | --- |
| capabilities | `GET /v1/specialists`, `GET /v1/agents` |
| state query | `GET /v1/dashboard`, `/v1/company/overview`, `/v1/company/graph`, `/v1/gates/pending`, `/v1/agent-runs`, `/v1/work-packages`, `/v1/tasks` |
| simulate | **Missing** — Shadow mock only until OS adds dry-run |
| start run | `POST /v1/work-graph/:projectId/plan` `{ approver }` · alt `POST /v1/intake` |
| get run | `GET /v1/agent-runs/:workPackageId` |
| cancel | `POST /v1/commands` (`CancelWork`) best-effort |

`RunSpec.os_binding` should fill `agent_type` / specialist id / `api_route` from real specialists after listing capabilities.

### 11.2 OS → JARVIS (events)

Prefer Message Fabric subjects under `evt.runtime` (`packages/message-fabric/src/constants.ts`). Event names include `agent.run.started|completed|failed`, workpackage/*, gate/*, artifact/* (`packages/contracts` RuntimeEventNameSchema).

Phase-1 fallback: poll `GET /v1/agent-runs/:workPackageId`.

### 11.3 Human escalation (JARVIS-owned API)

Types phase 1: `confirm` · `inform`. Map OS gates (`GET /v1/gates/pending` + resolve) as an **exec-plane** approval surface — personal JARVIS may escalate *before* calling plan, and/or treat open gates as attention inputs.

---

## 12. What stays in Umer AI OS

| Keep in OS | Path / rationale |
| --- | --- |
| Agent Runtime & workers | `packages/agent-runtime`, `apps/agent-worker` |
| Orchestration / Work Graph | `packages/orchestration`, `apps/orchestration-worker` |
| Message Fabric | `packages/message-fabric` (NATS) |
| control-api | `apps/control-api` — exec/read plane HTTP |
| Gates, artifacts, opportunities, requirements, commercial | Existing packages + MySQL migrations |
| OS jarvis-api / jarvis-tools / jarvis-memory | Chat operator for humans — evolve in OS; personal GE does not replace |
| Dashboard / Command Center | `apps/web` — human UI |
| Specialist mandates | `specialists/` |
| Trust grants schema | `@umer/trust` + DB migrations — coordinate, don’t duplicate blindly |

Anything experimental (`event-bus` shim, voice, demo seed) stays optional.

---

## 13. What belongs to JARVIS

| JARVIS-owned | Phase |
| --- | --- |
| Goal Engine + goal graph store | 1 |
| Decision + Policy engines (thin) | 1 |
| Trust graph + grants + Shadow\|Live | 1 |
| Tool registry + manifest enforcement | 1 |
| Evidence chain + Decision Journal | 1 |
| `OsRuntimeAdapter` + correlation map | 1→5 |
| Model Router abstraction | 1 (LM Studio = one backend) |
| Escalation records | 1 |
| World Model (minimal entities) | 7 (hooks in 1) |
| Memory tiers STM/LTM/Episodic | 7 (STM stub in 1) |
| Skill Library / Experiments / Learning | 8 design only now |
| Mission Control UI | 9 |
| Voice | 10 |
| Computer Runtime adapter | 6 |

---

## 14. Future work (sketch only)

| Area | Intent | Gate |
| --- | --- | --- |
| Computer / browser layer | Observe plane → sandboxed act plane | Manifests + sandbox + Approve |
| World Model + full memory | Versioned entities; episodic links to evidence | After GE↔Runtime loop |
| Skill Library + Experiments | Versioned skills; Shadow eval; no self-mod Live | Eval harness |
| Mission Control | Evolve OS dashboard as frontend to JARVIS APIs | After evidence+firewall real |
| Voice | Last interaction mode | Attention model exists |
| Budgets / attention / conflict solver | Soft caps → hard; interrupt taxonomy | After basic dispatch |
| Challenge-Umer mode | Required on Strong-confirm paths | After Journal |

---

## 15. Risks and concerns

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Confusing OS `jarvis-*` with personal Goal Engine | High | Separate repos/roles; personal JARVIS HTTP-adapts control-api |
| `plan` always dispatches (no simulate) | High | Shadow mock adapter; no Live Auto without Approve until dry-run exists |
| Missing `GET /v1/ceo/attention` | Med | Derive attention from gates + failed runs + overview; optional OS fix |
| In-memory agent-run read model | Med | Poll carefully; prefer durable store flag; don’t trust restart history |
| Coupling Goal Engine into OS schemas mid-churn | High | JARVIS-owned goal store; adapter only |
| Double-dispatch without OS idempotency | High | JARVIS-side idempotency + StateInspector |
| Treating unfinished OS modules as defects | Med | Classification buckets; design-around |
| Autonomy without Shadow | High | Default SHADOW; Live is Strong-confirm per domain |
| Tool calls without manifests | Critical | Hard reject |
| Prompt-injected LTM poisoning | High | Quarantine untrusted tool output |
| Duplicate agent loop / second intake | Critical | Forbidden — reuse OS pipeline only |

---

## 16. Minimal implementation plan — first working slice

**Slice name:** Goal Engine Shadow Loop (text outcome → plan → simulated OS run → evidence → journal).  
**Status (2026-09-12):** **Implemented in `jarvis-ai/src` with Mock adapter exclusively.**

### Architecture rule (permanent)

```
JARVIS → Goal Engine → Adapter Contract → Mock | Umer OS Adapter → Control API/NATS → Umer AI OS
```

Goal Engine never imports Umer AI OS. Future Umer adapter lives under `src/adapters/umer-os/` only after route re-verification (`src/adapters/umer-os/README.md`).

### In scope

1. JARVIS-side Goal/Objective/Task/AgentRun models + store (sidecar; not OS MySQL goals table).
2. Trust: principals stub + domain default SHADOW + delegation stamp.
3. Tool manifests for: `os.runtime.get_state`, `os.runtime.start_run` (noop in Shadow), `os.runtime.get_run`, `jarvis.goal.*`, `jarvis.journal.append`.
4. Evidence chain + Decision Journal persistence.
5. `OsRuntimeAdapter`: **mock only** for this slice (`MockOsRuntimeAdapter`).
6. StateInspector against mock.
7. Thin CLI: `pnpm cli` / `pnpm shadow`.
8. Kill switch + JARVIS-side idempotency keys.

### Out of scope

Live work-graph plan side effects · Computer act · Mission Control redesign · Voice · Learning pipeline · multi-agent fan-out · OS rewrite · replacing `apps/jarvis-api` · **implementing Umer OS Adapter**

### Acceptance

- Creating a goal never touches Live adapters while domain is SHADOW.
- Every proposed run has `decision_id`, `policy_verdict_id`, manifests, delegation_chain.
- Evidence chain replayable as JSON for the run.
- Duplicate overlapping goal triggers `do_not_act` or merge decision (tested).
- Adapter maps documented to real OS routes; no invented control-api paths.

### Sequencing

1. ~~Clone OS → fill §1–4~~ **Done**  
2. ~~Implement slice against mock~~ **Done** (`src/`, tests green)  
3. Wire read-only `getCurrentState` / `getRun` to control-api (LIMITED) — **only via new Umer adapter implementing the contract**  
4. Only then consider Live `plan`/`intake` under Approve + Shadow eval green.

---

## Appendix A — Classified audit findings

Local tree: `C:\laragon\www\umer-ai-os` (2026-09-12).

| Area | Finding | Bucket | JARVIS implication |
| --- | --- | --- | --- |
| Architecture | pnpm/turbo monorepo; apps + packages; Architecture V1 frozen | 1 | Adapter to HTTP/NATS; match TS/Node stack |
| Domains | Company loop Market→…→Learning; Work Graph delivery DAG | 1 | Domain keys for trust defaults from OS departments/specialists |
| Agent Runtime | `packages/agent-runtime` — `AgentRuntime.execute`, live-verified | 1 | Exec target; never fork |
| Agents | Registry + `GET /v1/agents`, `/v1/agent-runs` | 1 / 2 | Read model durability caveat |
| Workflows | Work Graph + Work Packages via orchestration-worker | 1 | `startRun` ≈ plan Ready packages |
| Tasks | `GET /v1/tasks`; CEO Create/Assign commands | 1 | Correlate to JARVIS Task |
| Missions | No Mission entity | 4 (naming) | Map to Work Project / WP |
| Events / queues | NATS JetStream Message Fabric | 1 | Reuse; poll fallback OK |
| Decisions | Gates + requirement decide + web decision-center | 1 / 2 | Don’t duplicate Decision Engine inside OS |
| CEO Attention | Web derive `/attention`; **`/v1/ceo/attention` missing** | 2 / 4 | Derive or fix OS route |
| Opportunities | MySQL + routes + commercial | 1 | Later GE inputs |
| Evidence / artifacts | `@umer/artifacts`, `.umer/`, `GET /v1/artifacts` | 1 | Blob host |
| Schema | Hand MySQL migrations in `packages/db` | 1 | JARVIS sidecar store preferred |
| APIs | control-api path router in `server.ts` | 1 | §11 concrete |
| Dashboard | `apps/web` Command Center | 1 human | Phase 9 frontend |
| Integrations | Laragon `projects/catalog.json` | 1 | Computer/project scope later |
| LLM / LM Studio | `@umer/model-routing`; `127.0.0.1:1234` qwen3-8b | 1 | One backend under policy |
| Trust | `@umer/trust` + grants migration | 2 | Align personal trust graph |
| OS Jarvis chat | jarvis-api/core/tools/memory | 2 | Peer, not Goal Engine |
| Config / auth / logging / tests | zod env; OIDC/static; vitest e2e live | 1 | Operational constraints |
| Simulate / cancel HTTP | Missing / incomplete | 4 | Shadow mock; best-effort cancel |
| event-bus package | QA shim | 3 | Ignore |
| Voice | jarvis-voice in web | 3 | Non-goal |

---

## Appendix B — Alignment map

| Brief / RFC item | Where addressed |
| --- | --- |
| Goal Engine first slice | §6, §16 |
| Trust ramp + Shadow default | §8 |
| Tool manifests | §9 |
| Evidence chain | §10 |
| GE ↔ Agent Runtime | §4, §11, §16 |
| Computer / Mission Control / Learning | §14 sketch |
| No OS rewrite | §5, §12, §15 |
| Local OS path | Audit status, Appendix A |

---

## Document control

| Field | Value |
| --- | --- |
| Version | **0.2-local-audit** |
| Phase | 0 audit grounded / 1 design ready |
| Repo home | `jarvis-ai` |
| OS tree | `C:\laragon\www\umer-ai-os` |
| Related | [improvement-roadmap.md](./improvement-roadmap.md), [audit-findings-index.md](../internal/audit-findings-index.md) |
| Next | Read-only Umer OS Adapter (implements contract only); optional OS PR for `/v1/ceo/attention` + simulate |
