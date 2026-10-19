import type { Prisma } from "db";

// Submission copies are private, have no module owner, and belong only to
// anonymous copies of planners. Keep originals (including private drafts),
// user uploads, and modules merely referenced by a copied planner in the catalog.
const snapshotBookWhere = {
  copyFromId: { not: null },
  createdById: null,
  isTemplate: false,
} satisfies Prisma.BookWhereInput;

export const catalogModuleWhere = {
  deletedAt: null,
  NOT: {
    visible: "PRIVATE",
    createdById: null,
    books: {
      some: { book: snapshotBookWhere },
      every: { book: snapshotBookWhere },
    },
  },
} satisfies Prisma.ModuleWhereInput;
