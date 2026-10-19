import type { PrismaClient } from "@prisma/client";

/** Serialize validators before touching payment or order state. */
export async function finalizeBookOrder(
  db: PrismaClient,
  input: {
    bookOrderId: string;
    checkoutSessionId: string;
    userId?: string;
    paymentStatus: "PENDING" | "SUCCEEDED";
    total: number;
    shippingCost: number;
  },
  createOrderKey: (id: number) => string,
) {
  return db.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "public"."BookOrder" WHERE id = ${input.bookOrderId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new Error("Book order not found");

    const bookOrder = await tx.bookOrder.findUniqueOrThrow({
      where: { id: input.bookOrderId },
      include: { order: true, payment: true, book: { select: { createdById: true } } },
    });
    if (bookOrder.payment.shopId && bookOrder.payment.shopId !== input.checkoutSessionId) {
      throw new Error("Checkout session does not match the payment");
    }
    if (!bookOrder.payment.shopId) {
      await tx.payment.update({ where: { id: bookOrder.paymentId }, data: { shopId: input.checkoutSessionId } });
    }
    if (bookOrder.order?.orderKey) {
      // A delayed payment may become paid after the order was first created.
      // Never overwrite a refund/cancellation or regress a succeeded payment.
      if (input.paymentStatus === "SUCCEEDED") {
        await tx.payment.updateMany({
          where: { id: bookOrder.paymentId, status: "PENDING" },
          data: { status: "SUCCEEDED", total: input.total, shippingCost: input.shippingCost },
        });
      }
      return {
        orderId: bookOrder.order.id,
        orderKey: bookOrder.order.orderKey,
        newlyFinalized: false,
      };
    }

    if (!["PENDING", "SUCCEEDED"].includes(bookOrder.payment.status)) throw new Error("A canceled or refunded payment cannot be finalized");
    const updated = await tx.payment.updateMany({
      where: { id: bookOrder.paymentId, status: { in: ["PENDING", "SUCCEEDED"] } },
      data: {
        status: bookOrder.payment.status === "SUCCEEDED" ? "SUCCEEDED" : input.paymentStatus,
        total: input.total,
        shippingCost: input.shippingCost,
      },
    });
    if (updated.count !== 1) throw new Error("Payment changed during finalization");
    const order = bookOrder.order ?? await tx.order.create({
      data: {
        userId: bookOrder.book.createdById ?? input.userId,
        bookOrder: { connect: { id: input.bookOrderId } },
      },
    });
    const orderKey = createOrderKey(order.id);
    await tx.order.update({ where: { id: order.id }, data: { orderKey } });
    return { orderId: order.id, orderKey, newlyFinalized: true };
  });
}
