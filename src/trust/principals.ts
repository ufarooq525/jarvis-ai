export const HUMAN_PRINCIPAL = "Human(Umer)";
export const JARVIS_PRINCIPAL = "JARVIS";

export interface DelegationEdge {
  from: string;
  to: string;
  grant_id: string;
  scope: string[];
}

/** Human → JARVIS → (optional leaf). No elevation of grants. */
export function buildDelegationChain(leaf?: string): string[] {
  const chain = [HUMAN_PRINCIPAL, JARVIS_PRINCIPAL];
  if (leaf) chain.push(leaf);
  return chain;
}

export function defaultDomainTrustTier(): "SHADOW" {
  return "SHADOW";
}
