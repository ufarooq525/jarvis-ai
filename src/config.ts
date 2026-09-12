/** Process env for JARVIS adapters (Phase D). */

export type AdapterKind = "mock" | "umer-read";

export function resolveAdapterKind(raw = process.env.JARVIS_ADAPTER): AdapterKind {
  const v = (raw ?? "mock").trim().toLowerCase();
  if (v === "umer-read" || v === "umer" || v === "umer_os" || v === "umer-os") {
    return "umer-read";
  }
  return "mock";
}

export function resolveControlApiBase(
  raw = process.env.CONTROL_API_BASE,
): string {
  return (raw ?? "http://127.0.0.1:4000").replace(/\/$/, "");
}
