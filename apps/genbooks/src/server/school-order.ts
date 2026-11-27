import "server-only";

import { randomUUID } from "node:crypto";
import { db, Prisma } from "db";
import type { PriceBookPayload } from "pricing";
import { calculatePrintCost } from "@/util/pdf/calculator";
import { SCHOOL_ORDER_CLIENT } from "@/util/school-planner-input";
import { z } from "zod";
import { getPriceBook } from "@/server/price-book";
import { getSchoolPlanner } from "@/server/school-planner";
import {
  getSchoolPlannerPageLimit,
  schoolPlannerPdfSource,
  verifySchoolPlannerPreview,
} from "@/server/school-planner-pdf";
import { decryptPayload, encryptPayload } from "@/util/crypto";
import { calculatePdfPageCounts } from "@/util/pdf";
import createOrderKey from "@/util/order/functions";
import {
  schoolOrderInput,
  type SchoolOrderInput,
} from "@/util/school-order-input";

export class SchoolOrderError extends Error {}

type Planner = NonNullable<Awaited<ReturnType<typeof getSchoolPlanner>>>;

const quoteContextSchema = z.object({
  kind: z.literal("pirrot-school-order"),
  userId: z.string(),
  bookId: z.string(),
  preview: z.string(),
  expiresAt: z.number(),
  requestId: z.string().uuid(),
  priceBookVersion: z.number(),
  bPages: z.number(),
  cPages: z.number(),
  fullPageCount: z.number(),
  input: schoolOrderInput,
});

const QUOTE_VALID_FOR_MS = 30 * 60 * 1000;
const PREVIEW_REQUIRED =
  "Der Planer wurde geändert. Bitte erstellen und prüfen Sie die Vorschau erneut.";
const PRICE_CHANGED =
  "Die Preise wurden aktualisiert. Bitte prüfen Sie den neuen Gesamtpreis.";

function assertSchoolPageLimit(book: Planner, fullPageCount: number) {
  const maximum = getSchoolPlannerPageLimit(book);
  if (maximum !== null && fullPageCount > maximum) {
    throw new SchoolOrderError(
      `Der Planer hat ${fullPageCount} Seiten. Für die gewählte Bindung sind bis zu ${maximum} Seiten möglich. Passen Sie die Bindung oder den Inhalt im Konfigurator an.`,
    );
  }
}

async function checkedPlanner(
  userId: string,
  bookId: string,
  preview: string,
  client: Prisma.TransactionClient = db,
) {
  const book = await getSchoolPlanner(userId, bookId, client);
  if (
    !book?.planEnd ||
    !book.bookTitle ||
    !verifySchoolPlannerPreview(book, preview)
  ) {
    throw new SchoolOrderError(PREVIEW_REQUIRED);
  }
  return book;
}

function quoteSchoolPlanner(
  source: ReturnType<typeof schoolPlannerPdfSource>,
  quantity: number,
  bPages: number,
  cPages: number,
  { priceBook }: PriceBookPayload,
) {
  const quote = calculatePrintCost({
    amount: quantity,
    bPages,
    cPages,
    format: source.format,
    bindingName: source.bindingName,
    priceBook,
  });
  return {
    product: quote.total,
    shipping: priceBook.shipping.standardCents,
    total: quote.total + priceBook.shipping.standardCents,
  };
}

export async function prepareSchoolOrder(
  userId: string,
  bookId: string,
  preview: string,
  input: SchoolOrderInput,
) {
  const [book, priceBook] = await Promise.all([
    checkedPlanner(userId, bookId, preview),
    getPriceBook(),
  ]);
  const source = schoolPlannerPdfSource(book);
  const { bPages, cPages, fullPageCount } = await calculatePdfPageCounts(
    source.details,
    source.modules,
    { colorMap: source.colorMap },
  );
  assertSchoolPageLimit(book, fullPageCount);

  const token = encryptPayload({
    kind: "pirrot-school-order",
    userId,
    bookId,
    preview,
    expiresAt: Date.now() + QUOTE_VALID_FOR_MS,
    requestId: randomUUID(),
    priceBookVersion: priceBook.version,
    bPages,
    cPages,
    fullPageCount,
    input,
  });

  return {
    token,
    amounts: quoteSchoolPlanner(
      source,
      input.quantity,
      bPages,
      cPages,
      priceBook,
    ),
    input,
    fullPageCount,
  };
}

type QuoteContext = z.infer<typeof quoteContextSchema>;

async function readQuote(userId: string, token: string): Promise<QuoteContext> {
  try {
    const data = quoteContextSchema.parse(await decryptPayload<unknown>(token));
    if (data.userId === userId) return data;
  } catch {
    // An expired or invalid form is rebuilt from the checkout.
  }
  throw new SchoolOrderError("Bitte prüfen Sie Ihre Bestelldaten erneut.");
}

async function findExistingOrder(userId: string, requestId: string) {
  const existing = await db.schoolOrderDetails.findUnique({
    where: { requestId },
    select: { order: { select: { userId: true, orderKey: true } } },
  });
  return existing?.order.userId === userId ? existing.order.orderKey : null;
}

async function createSnapshot(
  tx: Prisma.TransactionClient,
  book: Planner,
  quantity: number,
) {
  return tx.book.create({
    data: {
      bookTitle: book.bookTitle,
      name: book.bookTitle ?? book.name,
      subTitle: book.subTitle,
      quantity,
      format: book.format,
      country: book.country,
      region: book.region,
      planStart: book.planStart,
      planEnd: book.planEnd,
      clientRef: SCHOOL_ORDER_CLIENT,
      copyFromId: book.id,
      customDates: {
        create: book.customDates.map(({ date, name }) => ({ date, name })),
      },
      modules: {
        create: book.modules.map(({ module, idx, colorCode }) => ({
          idx,
          colorCode,
          module: {
            create: {
              name: module.name,
              theme: SCHOOL_ORDER_CLIENT,
              part: module.part,
              type: { connect: { id: module.typeId } },
              visible: "PRIVATE",
              files: {
                create: module.files.map(
                  ({ name, src, srcGrayscale, type, size, pageCount }) => ({
                    name,
                    src,
                    srcGrayscale,
                    type,
                    size,
                    pageCount,
                  }),
                ),
              },
            },
          },
        })),
      },
    },
    select: { id: true },
  });
}

export async function submitSchoolOrder(userId: string, token: string) {
  const quote = await readQuote(userId, token);
  const priorOrderKey = await findExistingOrder(userId, quote.requestId);
  if (priorOrderKey)
    return {
      orderKey: priorOrderKey,
      newOrder: false,
      email: quote.input.email,
    };
  if (quote.expiresAt < Date.now()) {
    throw new SchoolOrderError(
      "Die Preisübersicht ist abgelaufen. Bitte prüfen Sie Ihre Bestelldaten erneut.",
    );
  }

  const priceBook = await getPriceBook();
  if (priceBook.version !== quote.priceBookVersion)
    throw new SchoolOrderError(PRICE_CHANGED);
  const {
    quantity,
    schoolName,
    contactName,
    email,
    phone,
    billingAddress,
    shippingAddress,
    customerNote,
  } = quote.input;

  try {
    const orderKey = await db.$transaction(
      async (tx) => {
        const book = await checkedPlanner(
          userId,
          quote.bookId,
          quote.preview,
          tx,
        );
        assertSchoolPageLimit(book, quote.fullPageCount);
        const amounts = quoteSchoolPlanner(
          schoolPlannerPdfSource(book),
          quantity,
          quote.bPages,
          quote.cPages,
          priceBook,
        );
        const snapshot = await createSnapshot(tx, book, quantity);
        const order = await tx.order.create({
          data: {
            user: { connect: { id: userId } },
            shipping: { create: {} },
            bookOrder: {
              create: {
                quantity,
                book: { connect: { id: snapshot.id } },
                payment: {
                  create: {
                    price: amounts.product,
                    shippingCost: amounts.shipping,
                    total: amounts.total,
                  },
                },
              },
            },
            schoolDetails: {
              create: {
                requestId: quote.requestId,
                priceBookVersion: priceBook.version,
                schoolName,
                contactName,
                email,
                phone: phone || null,
                billingAddress,
                shippingAddress,
                customerNote: customerNote || null,
              },
            },
          },
          select: { id: true },
        });
        const key = createOrderKey(order.id);
        await tx.order.update({
          where: { id: order.id },
          data: { orderKey: key },
        });
        return key;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
    );
    return { orderKey, newOrder: true, email };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    ) {
      const orderKey = await findExistingOrder(userId, quote.requestId);
      if (orderKey) return { orderKey, newOrder: false, email };
    }
    throw error;
  }
}
