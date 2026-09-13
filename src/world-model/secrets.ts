/**
 * Cheap secret/PII deny patterns — fail closed before durable WM writes.
 * Not a full DLP scanner; blocks common credential shapes.
 */
const SECRET_PATTERNS: Array<{ id: string; re: RegExp }> = [
  { id: "aws_key", re: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "private_key", re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { id: "generic_api_key", re: /\b(?:api[_-]?key|secret|password|token)\s*[:=]\s*['\"]?[A-Za-z0-9_\-]{16,}/i },
  { id: "bearer", re: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/i },
  { id: "connection_string", re: /\b(?:postgres|mysql|mongodb):\/\/[^\s]+/i },
];

export function detectSecrets(text: string): { blocked: boolean; reasons: string[] } {
  const reasons: string[] = [];
  for (const p of SECRET_PATTERNS) {
    if (p.re.test(text)) reasons.push(p.id);
  }
  return { blocked: reasons.length > 0, reasons };
}

export function assertNoSecrets(text: string, label = "claim"): void {
  const hit = detectSecrets(text);
  if (hit.blocked) {
    throw new Error(`Refused to store ${label} — possible secret (${hit.reasons.join(",")})`);
  }
}
