/** Global Live kill switch — when engaged, no live dispatches. */

let engaged = false;

export function isKillSwitchEngaged(): boolean {
  return engaged;
}

export function engageKillSwitch(reason = "manual"): { engaged: true; reason: string } {
  engaged = true;
  return { engaged: true, reason };
}

export function clearKillSwitch(): void {
  engaged = false;
}
