import type { DecisionRecord } from "../types/model.js";

export class DecisionJournal {
  protected readonly records: DecisionRecord[] = [];

  append(record: DecisionRecord): DecisionRecord {
    this.records.push(record);
    return record;
  }

  byGoal(goal_id: string): DecisionRecord[] {
    return this.records.filter((r) => r.goal_id === goal_id);
  }

  get(id: string): DecisionRecord | undefined {
    return this.records.find((r) => r.id === id);
  }

  all(): DecisionRecord[] {
    return [...this.records];
  }

  protected loadSnapshot(records: DecisionRecord[]): void {
    this.records.length = 0;
    this.records.push(...records);
  }
}
