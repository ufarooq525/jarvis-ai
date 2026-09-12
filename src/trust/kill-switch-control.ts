import { engageKillSwitch, clearKillSwitch, isKillSwitchEngaged } from "../kill-switch.js";

let lastReason: string | null = null;

export function killSwitchStatus(): { engaged: boolean; reason: string | null } {
  return { engaged: isKillSwitchEngaged(), reason: lastReason };
}

export function setKillSwitch(action: "engage" | "clear", reason?: string) {
  if (action === "engage") {
    const r = reason?.trim() || "manual";
    engageKillSwitch(r);
    lastReason = r;
    return killSwitchStatus();
  }
  clearKillSwitch();
  lastReason = null;
  return killSwitchStatus();
}

export function resetKillSwitchState(): void {
  clearKillSwitch();
  lastReason = null;
}
