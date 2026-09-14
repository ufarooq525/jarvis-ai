import { describe, expect, it } from "vitest";
import { extractPdfTextNaive, pdfTextToClaims, readPdf } from "./pdf.js";

function minimalPdf(text: string): Buffer {
  const stream = `BT /F1 12 Tf 100 700 Td (${text}) Tj ET`;
  const body = `%PDF-1.1
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R >> endobj
4 0 obj << /Length ${stream.length} >>
stream
${stream}
endstream
endobj
trailer << /Root 1 0 R >>
%%EOF
`;
  return Buffer.from(body, "latin1");
}

describe("knowledge.pdf.read extractors", () => {
  it("extracts parenthetical Tj text from a simple PDF", () => {
    const text = extractPdfTextNaive(minimalPdf("Hello from Jarvis PDF"));
    expect(text).toContain("Hello from Jarvis PDF");
  });

  it("turns extract into observation-sized claims", () => {
    const claims = pdfTextToClaims(
      "This is a sufficiently long first sentence. This is a second important observation for memory.",
    );
    expect(claims.length).toBeGreaterThanOrEqual(2);
  });

  it("readPdf uses injected loader/extractor", async () => {
    const result = await readPdf({
      path: "unused.pdf",
      loader: async () => ({ bytes: new Uint8Array([0]), source: "file:unused.pdf" }),
      extractor: () => "Injected extract about a local PDF document for tests.",
    });
    expect(result.text).toContain("Injected extract");
    expect(result.source).toContain("unused.pdf");
  });
});
