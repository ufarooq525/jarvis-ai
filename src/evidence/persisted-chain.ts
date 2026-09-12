import type { EvidenceNode } from "../types/model.js";
import type { JarvisDb } from "../db/client.js";
import { EvidenceChain } from "./chain.js";

/** Write-through evidence chain backed by SQLite. */
export class PersistedEvidenceChain extends EvidenceChain {
  constructor(private readonly db: JarvisDb) {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    const rows = this.db
      .prepare("SELECT json FROM evidence_nodes ORDER BY seq ASC")
      .all() as { json: string }[];
    const nodes = rows.map((row) => JSON.parse(row.json) as EvidenceNode);
    const heads = new Map<string, string>();
    for (const h of this.db.prepare("SELECT goal_id, tip_id FROM evidence_heads").all() as {
      goal_id: string;
      tip_id: string;
    }[]) {
      heads.set(h.goal_id, h.tip_id);
    }
    this.loadSnapshot(nodes, heads);
  }

  override append(
    partial: Omit<EvidenceNode, "id" | "at" | "prev_id"> & { prev_id?: string },
  ): EvidenceNode {
    const node = super.append(partial);
    this.db
      .prepare("INSERT INTO evidence_nodes (id, goal_id, json) VALUES (?, ?, ?)")
      .run(node.id, node.goal_id, JSON.stringify(node));
    this.db
      .prepare(
        `INSERT INTO evidence_heads (goal_id, tip_id) VALUES (?, ?)
         ON CONFLICT(goal_id) DO UPDATE SET tip_id = excluded.tip_id`,
      )
      .run(node.goal_id, node.id);
    return node;
  }
}
