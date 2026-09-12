import type { ToolManifest } from "../types/model.js";

export const PHASE1_MANIFESTS: ToolManifest[] = [
  {
    tool_id: "os.runtime.get_state",
    version: "1.0.0",
    adapter: "umer_os",
    display_name: "OS current state",
    effects: ["read"],
    resources: ["control-api:state"],
    blast_radius: "local",
    idempotent: true,
    dry_run_supported: true,
    required_autonomy: 0,
    required_trust_tier: "SHADOW",
    side_channels: [],
  },
  {
    tool_id: "os.runtime.start_run",
    version: "1.0.0",
    adapter: "umer_os",
    display_name: "OS start run",
    effects: ["write", "external"],
    resources: ["control-api:plan", "nats:cmd.agent.dispatch"],
    blast_radius: "account",
    idempotent: false,
    dry_run_supported: true,
    required_autonomy: 1,
    required_trust_tier: "LIMITED",
    side_channels: ["network"],
  },
  {
    tool_id: "os.runtime.get_run",
    version: "1.0.0",
    adapter: "umer_os",
    display_name: "OS get run",
    effects: ["read"],
    resources: ["control-api:agent-runs"],
    blast_radius: "local",
    idempotent: true,
    dry_run_supported: true,
    required_autonomy: 0,
    required_trust_tier: "SHADOW",
    side_channels: [],
  },
  {
    tool_id: "jarvis.goal.create",
    version: "1.0.0",
    adapter: "jarvis_internal",
    display_name: "Create goal",
    effects: ["write"],
    resources: ["jarvis:goal-store"],
    blast_radius: "local",
    idempotent: false,
    dry_run_supported: true,
    required_autonomy: 0,
    required_trust_tier: "SHADOW",
    side_channels: [],
  },
  {
    tool_id: "jarvis.journal.append",
    version: "1.0.0",
    adapter: "jarvis_internal",
    display_name: "Append decision journal",
    effects: ["write"],
    resources: ["jarvis:journal"],
    blast_radius: "local",
    idempotent: false,
    dry_run_supported: true,
    required_autonomy: 0,
    required_trust_tier: "SHADOW",
    side_channels: [],
  },
];

export class ToolRegistry {
  private readonly byId = new Map<string, ToolManifest>();

  constructor(manifests: ToolManifest[] = PHASE1_MANIFESTS) {
    for (const m of manifests) this.byId.set(m.tool_id, m);
  }

  get(tool_id: string): ToolManifest | undefined {
    return this.byId.get(tool_id);
  }

  require(tool_id: string): ToolManifest {
    const m = this.byId.get(tool_id);
    if (!m) throw new Error(`Tool not registered: ${tool_id}`);
    return m;
  }

  list(): ToolManifest[] {
    return [...this.byId.values()];
  }
}
