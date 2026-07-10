import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Clone a book and attach the clone to an order.
 *
 * @param bookId   ID of the book the user configured
 * @param paymentId ID of the db payment object 
 * @param quantity  qty for bookOrder object 
 * @returns        The newly‑created book ID (the immutable snapshot)
 */
export async function cloneBookForOrder(
  bookId: string,
  paymentId: string,
  quantity: number
): Promise<string> {

  // --------------------------------------------------------------
  // 1️⃣ Load the full source book (deep include)
  // --------------------------------------------------------------
  
  const source = await prisma.book.findUnique({
    where: { id: bookId },
    include: {
      modules: {
        orderBy: { idx: "asc" },
        include: {
          module: {
            include: {
              type: true,
              files: true,
            },
          },
        },
      },
    },
  });

  if (!source) throw new Error(`Book ${bookId} not found`);

  // 🔧 ADD VALIDATION: Check if modules exist and are valid
  if (!source.modules || source.modules.length === 0) {
    throw new Error(`Book ${bookId} has no modules to clone`);
  }

  // 🔧 ADD VALIDATION: Ensure all modules are valid
  for (const bm of source.modules) {
    if (!bm.module) {
      throw new Error(`Invalid module found in book ${bookId}`);
    }
  }

  const {name, bookTitle, subTitle, format, region, planStart, planEnd} = source
  
  // --------------------------------------------------------------
  // 2️⃣ Transaction – clone everything atomically
  // --------------------------------------------------------------
  const result = await prisma.$transaction(async (tx) => {
    // ----------------------------------------------------------
    // 2a️⃣ Create the cloned Book (copy scalar fields only)
    // ----------------------------------------------------------
    const clonedBook = await tx.book.create({
      data: {
        bookTitle,
        name,
        subTitle,
        format,
        region,
        planEnd,
        planStart,
        copyFromId: source.id
      },
    });

    // ----------------------------------------------------------
    // 2b️⃣ Clone each module (deep copy) - ADD ERROR HANDLING
    // ----------------------------------------------------------
    const createdModules = [];
    for (const bm of source.modules) {
      const srcMod = bm.module;
      
      // 🔧 ADD VALIDATION: Double-check module exists
      if (!srcMod?.id) {
        throw new Error(`Invalid module data for book ${bookId}`);
      }
      
      try {
        // ---- Re‑create the Book‑Module join row ----
        const createdModule = await tx.bookModule.create({
          data: {
            bookId: clonedBook.id,
            moduleId: srcMod.id,
            idx: bm.idx,
            colorCode: bm.colorCode
          },
        });
        createdModules.push(createdModule);
      } catch (error) {
        // 🔧 ADD CLEANUP: If module creation fails, clean up the cloned book
        await tx.book.delete({ where: { id: clonedBook.id } });
        throw new Error(`Failed to clone module: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // 🔧 ADD VALIDATION: Ensure all modules were created
    if (createdModules.length !== source.modules.length) {
      // Clean up if not all modules were created
      await tx.book.delete({ where: { id: clonedBook.id } });
      throw new Error(`Failed to clone all modules. Expected ${source.modules.length}, got ${createdModules.length}`);
    }

    // ----------------------------------------------------------
    // 2c️⃣ Link the cloned book to the order
    // ----------------------------------------------------------
    const createdOrder = await tx.bookOrder.create({
      data: {
        quantity,
        bookId: clonedBook.id,
        paymentId
      },
    });

    return createdOrder.id;
  });

  return result;
}