import "server-only";
import { db } from "@/server/db";
import { parsePriceTiers, type PriceList } from "@/lib/pricing";

export { defaultPeriod } from "@/lib/school-year";

export async function getShopSettings() {
  const settings = await db.shopSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    throw new Error("Shop-Einstellungen fehlen. Bitte `bun run db:seed` ausführen.");
  }
  return settings;
}

export async function getPriceList(): Promise<PriceList> {
  const settings = await getShopSettings();
  return {
    priceTiers: parsePriceTiers(settings.priceTiers),
    shippingAmount: settings.shippingAmount,
    freeShippingAt: settings.freeShippingAt,
    minQuantity: settings.minQuantity,
    vatBasisPoints: settings.vatBasisPoints,
  };
}

/** The standard planner every school order is built from, or null. */
export async function getTemplate() {
  const settings = await getShopSettings();
  if (!settings.templateBookId) return null;
  return db.book.findFirst({
    where: { id: settings.templateBookId, isTemplate: true, deletedAt: null },
    include: {
      modules: {
        orderBy: { idx: "asc" },
        include: { module: { include: { type: true, files: true } } },
      },
    },
  });
}

/** Covers schools can choose from, in panel order. */
export function listCoverChoices() {
  return db.module.findMany({
    where: { part: "COVER", visible: "PUBLIC", deletedAt: null },
    orderBy: [{ sortIdx: "asc" }, { createdAt: "asc" }],
    select: { id: true, name: true, description: true, thumbnailSrc: true },
  });
}
