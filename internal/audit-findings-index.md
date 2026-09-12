---
cursor:
  subagentId: "bc-9d76cdfc-b36b-5505-b5c8-1ca013692148"
---

# Audit findings index (machine)

Status: **GROUNDED** — local OS tree audited 2026-09-12.

## Access

| Source | Result |
| --- | --- |
| GitHub `ufarooq525/umer-ai-os` | Still private/404 without token |
| **Local path** | **`C:\laragon\www\umer-ai-os`** — readable; used for §§1–4 |

## Inventory hits (real)

| Seed | Hits |
| --- | --- |
| Agent Runtime | `packages/agent-runtime` — `AgentRuntime`, `createAgentWorker`, `subscribeAgentRunReadModel` |
| Orchestrator / worker | `apps/orchestration-worker`, `apps/agent-worker`, `packages/orchestration` |
| Queue / bus | `packages/message-fabric` — NATS JetStream; subjects `cmd.agent.dispatch`, `evt.runtime` |
| Tasks / work | `GET /v1/tasks`, work-packages, work-graph plan |
| Opportunity | `packages/opportunity-intelligence`, `GET /v1/opportunities` |
| Attention | Web `/attention` derive; **`GET /v1/ceo/attention` MISSING** (called by jarvis-tools) |
| Evidence / artifacts | `packages/artifacts`, `GET /v1/artifacts`, `.umer/` |
| Gates | `GET /v1/gates/pending`, review, resolve |
| LLM / LM Studio | `packages/model-routing`; default `http://127.0.0.1:1234/v1` |
| Trust | `packages/trust`, `trust-grants-migration` |
| Schema | `packages/db` hand MySQL migrations (`ALL_MYSQL_MIGRATIONS`) |
| APIs | `apps/control-api/src/server.ts` path router |
| Dashboard | `apps/web` command-center, gates, company graph |
| OS Jarvis | `apps/jarvis-api`, `packages/jarvis-core|tools|memory` — chat peer, not personal Goal Engine |
| Experimental | `packages/event-bus` (QA shim); `apps/web/.../jarvis-voice` |

## Gaps for OsRuntimeAdapter

- No dedicated simulate/dry-run HTTP (plan dispatches).
- No dedicated cancel→AbortSignal HTTP (CEO `CancelWork` best-effort).
- `/v1/ceo/attention` referenced but unimplemented.
- Agent-run read model often in-memory — restart durability caveat.

## Report

User-facing: [docs/jarvis-integration-architecture-report.md](../docs/jarvis-integration-architecture-report.md) v0.2-local-audit
