import { afterEach, describe, expect, it, spyOn } from "bun:test";
import {
  PDFArray,
  PDFDocument,
  PDFRawStream,
  decodePDFRawStream,
  rgb,
} from "pdf-lib";
import {
  calculatePdfPageCounts,
  processPdfModules,
  processPdfModulesPreview,
} from "./converter";
import { estimatePlannerPageCount } from "./handlers/planner-page-count";
import type { PDFModule } from "./types";

describe("calculatePdfPageCounts with stored page counts", () => {
  it("derives counts arithmetically without fetching module PDFs", async () => {
    const period = {
      start: new Date("2026-09-07T00:00:00.000Z"),
      end: new Date("2026-11-27T00:00:00.000Z"),
    };

    // Empty pdfUrl would fall back to a 1-page blank if anything tried to
    // fetch and parse it, so a wrong total exposes accidental downloads.
    const modules: PDFModule[] = [
      { id: "cover", type: "umschlag", idx: 0, pdfUrl: "", pageCount: 4 },
      { id: "notes", type: "notizen", idx: 1, pdfUrl: "", pageCount: 37 },
      { id: "planner", type: "wochenplaner", idx: 2, pdfUrl: "" },
    ];

    const plannerPages = estimatePlannerPageCount({
      periodStart: period.start,
      periodEnd: period.end,
      previewMode: false,
      currentPageCount: 4 + 37,
    });

    const counts = await calculatePdfPageCounts(
      {
        title: "Testplaner",
        addHolidays: false,
        period,
      },
      modules,
      { colorMap: new Map([["notes", 1]]) },
    );

    const beforeAlignment = 4 + 37 + plannerPages;
    const remainder = beforeAlignment % 4;
    const alignmentPages = remainder === 0 ? 0 : 4 - remainder;

    expect(counts.fullPageCount).toBe(beforeAlignment + alignmentPages);
    // Grayscale selection: the 37 stored pages plus blank alignment pages.
    expect(counts.bPages).toBe(37 + alignmentPages);
    expect(counts.cPages).toBe(4 + plannerPages);
  });
});

describe("module download selection", () => {
  const bookDetails = {
    title: "Download test",
    addHolidays: false,
    period: {
      start: new Date("2026-09-07T00:00:00.000Z"),
      end: new Date("2026-09-07T00:00:00.000Z"),
    },
  };
  const coverUrl = "https://pdf-tests.example/cover.pdf";
  const originalUrl = "https://pdf-tests.example/original.pdf";
  const variantUrl = "https://pdf-tests.example/grayscale.pdf";
  const cover: PDFModule = {
    id: "cover", type: "umschlag", idx: 0, pdfUrl: coverUrl, pageCount: 4,
  };
  const notes: PDFModule = {
    id: "notes", type: "notizen", idx: 1, pdfUrl: originalUrl,
    grayscalePdfUrl: variantUrl, pageCount: 3,
  };
  const options = {
    addPageNumbers: false,
    addWatermark: false,
    colorMap: new Map<string, 1 | 4>([["notes", 1]]),
  };

  let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
  afterEach(() => fetchSpy?.mockRestore());

  async function pdfBytes(pageCount: number, width = 400): Promise<Uint8Array> {
    const doc = await PDFDocument.create();
    for (let index = 0; index < pageCount; index++) {
      const page = doc.addPage([width, 600]);
      page.drawRectangle({ x: 10, y: 10, width: 10, height: 10, color: rgb(0.5, 0.5, 0.5) });
    }
    return doc.save({ addDefaultPage: false });
  }

  function mockDownloads(assets: Map<string, Uint8Array | "network-error">) {
    const calls: string[] = [];
    const mockFetch = async (input: Parameters<typeof fetch>[0]) => {
      const url = input instanceof Request ? input.url : String(input);
      calls.push(url);
      const body = assets.get(url);
      if (body === "network-error") throw new Error("Network unavailable");
      return body
        ? new Response(body.slice().buffer, { headers: { "Content-Type": "application/pdf" } })
        : new Response("Missing", { status: 404 });
    };
    fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(mockFetch, { preconnect: globalThis.fetch.preconnect }),
    );
    return calls;
  }

  it("downloads only the stored grayscale variant for static production modules", async () => {
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [originalUrl, await pdfBytes(3, 400)],
      [variantUrl, await pdfBytes(3, 500)],
    ]));

    const result = await processPdfModules(bookDetails, [cover, notes], options);
    const output = await PDFDocument.load(result.pdfFile);

    expect(calls.filter((url) => url === originalUrl)).toHaveLength(0);
    expect(calls.filter((url) => url === variantUrl)).toHaveLength(1);
    expect(output.getPage(2).getWidth()).toBe(500);
    expect(result.details.fullPageCount).toBe(8);
    expect(output.getPageCount()).toBe(8);
  });

  for (const failure of ["missing", "network-error"] as const) {
    it(`reports a ${failure} cover as a download error, not a page-count error`, async () => {
      const assets = new Map<string, Uint8Array | "network-error">([
        [originalUrl, await pdfBytes(3)],
      ]);
      if (failure === "network-error") assets.set(coverUrl, "network-error");
      mockDownloads(assets);

      const run = processPdfModules(bookDetails, [cover, notes], options);

      await expect(run).rejects.toThrow(/Failed to download PDF/);
      await expect(run).rejects.not.toThrow(/exactly 4 pages/);
    });
  }

  it("uses the original for color output without downloading a grayscale variant", async () => {
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [originalUrl, await pdfBytes(3, 400)],
      [variantUrl, await pdfBytes(3, 500)],
    ]));

    const result = await processPdfModules(bookDetails, [cover, notes], {
      ...options, colorMap: new Map(),
    });

    expect(calls.filter((url) => url === originalUrl)).toHaveLength(1);
    expect(calls).not.toContain(variantUrl);
    expect((await PDFDocument.load(result.pdfFile)).getPage(2).getWidth()).toBe(400);
  });

  it("shares a variant between legacy page counting and a capped preview", async () => {
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [variantUrl, await pdfBytes(8, 500)],
    ]));

    const result = await processPdfModulesPreview(
      bookDetails, [cover, { ...notes, pageCount: null }], options,
    );

    expect(calls).not.toContain(originalUrl);
    expect(calls.filter((url) => url === variantUrl)).toHaveLength(1);
    expect(result.details.fullPageCount).toBe(12);
    expect(result.details.bPages).toBe(8);
    expect((await PDFDocument.load(result.pdfFile)).getPageCount()).toBe(9);
  });

  it("fetches a shared static variant once for repeated modules", async () => {
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [variantUrl, await pdfBytes(3, 500)],
    ]));

    const result = await processPdfModules(bookDetails, [
      cover, notes, { ...notes, id: "notes-copy", idx: 2 },
    ], { ...options, colorMap: new Map([["notes", 1], ["notes-copy", 1]]) });

    expect(calls).not.toContain(originalUrl);
    expect(calls.filter((url) => url === variantUrl)).toHaveLength(1);
    expect(result.details.bPages).toBe(8);
    expect((await PDFDocument.load(result.pdfFile)).getPageCount()).toBe(12);
  });

  for (const failure of ["missing", "network-error", "invalid", "empty", "wrong-page-count"] as const) {
    it(`falls back to the original when a variant is ${failure}`, async () => {
      const assets = new Map<string, Uint8Array | "network-error">([
        [coverUrl, await pdfBytes(4)],
        [originalUrl, await pdfBytes(3, 400)],
      ]);
      if (failure === "network-error") assets.set(variantUrl, "network-error");
      if (failure === "invalid") assets.set(variantUrl, new TextEncoder().encode("not a PDF"));
      if (failure === "empty") assets.set(variantUrl, await pdfBytes(0));
      if (failure === "wrong-page-count") assets.set(variantUrl, await pdfBytes(2));
      const calls = mockDownloads(assets);

      const result = await processPdfModulesPreview(bookDetails, [
        cover, { ...notes, pageCount: failure === "wrong-page-count" ? 3 : null },
      ], options);
      const output = await PDFDocument.load(result.pdfFile);

      // The counting and build passes share both successful and failed reads.
      expect(calls.filter((url) => url === originalUrl)).toHaveLength(1);
      expect(calls.filter((url) => url === variantUrl)).toHaveLength(1);
      expect(output.getPage(2).getWidth()).toBe(400);
      expect(output.getPageCount()).toBe(7);
      expect(result.details.fullPageCount).toBe(8);
    });
  }

  it("handles legacy modules with no variant URL using one original read", async () => {
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [originalUrl, await pdfBytes(3)],
    ]));

    const result = await processPdfModulesPreview(bookDetails, [
      cover, { ...notes, grayscalePdfUrl: null, pageCount: null },
    ], options);

    expect(calls.filter((url) => url === originalUrl)).toHaveLength(1);
    expect(calls).not.toContain(variantUrl);
    expect((await PDFDocument.load(result.pdfFile)).getPageCount()).toBe(7);
  });

  it("converts the original for production when the stored variant is invalid", async () => {
    const conversionUrl = "https://api.ghost.miomideal.com/api/process/grayscale";
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [originalUrl, await pdfBytes(3, 420)],
      [variantUrl, new TextEncoder().encode("invalid variant")],
      [conversionUrl, await pdfBytes(3, 450)],
    ]));

    const result = await processPdfModules(bookDetails, [cover, notes], {
      ...options, grayscaleApiKey: "test-only-key",
    });

    expect(calls.filter((url) => url === originalUrl)).toHaveLength(1);
    expect(calls.filter((url) => url === variantUrl)).toHaveLength(1);
    expect(calls.filter((url) => url === conversionUrl)).toHaveLength(1);
    const request = fetchSpy?.mock.calls.find(([input]) => input === conversionUrl)?.[1];
    expect(request?.method).toBe("POST");
    const uploadedPdf = (request?.body as FormData).get("file") as Blob;
    expect((await PDFDocument.load(await uploadedPdf.arrayBuffer())).getPage(0).getWidth()).toBe(420);
    expect((await PDFDocument.load(result.pdfFile)).getPage(2).getWidth()).toBe(450);
  });

  it("retains original planner form geometry and shares repeated variant reads", async () => {
    const template = await PDFDocument.load(await pdfBytes(2));
    const field = template.getForm().createTextField("xA");
    field.addToPage(template.getPage(0), { x: 30, y: 100, width: 90, height: 16 });
    field.setFontSize(9);
    const calls = mockDownloads(new Map([
      [coverUrl, await pdfBytes(4)],
      [originalUrl, await template.save()],
      // Stored artwork has no form fields; the original supplies their positions.
      [variantUrl, await pdfBytes(2, 500)],
    ]));
    const planner = { ...notes, id: "planner", type: "wochenplaner", pageCount: 2 };

    const result = await processPdfModulesPreview(bookDetails, [
      cover, planner, { ...planner, id: "planner-copy", idx: 2 },
    ], { ...options, colorMap: new Map([["planner", 1], ["planner-copy", 1]]) });
    const output = await PDFDocument.load(result.pdfFile);
    let content = "";
    for (const page of output.getPages()) {
      const contents = page.node.Contents();
      const streams = contents instanceof PDFArray
        ? Array.from({ length: contents.size() }, (_, i) => contents.lookup(i))
        : [contents];
      for (const stream of streams) {
        if (stream instanceof PDFRawStream) {
          content += new TextDecoder().decode(decodePDFRawStream(stream).decode());
        }
      }
    }

    expect(calls.filter((url) => url === originalUrl)).toHaveLength(1);
    expect(calls.filter((url) => url === variantUrl)).toHaveLength(1);
    expect(content.toLowerCase()).toContain("30372e3039"); // 07.09 from the xA overlay
    expect(output.getPage(3).getWidth()).toBe(400);
    expect(output.getPageCount()).toBe(13);
  });
});
