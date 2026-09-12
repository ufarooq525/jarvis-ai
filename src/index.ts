export type { OsRuntimeAdapter } from "./contracts/index.js";
export { GoalEngine } from "./goal-engine/engine.js";
export { MockOsRuntimeAdapter } from "./adapters/mock/mock-os-runtime-adapter.js";
export { engageKillSwitch, clearKillSwitch, isKillSwitchEngaged } from "./kill-switch.js";
export { getEscalationStore, resetEscalationStore } from "./escalation/store.js";
export { createLiveApprovalDemo } from "./escalation/demo-live.js";
export { killSwitchStatus, setKillSwitch } from "./trust/kill-switch-control.js";

