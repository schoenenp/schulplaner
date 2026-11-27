import { createHmac, timingSafeEqual } from "node:crypto";
import { PDFDocument, StandardFonts, degrees, rgb } from "pdf-lib";
import { getBindingPageLimitByName } from "@/util/book/binding-rules";
import {
  isBindingModuleLike,
  isCoverModuleLike,
  isPlannerModuleLike,
} from "@/util/book/configurator";
import { env } from "@/env";
import type { SchoolPlanner } from "@/server/school-planner";
import { formatDateKeyUTC } from "@/util/date";
import { pickCoverImageFile, pickModulePdfFile } from "@/util/module-files";
import {
  processPdfModules,
  type BookDetails,
  type PDFModule,
} from "@/util/pdf";

export function schoolPlannerSpec(book: SchoolPlanner) {
  return {
    format: book.format.includes("A4")
      ? ("DIN A4" as const)
      : ("DIN A5" as const),
    binding: book.modules.find(({ module }) =>
      isBindingModuleLike({ part: module.part, type: module.type.name }),
    )?.module,
  };
}

function getBindingRuleName(book: SchoolPlanner) {
  const { binding } = schoolPlannerSpec(book);
  if (!binding) return "";
  const theme = binding.theme?.toLowerCase();
  return (
    [theme, binding.name].find(
      (name) => name && getBindingPageLimitByName(name) !== null,
    ) ??
    theme ??
    binding.name
  );
}

export function getSchoolPlannerPageLimit(book: SchoolPlanner) {
  return getBindingPageLimitByName(getBindingRuleName(book));
}

export function schoolPlannerPdfSource(book: SchoolPlanner) {
  const spec = schoolPlannerSpec(book);
  const printable = book.modules.filter(
    ({ module }) =>
      !isBindingModuleLike({ part: module.part, type: module.type.name }),
  );
  if (
    !spec.binding ||
    !printable.some(({ module }) =>
      isPlannerModuleLike({ part: module.part, type: module.type.name }),
    )
  ) {
    throw new Error("Bitte wählen Sie einen Wochenplaner und eine Bindung.");
  }
  if (
    printable.filter(({ module }) =>
      isCoverModuleLike({ part: module.part, type: module.type.name }),
    ).length !== 1
  ) {
    throw new Error("Bitte wählen Sie einen Umschlag.");
  }
  const colorMap = new Map<string, 1 | 4>();
  const modules: PDFModule[] = printable.map(({ module, colorCode }, idx) => {
    const file = pickModulePdfFile(module.files);
    if (!file) throw new Error(`Für „${module.name}“ fehlt die PDF-Datei.`);
    const isCover = isCoverModuleLike({
      part: module.part,
      type: module.type.name,
    });
    colorMap.set(
      module.id,
      colorCode === "COLOR" || (isCover && colorCode === null) ? 4 : 1,
    );
    return {
      id: module.id,
      name: module.name,
      idx: isCover ? 12345 : idx,
      type: isCover ? "umschlag" : module.type.name.toLowerCase(),
      pdfUrl: file.src,
      pageCount: file.pageCount,
      grayscalePdfUrl: isCover ? null : file.srcGrayscale,
      coverImageUrl: isCover
        ? pickCoverImageFile(module.files)?.src
        : undefined,
    };
  });

  const details: BookDetails = {
    title: book.bookTitle ?? "Schulplaner",
    subtitle: book.subTitle,
    code: book.region ?? "DE-SL",
    country: book.country,
    addHolidays: true,
    combineDateLabels: true,
    period: { start: book.planStart, end: book.planEnd ?? undefined },
    customDates: book.customDates.map(({ date, name }) => ({
      date: formatDateKeyUTC(date),
      name,
    })),
  };
  return {
    details,
    modules,
    colorMap,
    format: spec.format,
    bindingName: getBindingRuleName(book),
  };
}

export function schoolPlannerRevision(book: SchoolPlanner) {
  const { details, modules, colorMap, format, bindingName } =
    schoolPlannerPdfSource(book);
  return createHmac("sha256", env.AUTH_SECRET ?? env.CANCEL_SECRET)
    .update(
      JSON.stringify([
        book.id,
        book.createdById,
        details,
        modules,
        [...colorMap],
        format,
        bindingName,
        schoolPlannerSpec(book).binding?.id,
      ]),
    )
    .digest("base64url");
}

export function verifySchoolPlannerPreview(book: SchoolPlanner, token: string) {
  let expected: Buffer;
  try {
    expected = Buffer.from(schoolPlannerRevision(book));
  } catch {
    return false;
  }
  const provided = Buffer.from(token);
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export async function renderSchoolPlannerPreview(book: SchoolPlanner) {
  const { details, modules, colorMap, format } = schoolPlannerPdfSource(book);
  const result = await processPdfModules(details, modules, {
    format,
    colorMap,
    grayscaleApiKey: env.GHOST_GRAYSCALE_API_KEY,
  });
  const document = await PDFDocument.load(result.pdfFile);
  const font = await document.embedFont(StandardFonts.HelveticaBold);
  for (const page of document.getPages()) {
    const { width, height } = page.getSize();
    page.drawText("PIRROT · VORSCHAU", {
      x: width * 0.18,
      y: height * 0.35,
      rotate: degrees(35),
      font,
      size: width / 14,
      color: rgb(0.35, 0.35, 0.35),
      opacity: 0.3,
    });
  }
  return { pdf: await document.save(), pageCount: document.getPageCount() };
}
