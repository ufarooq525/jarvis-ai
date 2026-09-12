import type { EvidenceNode } from "../types/model.js";
import { newId, nowIso } from "../util/ids.js";

export class EvidenceChain {
  protected readonly nodes: EvidenceNode[] = [];
  protected heads = new Map<string, string>(); // goal_id → tip

  append(
    partial: Omit<EvidenceNode, "id" | "at" | "prev_id"> & { prev_id?: string },
  ): EvidenceNode {
    const prev = partial.prev_id ?? this.heads.get(partial.goal_id);
    const node: EvidenceNode = {
      ...partial,
      id: newId("ev"),
      at: nowIso(),
      prev_id: prev,
    };
    this.nodes.push(node);
    this.heads.set(partial.goal_id, node.id);
    return node;
  }

  head(goal_id: string): string | undefined {
    return this.heads.get(goal_id);
  }

  chainForGoal(goal_id: string): EvidenceNode[] {
    return this.nodes.filter((n) => n.goal_id === goal_id);
  }

  exportJson(goal_id: string): string {
    return JSON.stringify(this.chainForGoal(goal_id), null, 2);
  }

  all(): EvidenceNode[] {
    return [...this.nodes];
  }

  /** Restore from durable storage (order preserved). */
  protected loadSnapshot(nodes: EvidenceNode[], heads: Map<string, string>): void {
    this.nodes.length = 0;
    this.nodes.push(...nodes);
    this.heads = new Map(heads);
  }
}
