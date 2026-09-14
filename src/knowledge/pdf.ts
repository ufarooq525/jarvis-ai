import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { assertNoSecrets } from "../world-model/secrets.js";

export const PDF_MAX_BYTES = 8 * 1024 * 1024;

export interface PdfExtractResult {
  text: string;
  source: string;
  bytes: number;
  simulated: boolean;
}

export type PdfBytesLoader = (spec: { path?: string; url?: string }) => Promise<{
  bytes: Uint8Array;
  source: string;
}>;

export type PdfTextExtractor = (bytes: Uint8Array) => string;

/** Minimal uncompressed PDF text extractor. Fail closed when nothing extractable. */
export function extractPdfTextNaive(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const chunks: string[] = [];
  const tj = /\(([^\\()]*(?:\\.[^\\()]*)*)\)\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = tj.exec(raw))) {
    chunks.push(unescapePdfString(m[1] ?? ""));
  }
  const tjArray = /\[(.*?)\]\s*TJ/gs;
  while ((m = tjArray.exec(raw))) {
    const inner = m[1] ?? "";
    const parts = inner.match(/\(([^\\()]*(?:\\.[^\\()]*)*)\)/g) ?? [];
    for (const p of parts) {
      chunks.push(unescapePdfString(p.slice(1, -1)));
    }
  }
  return chunks.join(" ").replace(/\s+/g, " ").trim();
}

function unescapePdfString(s: string): string {
  return s
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\\(/g, "(")
    .replace(/\\\)/g, ")")
    .replace(/\\\\/g, "\\");
}

export async function defaultPdfLoader(spec: {
  path?: string;
  url?: string;
}): Promise<{ bytes: Uint8Array; source: string }> {
  if (spec.path?.trim()) {
    const p = spec.path.trim();
    if (p.includes("\0")) throw new Error("Invalid PDF path");
    const abs = isAbsolute(p) ? p : resolve(p);
    const buf = await readFile(abs);
    if (buf.byteLength > PDF_MAX_BYTES) {
      throw new Error(`PDF exceeds ${PDF_MAX_BYTES} byte limit`);
    }
    return { bytes: buf, source: `file:${abs}` };
  }
  if (spec.url?.trim()) {
    const url = spec.url.trim();
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("PDF URL must be http(s)");
    }
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`PDF fetch HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > PDF_MAX_BYTES) {
        throw new Error(`PDF exceeds ${PDF_MAX_BYTES} byte limit`);
      }
      return { bytes: buf, source: url };
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error("knowledge.pdf.read requires path or url");
}

export async function readPdf(input: {
  path?: string;
  url?: string;
  loader?: PdfBytesLoader;
  extractor?: PdfTextExtractor;
}): Promise<PdfExtractResult> {
  const loader = input.loader ?? defaultPdfLoader;
  const extractor = input.extractor ?? extractPdfTextNaive;
  const { bytes, source } = await loader({ path: input.path, url: input.url });
  const text = extractor(bytes);
  if (!text) {
    throw new Error("No extractable text in PDF (encrypted or compressed streams unsupported)");
  }
  assertNoSecrets(text);
  return { text, source, bytes: bytes.byteLength, simulated: false };
}

/** Split extract into short observation claims (not conclusions). */
export function pdfTextToClaims(text: string, max = 8): string[] {
  const sentences = text
    .split(/(?<=[.?!])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
  const picked = (sentences.length ? sentences : [text]).slice(0, max);
  return picked.map((s) => s.slice(0, 400));
}
