import type { Prisma } from "db";
import { db } from "@/server/db";
import { SCHOOL_ORDER_CLIENT } from "@/util/school-planner-input";

const schoolPlannerInclude = {
  modules: {
    include: {
      module: {
        include: {
          type: true,
          files: { orderBy: { id: "asc" } },
          books: {
            where: {
              book: { deletedAt: null, isTemplate: true, isPublic: true },
            },
            select: { bookId: true },
            take: 1,
          },
        },
      },
    },
    orderBy: [{ idx: "asc" }, { id: "asc" }],
  },
  customDates: { orderBy: [{ date: "asc" }, { id: "asc" }] },
} satisfies Prisma.BookInclude;

export type SchoolPlanner = Prisma.BookGetPayload<{
  include: typeof schoolPlannerInclude;
}>;

export async function getSchoolPlanner(
  userId: string,
  bookId: string,
  client: Prisma.TransactionClient = db,
) {
  const book = await client.book.findFirst({
    where: {
      id: bookId,
      createdById: userId,
      deletedAt: null,
      isTemplate: false,
      sourceType: { not: "PARTNER_TEMPLATE" },
      OR: [{ clientRef: null }, { clientRef: { not: SCHOOL_ORDER_CLIENT } }],
    },
    include: schoolPlannerInclude,
  });
  if (!book) return null;

  const originalPrivateModules =
    book.copyFromId &&
    book.modules.some(
      ({ module }) =>
        module.visible === "PRIVATE" && module.createdById !== userId,
    )
      ? await client.bookModule.findMany({
          where: { bookId: book.copyFromId },
          select: { moduleId: true },
        })
      : [];
  if (
    book.modules.some(
      ({ module }) =>
        module.deletedAt !== null ||
        module.type.deletedAt !== null ||
        (module.visible === "PRIVATE" &&
          module.createdById !== userId &&
          !module.books.length &&
          !originalPrivateModules.some(
            ({ moduleId }) => moduleId === module.id,
          )),
    )
  )
    return null;
  return book;
}
