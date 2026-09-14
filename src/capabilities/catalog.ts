import { PHASE1_MANIFESTS, ToolRegistry } from "../tools/registry.js";
import { capabilityFromManifest, type Capability } from "./types.js";

const DEFAULT_CAPS: Capability[] = PHASE1_MANIFESTS.map(capabilityFromManifest);

/** Capability catalog — view over existing tool manifests. No parallel registry. */
export class CapabilityCatalog {
  private readonly byId = new Map<string, Capability>();

  constructor(capabilities: Capability[] = DEFAULT_CAPS) {
    for (const c of capabilities) this.byId.set(c.id, c);
  }

  static fromRegistry(registry: ToolRegistry): CapabilityCatalog {
    return new CapabilityCatalog(registry.list().map(capabilityFromManifest));
  }

  get(id: string): Capability | undefined {
    return this.byId.get(id);
  }

  require(id: string): Capability {
    const c = this.byId.get(id);
    if (!c) throw new Error(`Capability not registered: ${id}`);
    return c;
  }

  list(): Capability[] {
    return [...this.byId.values()];
  }

  listByRuntime(runtime: Capability["runtime"]): Capability[] {
    return this.list().filter((c) => c.runtime === runtime);
  }
}

let singleton: CapabilityCatalog | null = null;

export function getCapabilityCatalog(): CapabilityCatalog {
  if (!singleton) singleton = new CapabilityCatalog();
  return singleton;
}
