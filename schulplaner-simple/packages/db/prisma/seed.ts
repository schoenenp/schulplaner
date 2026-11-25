/**
 * Idempotent base data: the three module types pdf-pipeline knows and the
 * settings row with a starter price list. Safe to run on every deploy.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const MODULE_TYPES = [
  // Cover handler: exactly 4 pages, front pair first, back pair last.
  { name: "umschlag", minPages: 4, maxPages: 4 },
  // Planner handler: one 2-page spread, repeated for every week.
  { name: "wochenplaner", minPages: 2, maxPages: 2 },
  // Default handler: copied as-is.
  { name: "inhalt", minPages: 1, maxPages: 100 },
];

for (const type of MODULE_TYPES) {
  await db.moduleType.upsert({
    where: { name: type.name },
    create: type,
    update: { minPages: type.minPages, maxPages: type.maxPages },
  });
}

await db.shopSettings.upsert({
  where: { id: "default" },
  create: {
    id: "default",
    priceTiers: [
      { minQuantity: 1, unitAmount: 990 },
      { minQuantity: 50, unitAmount: 790 },
      { minQuantity: 150, unitAmount: 690 },
    ],
    shippingAmount: 1490,
    freeShippingAt: 150,
    minQuantity: 10,
    vatBasisPoints: 1900,
  },
  update: {},
});

console.log("Seed complete: module types and shop settings");
await db.$disconnect();
