const API_BASE = import.meta.env.VITE_JARVIS_API_URL ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export interface GoalSummary {
  id: string;
  title: string;
  outcome: string;
  domain: string;
  status: string;
  mode: string;
  trust_tier: string;
  updated_at: string;
}

export interface EvidenceNode {
  id: string;
  kind: string;
  payload_summary: string;
  at: string;
  prev_id?: string;
  run_id?: string;
  task_id?: string;
  action_id?: string;
  simulated?: boolean;
  correlation?: {
    decision_id?: string;
    policy_verdict_id?: string;
    os_run_id?: string;
    tool_id?: string;
    jarvis_task_id?: string;
  };
}

export interface RunRow {
  id: string;
  status: string;
  mode: string;
  os_run_id?: string;
  tool_invocations: string[];
  decision_id: string;
  policy_verdict_id: string;
  delegation_chain: string[];
}

export interface TaskRow {
  id: string;
  title: string;
  status: string;
  tool_ids: string[];
  intent: string;
}

export interface GoalDetailResponse {
  adapter: string;
  mode: string;
  trust_tier: string;
  goal: {
    id: string;
    title: string;
    outcome: string;
    domain: string;
    status: string;
    mode: string;
    trust_tier: string;
    updated_at?: string;
    key_results: { id: string; label: string; current?: number | string; target: number | string }[];
  };
  objectives: { id: string; title: string; success_criteria: string }[];
  tasks: TaskRow[];
  runs: RunRow[];
}

export function getHealth() {
  return request<{
    ok: boolean;
    adapter: string;
    phase: string;
    kill_switch?: { engaged: boolean; reason: string | null };
    control_api?: string | null;
    project_id?: string | null;
    observation_only?: boolean;
  }>("/health");
}

export function listGoals() {
  return request<{ adapter: string; goals: GoalSummary[] }>("/v1/goals");
}

export function runShadowLoop(body: { title: string; outcome: string; domain: string }) {
  return request<{
    adapter: string;
    message: string;
    decision_outcome: string;
    decision_id: string;
    goal: {
      id: string;
      title: string;
      outcome: string;
      domain: string;
      status: string;
      mode: string;
      trust_tier: string;
      updated_at: string;
    };
    runs: RunRow[];
    detail: GoalDetailResponse | null;
    evidence: EvidenceNode[];
  }>("/v1/goals/shadow-loop", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getGoal(id: string) {
  return request<GoalDetailResponse>(`/v1/goals/${id}`);
}

export function getEvidence(id: string) {
  return request<{ adapter: string; evidence: EvidenceNode[]; evidence_json: string }>(
    `/v1/goals/${id}/evidence`,
  );
}

export interface DecisionRecordDto {
  id: string;
  goal_id?: string;
  decision: string;
  why: string;
  alternatives: string[];
  evidence_head: string;
  expected?: string;
  actual?: string;
  assumptions?: string[];
  confidence: number;
  verification_passed?: boolean;
  outcome: string;
}

export interface ReplayResponse {
  adapter: string;
  decision: DecisionRecordDto;
  goal: GoalSummary | null;
  evidence: EvidenceNode[];
  runs: RunRow[];
  replay_json: string;
}

export function listJournal(goalId?: string) {
  const q = goalId ? `?goal_id=${encodeURIComponent(goalId)}` : "";
  return request<{ adapter: string; journal: DecisionRecordDto[] }>(`/v1/journal${q}`);
}

export function getReplay(decisionId: string) {
  return request<ReplayResponse>(`/v1/replay/${decisionId}`);
}

export interface ToolManifestDto {
  tool_id: string;
  version: string;
  adapter: string;
  display_name: string;
  effects: string[];
  resources: string[];
  blast_radius: string;
  idempotent: boolean;
  dry_run_supported: boolean;
  required_autonomy: number;
  required_trust_tier: string;
  side_channels: string[];
}

export interface EscalationDto {
  id: string;
  goal_id: string;
  run_id?: string;
  tool_id: string;
  verdict_id: string;
  verdict_class: string;
  reason: string;
  status: string;
  created_at: string;
  expires_at: string;
  resolved_at?: string;
  title?: string;
}

export function listTools() {
  return request<{ adapter: string; tools: ToolManifestDto[] }>("/v1/tools");
}

export function getTrustStatus() {
  return request<{
    principals: { id: string; role: string }[];
    domain_tiers: Record<string, string>;
    kill_switch: { engaged: boolean; reason: string | null };
    autonomy_defaults: Record<string, number>;
    note: string;
  }>("/v1/trust/status");
}

export function setKillSwitch(action: "engage" | "clear", reason?: string) {
  return request<{ kill_switch: { engaged: boolean; reason: string | null } }>(
    "/v1/trust/kill-switch",
    {
      method: "POST",
      body: JSON.stringify({ action, reason }),
    },
  );
}

export function listEscalations(status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : "";
  return request<{ escalations: EscalationDto[] }>(`/v1/escalations${q}`);
}

export function createEscalationDemo(body?: { title?: string; outcome?: string }) {
  return request<{
    message: string;
    escalation: EscalationDto | null;
    verdict: { id: string; class: string; reason: string };
  }>("/v1/escalations/demo", {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function resolveEscalation(id: string, decision: "approve" | "reject") {
  return request<{ escalation: EscalationDto; note: string }>(`/v1/escalations/${id}/resolve`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export interface OsSnapshotDto {
  adapter: string;
  control_api: string | null;
  project_id?: string | null;
  observation_only: boolean;
  reachable: boolean;
  error?: string;
  state?: {
    at: string;
    active_run_ids: string[];
    pending_gate_count: number;
    overlapping_summaries: string[];
    raw_summary: string;
  };
  capabilities?: { tool_id: string; display_name: string; specialist_id?: string }[];
}

export interface OsProjectOption {
  project_id: string;
  name: string;
  status: string;
  source: "work-projects" | "catalog";
  use_for_live: boolean;
  registry_project_id?: string;
  on_disk?: boolean;
  note?: string;
}

export function getOsSnapshot() {
  return request<OsSnapshotDto>("/v1/os/snapshot").catch(async (err) => {
    // 503 still returns a useful body — re-fetch raw for Settings panel
    const res = await fetch(`${API_BASE}/v1/os/snapshot`);
    const data = (await res.json().catch(() => null)) as OsSnapshotDto | null;
    if (data && data.reachable === false) return data;
    throw err;
  });
}

export function getConnection() {
  return request<{
    adapter: string;
    control_api: string | null;
    control_api_base: string;
    project_id: string | null;
  }>("/v1/connection");
}

export function listOsProjects() {
  return request<{
    control_api: string;
    selected_project_id: string | null;
    work_projects: OsProjectOption[];
    catalog_projects: OsProjectOption[];
    hint: string;
    error?: string;
  }>("/v1/os/projects");
}

export function setAdapter(
  adapter: "mock" | "umer-read",
  opts?: { control_api_base?: string; project_id?: string },
) {
  return request<{
    adapter: string;
    control_api: string | null;
    project_id: string | null;
    observation_only: boolean;
    note: string;
  }>("/v1/adapter", {
    method: "POST",
    body: JSON.stringify({
      adapter,
      control_api_base: opts?.control_api_base,
      project_id: opts?.project_id,
    }),
  });
}

export function setConnection(body: {
  adapter?: "mock" | "umer-read";
  control_api_base?: string;
  project_id?: string;
}) {
  return request<{
    adapter: string;
    control_api: string | null;
    project_id: string | null;
    observation_only: boolean;
    note: string;
  }>("/v1/adapter", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function promoteLive(
  goalId: string,
  body: { confirm: string; project_id?: string; approver?: string },
) {
  return request<{
    adapter: string;
    goal: GoalSummary & { trust_tier: string };
    run: RunRow;
    os_run_id?: string;
    message: string;
    decision_id: string;
  }>(`/v1/goals/${goalId}/promote-live`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getLiveStatus(goalId: string) {
  return request<{
    adapter: string;
    goal_id: string;
    goal_mode: string;
    trust_tier: string;
    run: RunRow | null;
    os_run: { os_run_id: string; status: string; summary: string } | null;
    error?: string;
  }>(`/v1/goals/${goalId}/live-status`);
}

export interface WmEntityDto {
  entity_id: string;
  type: string;
  version: number;
  title: string;
  summary: string;
  confidence: number;
  provenance: string;
  trust: string;
  last_verified_at: string;
  refs?: Record<string, string>;
}

export interface WmNowDto {
  at: string;
  active_goal: WmEntityDto | null;
  open_approvals: WmEntityDto[];
  os_run_count: number;
  pending_gates: number;
  adapter: string;
  stm: {
    active_goal_id: string | null;
    open_approval_ids: string[];
    os_run_count: number;
  };
  memory?: { active_facts: number; stale_facts: number };
  os_reachable?: boolean;
}

export function getWmNow() {
  return request<WmNowDto>("/v1/wm/now");
}

export function listWmEntities(q?: string, types?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (types) params.set("types", types);
  const qs = params.toString();
  return request<{ adapter: string; entities: WmEntityDto[]; quarantine: unknown[] }>(
    `/v1/wm/entities${qs ? `?${qs}` : ""}`,
  );
}

export interface WmFactDto {
  id: string;
  claim: string;
  kind: string;
  status: string;
  confidence: number;
  source: string;
  source_url?: string;
  fetched_at?: string;
  verified_at: string;
  goal_id?: string;
}

export function listWmFacts(opts?: { goal_id?: string; q?: string; status?: string }) {
  const params = new URLSearchParams();
  if (opts?.goal_id) params.set("goal_id", opts.goal_id);
  if (opts?.q) params.set("q", opts.q);
  if (opts?.status) params.set("status", opts.status);
  const qs = params.toString();
  return request<{ facts: WmFactDto[]; counts: { active: number; stale: number; invalidated: number } }>(
    `/v1/wm/facts${qs ? `?${qs}` : ""}`,
  );
}

export function postWmFact(body: {
  claim: string;
  kind?: string;
  confidence?: number;
  source?: string;
  source_url?: string;
  goal_id?: string;
}) {
  return request<{ fact: WmFactDto }>("/v1/wm/facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function invalidateWmFact(id: string, reason?: string) {
  return request<{ fact: WmFactDto }>(`/v1/wm/facts/${id}/invalidate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function reverifyWmFact(id: string) {
  return request<{ fact: WmFactDto }>(`/v1/wm/facts/${id}/reverify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export interface PortfolioDto {
  adapter: string;
  at: string;
  domains: Array<{
    domain: string;
    trust_tier: string;
    goal_count: number;
    active: number;
    shadow: number;
    live: number;
    kr: { total: number; met: number; miss: number };
    promotion_candidate: boolean;
  }>;
  escalations: {
    pending: number;
    breached: number;
    avg_age_ms: number | null;
    soonest_expires_at: string | null;
  };
  journal: {
    decisions: number;
    by_outcome: Record<string, number>;
    avg_confidence: number | null;
  };
  evidence: { goals_with_chain: number; nodes: number };
  os: { reachable: boolean; run_count: number; pending_gates: number };
}

export function getPortfolio(domain?: string) {
  const q = domain ? `?domain=${encodeURIComponent(domain)}` : "";
  return request<PortfolioDto>(`/v1/portfolio${q}`);
}

export interface ComputerSnapshotDto {
  at: string;
  plane: "observe" | "shadow";
  act_enabled: false;
  live_open_enabled?: boolean;
  host: { hostname: string; platform: string; arch: string; release: string };
  resources: {
    cpu_count: number;
    freemem_mb: number;
    totalmem_mb: number;
    uptime_hours: number;
  };
  process: { node: string; pid: number; cwd_preview: string };
  capabilities?: {
    observe: true;
    locate: true;
    shadow_open: true;
    click: false;
    type: false;
    scroll: false;
    focus_window: false;
    live_open: boolean;
  };
  note: string;
}

export interface ComputerLocateDto {
  target_id: string;
  found: boolean;
  resolved_command?: string;
  method: string;
  detail: string;
}

export interface ComputerTargetDto {
  id: string;
  display_name: string;
  aliases: string[];
  locate: ComputerLocateDto;
}

export interface ComputerShadowOpenDto {
  target_id: string;
  locate: ComputerLocateDto;
  action: {
    id: string;
    action: string;
    mode: "shadow" | "live";
    simulated: boolean;
    simulated_notice: string;
    ok: boolean;
    summary: string;
    verification?: {
      passed: boolean;
      checks: Array<{ id: string; ok: boolean; detail: string }>;
      summary: string;
    };
  };
  message: string;
  simulated: true;
  simulated_notice: string;
}

export interface ComputerLiveOpenDto {
  target_id: string;
  locate: ComputerLocateDto;
  action: {
    id: string;
    action: string;
    mode: "shadow" | "live";
    simulated: boolean;
    simulated_notice: string;
    ok: boolean;
    summary: string;
    verification?: {
      passed: boolean;
      checks: Array<{ id: string; ok: boolean; detail: string }>;
      summary: string;
    };
  };
  message: string;
  simulated: false;
  live_notice: string;
  pid?: number;
  goal_id?: string;
}

export interface ComputerLiveOpenNeedConfirmDto {
  need_confirm: true;
  confirm_token: "OPEN";
  target_id: string;
  locate: ComputerLocateDto;
  message: string;
  error?: string;
}

export function getComputerSnapshot() {
  return request<ComputerSnapshotDto>("/v1/computer/snapshot");
}

export function getComputerTargets() {
  return request<{ targets: ComputerTargetDto[]; note: string }>("/v1/computer/targets");
}

export function postComputerShadowOpen(body: { target: string; goal_id?: string }) {
  return request<ComputerShadowOpenDto>("/v1/computer/shadow-open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function postComputerLiveOpen(body: {
  target: string;
  confirm?: string;
  goal_id?: string;
}): Promise<ComputerLiveOpenDto | ComputerLiveOpenNeedConfirmDto> {
  const res = await fetch(`${API_BASE}/v1/computer/live-open`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as
    | ComputerLiveOpenDto
    | ComputerLiveOpenNeedConfirmDto
    | { error?: string };
  if (res.status === 428 && data && "need_confirm" in data && data.need_confirm) {
    return data;
  }
  if (!res.ok) {
    throw new Error(("error" in data && data.error) || `Request failed (${res.status})`);
  }
  return data as ComputerLiveOpenDto;
}

export interface BrowserSnapshotDto {
  at: string;
  plane: "shadow";
  act_enabled: false;
  fetch_enabled: true;
  capabilities: {
    shadow_research: true;
    click: false;
    type: false;
    publish: false;
  };
  note: string;
}

export interface ResearchFactDto {
  id: string;
  claim: string;
  kind: "fact" | "inference" | "uncertainty";
  source_url: string;
  fetched_at: string;
  confidence: number;
}

export interface BrowserShadowResearchDto {
  url: string;
  message: string;
  simulated: boolean;
  notice: string;
  duplicates_skipped: number;
  facts: ResearchFactDto[];
  action: {
    ok: boolean;
    summary: string;
    fetch?: { visited: boolean; title?: string; error?: string; fetched_at: string };
    verification?: { passed: boolean; summary: string };
  };
}

export function getBrowserSnapshot() {
  return request<BrowserSnapshotDto>("/v1/browser/snapshot");
}

export function getBrowserAllowlist() {
  return request<{ allowlist: Array<{ host: string; note: string }>; note: string }>(
    "/v1/browser/allowlist",
  );
}

export function postBrowserShadowResearch(body: {
  url: string;
  goal_id?: string;
  simulate_only?: boolean;
}) {
  return request<BrowserShadowResearchDto>("/v1/browser/shadow-research", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface SkillDto {
  id: string;
  name: string;
  version: string;
  status: string;
  trust_tier: string;
  summary: string;
  procedure: Array<{ order: number; instruction: string }>;
  constraints: string[];
  practice?: { ok: boolean; summary: string; simulated: true };
  provenance: { source: string; fact_ids: string[]; source_urls: string[] };
}

export function listSkills(opts?: { status?: string; q?: string }) {
  const params = new URLSearchParams();
  if (opts?.status) params.set("status", opts.status);
  if (opts?.q) params.set("q", opts.q);
  const qs = params.toString();
  return request<{ skills: SkillDto[] }>(`/v1/skills${qs ? `?${qs}` : ""}`);
}

export function ingestSkillText(body: { text: string; title?: string; source?: string }) {
  return request<{ skill: SkillDto; message: string }>("/v1/skills/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function ingestSkillFromFacts(body: { fact_ids: string[]; title?: string }) {
  return request<{ skill: SkillDto; message: string }>("/v1/skills/from-facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function practiceSkill(id: string) {
  return request<{ skill: SkillDto; simulated: true }>(`/v1/skills/${id}/practice`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function verifySkill(id: string) {
  return request<{ skill: SkillDto; note: string }>(`/v1/skills/${id}/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function retireSkill(id: string, reason?: string) {
  return request<{ skill: SkillDto }>(`/v1/skills/${id}/retire`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export interface OpportunityDto {
  id: string;
  title: string;
  company?: string;
  channel: string;
  status: string;
  summary: string;
  problems: string[];
  score?: { overall: number; fit: number; urgency: number; value: number; rationale: string };
  draft?: { subject: string; body: string; simulated: true; notice: string };
}

export function listOpportunities() {
  return request<{ opportunities: OpportunityDto[] }>("/v1/ops/opportunities");
}

export function createOpportunity(body: {
  title: string;
  company?: string;
  channel?: string;
  summary?: string;
}) {
  return request<{ opportunity: OpportunityDto }>("/v1/ops/opportunities", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createOpportunityFromFacts(body: { fact_ids: string[]; title?: string }) {
  return request<{ opportunity: OpportunityDto }>("/v1/ops/opportunities/from-facts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function qualifyOpportunity(id: string) {
  return request<{ opportunity: OpportunityDto }>(`/v1/ops/opportunities/${id}/qualify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });
}

export function draftOpportunity(id: string) {
  return request<{ opportunity: OpportunityDto; notice?: string }>(
    `/v1/ops/opportunities/${id}/draft`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

export function requestOpportunityApproval(id: string) {
  return request<{ opportunity: OpportunityDto }>(
    `/v1/ops/opportunities/${id}/request-approval`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    },
  );
}

export interface ModelCompleteDto {
  ok: boolean;
  text: string;
  simulated: boolean;
  notice: string;
  error?: string;
  provenance: {
    provider: string;
    model: string;
    role: string;
    attempted: string[];
    latency_ms: number;
  };
}

export function getModelRoles() {
  return request<{ roles: Array<{ role: string; backends: unknown[] }> }>("/v1/models/roles");
}

export function getModelHealth() {
  return request<{
    health: Array<{ provider: string; reachable: boolean; base_url: string; models: string[] }>;
  }>("/v1/models/health");
}

export function postModelComplete(body: { role: string; prompt: string }) {
  return request<ModelCompleteDto>("/v1/models/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
