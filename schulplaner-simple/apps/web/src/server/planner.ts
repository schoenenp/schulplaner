import "server-only";
import type { Prisma } from "db";
import { brand } from "@/brand";
import { db } from "@/server/db";
import { pdfBookInclude, type PdfBook } from "@/server/pdf";
import { defaultPeriod, getShopSettings, getTemplate } from "@/server/settings";

/**
 * A school planner is a normal Book, built like every genbooks planner. The
 * school edits only its info, dates and cover; the content modules always
 * follow the standard planner (template) and are re-synced before every
 * preview and order.
 */

type Tx = Prisma.TransactionClient;

export class PlannerUnavailableError extends Error {}

export function findOwnPlanner(userId: string, bookId: string) {
  return db.book.findFirst({
    where: {
      id: bookId,
      createdById: userId,
      isTemplate: false,
      frozenAt: null,
      deletedAt: null,
    },
    include: pdfBookInclude,
  });
}

export async function createPlannerFromTemplate(userId: string) {
  const [template, settings] = await Promise.all([
    getTemplate(),
    getShopSettings(),
  ]);
  if (!template) {
    throw new PlannerUnavailableError(
      "Der Standardplaner ist noch nicht eingerichtet. Bitte versuchen Sie es später erneut.",
    );
  }
  const period = defaultPeriod(settings);
  return db.book.create({
    data: {
      name: "Schulplaner",
      bookTitle: template.bookTitle ?? "Schulplaner",
      format: template.format,
      country: brand.country,
      region: brand.region,
      planStart: period.start,
      planEnd: period.end,
      createdById: userId,
      copyFromId: template.id,
      modules: {
        create: template.modules.map(({ moduleId, idx, colorCode }) => ({
          moduleId,
          idx,
          colorCode,
        })),
      },
    },
    select: { id: true },
  });
}

function moduleSignature(
  entries: { moduleId: string; idx: number; colorCode: string | null }[],
) {
  return entries
    .map((entry) => `${entry.moduleId}:${entry.idx}:${entry.colorCode}`)
    .sort()
    .join("|");
}

/** Match the displayed cover to what preview and checkout will use. */
export function resolvePlannerCover(
  book: Pick<PdfBook, "modules" | "createdById">,
  templateCover: PdfBook["modules"][number] | undefined,
) {
  const chosen = book.modules.find((entry) => entry.module.part === "COVER");
  if (
    chosen && !chosen.module.deletedAt &&
    ((book.createdById !== null && chosen.module.createdById === book.createdById) ||
      chosen.module.visible === "PUBLIC" || chosen.moduleId === templateCover?.moduleId)
  ) {
    return chosen;
  }
  return templateCover;
}

/**
 * Align the planner's modules with the current standard planner. The chosen
 * cover is kept while it is still offered; otherwise the template cover is
 * used. Returns the planner reloaded for PDF generation.
 */
export async function syncPlannerContent(book: PdfBook): Promise<PdfBook> {
  const template = await getTemplate();
  if (!template) {
    throw new PlannerUnavailableError(
      "Der Standardplaner ist noch nicht eingerichtet.",
    );
  }
  const templateCover = template.modules.find(
    (entry) => entry.module.part === "COVER",
  );
  if (!templateCover) {
    throw new PlannerUnavailableError("Der Standardplaner hat keinen Umschlag.");
  }
  const cover = resolvePlannerCover(book, templateCover) ?? templateCover;

  const desired = [
    ...template.modules
      .filter((entry) => entry.module.part !== "COVER")
      .map(({ moduleId, idx, colorCode }) => ({ moduleId, idx, colorCode })),
    { moduleId: cover.moduleId, idx: 0, colorCode: templateCover.colorCode },
  ];
  if (
    moduleSignature(desired) ===
    moduleSignature(
      book.modules.map(({ moduleId, idx, colorCode }) => ({
        moduleId,
        idx,
        colorCode,
      })),
    )
  ) {
    return book;
  }
  await db.$transaction([
    db.bookModule.deleteMany({ where: { bookId: book.id } }),
    db.bookModule.createMany({
      data: desired.map((entry) => ({ ...entry, bookId: book.id })),
    }),
  ]);
  return db.book.findUniqueOrThrow({
    where: { id: book.id },
    include: pdfBookInclude,
  });
}

/** Replace the cover; null restores the standard planner's cover. */
export async function setPlannerCover(bookId: string, coverModuleId: string | null) {
  const template = await getTemplate();
  const templateCover = template?.modules.find(
    (entry) => entry.module.part === "COVER",
  );
  const moduleId = coverModuleId ?? templateCover?.moduleId;
  if (!moduleId) throw new PlannerUnavailableError("Kein Umschlag verfügbar.");
  if (coverModuleId) {
    const offered = await db.module.findFirst({
      where: {
        id: coverModuleId,
        part: "COVER",
        visible: "PUBLIC",
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!offered) throw new PlannerUnavailableError("Dieser Umschlag ist nicht verfügbar.");
  }
  await db.$transaction([
    db.bookModule.deleteMany({
      where: { bookId, module: { part: "COVER" } },
    }),
    db.bookModule.create({
      data: {
        bookId,
        moduleId,
        idx: 0,
        colorCode: templateCover?.colorCode ?? "COLOR",
      },
    }),
    db.book.update({ where: { id: bookId }, data: { updatedAt: new Date() } }),
  ]);
}

/**
 * Frozen copy that an order prints from. Modules are immutable, so the copy
 * references the same modules; info and dates are duplicated.
 */
export async function freezePlanner(tx: Tx, book: PdfBook) {
  return tx.book.create({
    data: {
      name: book.name,
      bookTitle: book.bookTitle,
      subTitle: book.subTitle,
      format: book.format,
      country: book.country,
      region: book.region,
      planStart: book.planStart,
      planEnd: book.planEnd,
      frozenAt: new Date(),
      createdById: book.createdById,
      copyFromId: book.id,
      modules: {
        create: book.modules.map(({ moduleId, idx, colorCode }) => ({
          moduleId,
          idx,
          colorCode,
        })),
      },
      customDates: {
        create: book.customDates.map(({ date, name }) => ({ date, name })),
      },
    },
    select: { id: true },
  });
}
