# JARVIS AI — Implementation Requirements

## Purpose

This document is the implementation roadmap for turning the current JARVIS foundation into a reliable personal autonomous operator.

JARVIS is the **control plane and personal operator**. Umer AI OS remains the **business/workforce execution system**. JARVIS must operate Umer AI OS through an adapter boundary and must not duplicate its agent runtime, intake, planning, or execution systems.

## Current State

The repository already contains the core Goal Engine, OS runtime contracts/adapters, Shadow Loop tests, policy classification, evidence chains, decision journal, web application, and an initial computer observation layer.

The next objective is not to add random features. The priority is to make one complete, reliable autonomous lifecycle work end-to-end and then progressively give JARVIS real-world capabilities.

## Target Lifecycle

```text
User Outcome
  → Goal Normalization
  → Goal
  → Objectives
  → Plan
  → Tasks
  → Capability Selection
  → Policy / Trust Check
  → Shadow Proposal
  → Approval when required
  → Execution through adapter/tool
  → Observation
  → Evidence
  → Verification
  → Result / Outcome
  → Goal State Update
  → Learning / Memory
  → Replanning when necessary
```

Every consequential action must be attributable to a goal, policy decision, authorization context, tool/capability, action, evidence, and verification result.

---

# Phase 1 — Harden the Core Goal Engine

### Objective
Make the existing Goal Engine reliable enough to serve as JARVIS's central outcome orchestration layer.

### Requirements

- Normalize natural-language outcomes into structured goals.
- Decompose goals into objectives and executable tasks.
- Track goal lifecycle and state transitions explicitly.
- Keep planning, execution, observation, verification, and learning as separate responsibilities.
- Support deterministic correlation IDs for goal, decision, mission/work package, run, action, and evidence.
- Add idempotency/deduplication so repeated requests do not create duplicate work.
- Handle failures, timeouts, retries, cancellation, and partial completion.
- Support replanning after verified failures or changed state.
- Persist important state rather than relying on process memory.
- Add strong unit and integration coverage around lifecycle transitions.

### Acceptance Criteria

A goal such as:

> Find 10 Laravel SaaS opportunities in Saudi Arabia.

must produce a traceable lifecycle containing goal → objectives → tasks → planned actions → Shadow execution → evidence → verification → outcome, without performing real external actions.

---

# Phase 2 — Trust, Policy, Approval & Safety

### Objective
Make autonomy controllable and understandable.

### Trust levels

```text
SHADOW → LIMITED → APPROVED → TRUSTED → AUTONOMOUS
```

New capabilities/domains must default to SHADOW.

### Requirements

- Centralize policy classification.
- Define capability/tool manifests.
- Each manifest must declare:
  - capability name
  - inputs/outputs
  - permissions
  - risk level
  - minimum trust level
  - approval requirement
  - reversibility
  - execution context
  - expected side effects
  - evidence produced
- Make approval decisions explicit and auditable.
- Prevent policy bypasses through alternate code paths.
- Destructive, financial, security-sensitive, publishing, sending, or irreversible actions require appropriate confirmation/trust.
- Read/research/analyze/draft/test operations may become autonomous after verification and trust gates.
- Shadow mode must guarantee that no real external side effect occurs.
- Clearly expose `SIMULATED / No external action was performed` in Shadow results.

### Acceptance Criteria

No tool can execute a consequential action unless its manifest, policy decision, authorization, and trust requirements permit it.

---

# Phase 3 — Evidence, Audit & Decision Journal

### Objective
Make every important JARVIS decision explainable and replayable.

### Evidence record

Every action/result should be able to answer:

```text
What happened?
Why did JARVIS do it?
What evidence existed before the action?
Which tool/capability was used?
What arguments were supplied?
What result was returned?
How was the result verified?
Who/what authorized the action?
What side effects occurred?
```

### Requirements

- Persist evidence chains.
- Link evidence to goal, decision, run, task, and action IDs.
- Persist decision journal entries.
- Record assumptions and confidence where applicable.
- Record verification outcomes.
- Support audit/replay views in the UI.
- Never fabricate evidence or claim an action was performed when it was simulated.

---

# Phase 4 — Complete Umer AI OS Integration

### Objective
Connect JARVIS to the real Umer AI OS without duplicating the OS runtime.

### Architectural rule

JARVIS may depend only on the `OsRuntimeAdapter` contract. Do not couple the Goal Engine directly to Umer AI OS internals.

The adapter should support the conceptual operations:

```text
listCapabilities()
getCurrentState()
proposeRun()
startRun()
getRun()
cancelRun()
subscribe()
```

### Requirements

- Keep Mock OS adapter for Shadow/testing.
- Verify every real Umer AI OS endpoint against the current source before using it.
- Do not assume a real execution endpoint is a simulation endpoint.
- Add correlation between JARVIS run IDs and OS work-package/run IDs.
- Consume OS runtime events where reliable; otherwise use controlled polling.
- Support run status synchronization.
- Support cancellation and timeout handling.
- Detect duplicate dispatch.
- Preserve JARVIS evidence even when the OS reports failure.
- Add integration tests against a local Umer AI OS instance.

### Acceptance Criteria

```text
JARVIS Goal
 → Plan
 → Policy
 → Adapter
 → Umer AI OS
 → Agent Runtime
 → Runtime Events
 → JARVIS Observation
 → Evidence
 → Verification
 → Outcome
```

works end-to-end locally, with no duplicate agent loop created in JARVIS.

---

# Phase 5 — Computer Runtime

### Objective
Give JARVIS controlled ability to operate the local computer.

Computer control must remain a separate capability layer from the Goal Engine.

### Capability progression

```text
Observe
 → Open application
 → Focus window
 → Keyboard input
 → Mouse input
 → Scroll
 → Read screen
 → Identify UI elements
 → Execute action
 → Observe again
 → Verify
```

### Initial applications

- Browser
- Terminal
- VS Code
- File manager
- Standard Windows applications

### Requirements

- Create explicit computer tool manifests.
- Capture before/after observations.
- Verify that intended state changed after every meaningful action.
- Add timeouts and recovery.
- Never blindly click based on stale coordinates.
- Prefer semantic/UI element targeting when available.
- Require approval for sensitive or destructive computer actions.
- Keep a complete action/evidence trace.

### Example

```text
"Open VS Code and inspect the JARVIS project."

Observe → locate VS Code → open → observe → verify
```

---

# Phase 6 — Browser Automation & Web Research

### Objective
Allow JARVIS to perform controlled research and browser workflows.

### Capabilities

- Search
- Navigate
- Read pages
- Extract structured information
- Click
- Type
- Scroll
- Compare sources
- Save evidence
- Detect page changes
- Verify extracted information

### Requirements

- Browser actions must produce evidence.
- Research results must distinguish facts, inference, and uncertainty.
- Store source URLs and timestamps.
- Detect duplicates.
- Avoid claiming a source was visited if it was not.
- Respect website terms, authentication boundaries, rate limits, and applicable policies.
- Publishing, messaging, purchasing, account changes, or other consequential actions require appropriate approval/trust.

---

# Phase 7 — Memory & World Model

### Objective
Give JARVIS durable context without turning memory into an uncontrolled data dump.

### Memory layers

```text
Short-term / Current State
Long-term Preferences & Knowledge
Episodic History
Semantic Knowledge
Procedural Skills
```

### Requirements

- Store useful facts with provenance.
- Track confidence and freshness where applicable.
- Separate observations from conclusions.
- Support retrieval by goal/task/context.
- Avoid storing secrets or sensitive data unless explicitly required and protected.
- Allow stale knowledge to be invalidated or re-verified.
- Maintain relationships between people, companies, projects, tools, goals, skills, and outcomes.

---

# Phase 8 — Learning & Skill Acquisition

### Objective
Allow JARVIS to learn new capabilities and prove that it learned them.

### Pipeline

```text
Information
 → Extraction
 → Understanding
 → Structured Knowledge
 → Candidate Skill
 → Practice
 → Implementation
 → Verification
 → Skill Library
```

### Requirements

- Ingest permitted documents, transcripts, tutorials, and courses.
- Extract concepts, procedures, constraints, and examples.
- Convert useful procedures into candidate skills.
- Practice skills in a sandbox where possible.
- Generate tests/evaluations for learned skills.
- Only promote a skill after successful verification.
- Record source/provenance for learned knowledge.
- Allow skill versioning and retirement.

---

# Phase 9 — Personal Business Operator

### Objective
Use JARVIS to operate Umer's business development workflow.

Potential domains:

- Fiverr
- Upwork
- LinkedIn
- Email
- Personal website
- Lead research
- Competitor research
- SEO
- Prospect qualification
- Proposal drafting
- Follow-ups
- Opportunity tracking

### Example outcome

> Get me more Laravel clients.

Possible autonomous workflow:

```text
Research market
 → Find prospects
 → Qualify prospects
 → Research company
 → Identify likely problems
 → Score opportunity
 → Draft personalized approach
 → Request approval when required
 → Send / publish through approved capability
 → Track response
 → Follow up
 → Measure outcome
 → Learn what works
```

Do not automate external communication or account actions before the trust/approval/evidence system is proven.

---

# Phase 10 — Model Router & Local AI

### Objective
Make JARVIS model-agnostic.

### Requirements

- Abstract model providers behind a model interface/router.
- Support LM Studio/local OpenAI-compatible models first.
- Keep reasoning, coding, vision, extraction, and lightweight classification roles separable.
- Allow future models/providers without rewriting the Goal Engine.
- Record model/provider/version used for important decisions.
- Support fallback models and bounded retries.
- Never make model output itself the source of truth for verification.

---

# Phase 11 — JARVIS Command Center UI

### Design direction

**Calm Intelligence** — premium, dark-first, precise, quiet, and operational.

Avoid cyberpunk styling, excessive neon, glassmorphism everywhere, glowing cards, excessive gradients, giant rounded cards, and dashboard clutter.

### Visual system

- Geist Sans for primary UI.
- Geist Mono only for IDs, timestamps, events, JSON, logs, and technical details.
- 4px spacing base unit.
- Standard spacing: 4, 8, 12, 16, 24, 32, 48, 64.
- 12-column desktop grid.
- 8-column tablet grid.
- 4-column mobile grid.
- Desktop content target: approximately 1440–1600px.
- Small radius: 6–8px.
- Card radius: 10–12px.
- Modal radius: 12–16px.
- One restrained accent color.
- Dark charcoal/near-black background with subtle surfaces and low-contrast borders.
- Status must use text + icon, not color alone.

### Information hierarchy

```text
What is JARVIS doing?
 → What matters to me?
 → What needs my decision?
 → What happened?
 → Technical details
```

### Core screens

- Overview / Command Center
- Goals
- Goal Detail
- Activity
- Approvals / Attention
- Missions / Work
- Agents / Runs
- Evidence
- Computer
- Entities / Knowledge
- Skills
- Settings

Technical information should use progressive disclosure rather than overwhelming the primary UI.

### Motion

Use Framer Motion or equivalent for meaningful transitions only:

- state changes
- progress
- panel transitions
- new evidence/activity
- approval emphasis

Do not animate everything.

### Accessibility

- Keyboard navigation.
- Visible focus states.
- WCAG-conscious contrast.
- Never rely on color alone.
- Reduced-motion support.
- Clear loading/error/empty states.

---

# Phase 12 — Reliability, Testing & Local Verification

### Objective
Make the system safe to evolve while it is still under active development.

### Requirements

- Local verification script is the primary verification path for now; CI is optional.
- Unit tests for core policies and state transitions.
- Integration tests for adapters.
- End-to-end tests for the Shadow Loop.
- Contract tests for Umer AI OS integration.
- Failure/retry/cancellation tests.
- Duplicate/idempotency tests.
- Permission and approval bypass tests.
- Evidence integrity tests.
- Computer action verification tests.
- Never use demo seed data as production truth.

---

# Recommended Delivery Order

Do not implement all phases simultaneously.

```text
1. Goal Engine hardening
2. Trust / Policy / Approval
3. Evidence / Audit / Journal
4. Umer AI OS adapter integration
5. Complete Shadow + Live controlled lifecycle
6. Computer Runtime
7. Browser Runtime
8. Memory / World Model
9. Learning / Skills
10. Model Router improvements
11. Business automation
12. Advanced autonomy / self-improvement
```

The first major milestone is **not** "build every feature." It is:

> Make one complete goal run from natural language to verified outcome with a complete audit trail, first in Shadow mode and then through the real Umer AI OS adapter under controlled approval.

---

# Definition of Done for the Foundation

The JARVIS foundation is considered complete when all of the following are true:

- [ ] Natural-language outcome becomes a structured goal.
- [ ] Goal decomposes into objectives and tasks.
- [ ] Capabilities are selected through explicit manifests.
- [ ] Policy/trust is evaluated before execution.
- [ ] Shadow mode is guaranteed side-effect free.
- [ ] Approval is required where policy says it is required.
- [ ] Real Umer AI OS execution occurs only through `OsRuntimeAdapter`.
- [ ] Every execution has stable correlation IDs.
- [ ] Every meaningful action produces evidence.
- [ ] Results are independently verified.
- [ ] Failures and retries are represented correctly.
- [ ] Duplicate goals/runs are detected.
- [ ] Outcomes update goal state.
- [ ] Important decisions are persisted in the journal.
- [ ] UI makes autonomy, state, evidence, and required decisions understandable.
- [ ] Local verification passes.
- [ ] No second agent loop or duplicate OS runtime has been introduced.

# Important Engineering Rules

1. Inspect the existing implementation before creating new abstractions.
2. Reuse existing Umer AI OS capabilities instead of rebuilding them.
3. Do not invent API routes; verify them against source.
4. Keep JARVIS independent from OS internals through adapters.
5. Keep Shadow and Live execution paths clearly separated.
6. Default new capabilities to the lowest trust level.
7. Never claim simulated work was actually performed.
8. Prefer evidence and verification over model confidence.
9. Keep human approval explicit for consequential actions.
10. Implement incrementally and preserve working behavior.
11. Do not perform broad unrelated refactors while implementing a phase.
12. Before marking a requirement complete, add or update tests and local verification.

# Agent Working Protocol

When an implementation agent receives this document:

1. Audit the current repository and identify which requirements are already satisfied.
2. Do not redo completed work.
3. Classify each requirement as `DONE`, `PARTIAL`, `MISSING`, or `BLOCKED`.
4. Select the highest-priority incomplete requirement according to the delivery order.
5. Inspect existing code and tests before modifying anything.
6. Implement the smallest coherent slice.
7. Add tests.
8. Run local verification.
9. Report files changed, behavior added, tests run, and remaining work.
10. Continue to the next requirement only when the current slice is verified.

The agent must preserve the architecture described here and must not create duplicate goal engines, agent runtimes, intake systems, or competing execution loops.
