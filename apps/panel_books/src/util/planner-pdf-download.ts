import type { RouterOutputs } from "@/trpc/react";

type PlannerPdfSource = RouterOutputs["planner"]["getPdfSource"];

export async function createPlannerPdfUrl(
  source: PlannerPdfSource,
  watermark = false,
) {
  const { processPdfModules } = await import("@/util/pdf");
  const result = await processPdfModules(source.bookDetails, source.modules, {
    format: source.format,
    colorMap: new Map(source.colorEntries),
    ...(watermark ? { addWatermark: true } : {}),
  });
  return URL.createObjectURL(
    new Blob([result.pdfFile as BlobPart], { type: "application/pdf" }),
  );
}

export async function downloadPlannerPrintPdf(source: PlannerPdfSource) {
  const url = await createPlannerPdfUrl(source);
  const name =
    source.fileName
      .trim()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "planer";
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${name}-druck.pdf`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
