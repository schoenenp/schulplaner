import { z } from "zod";
import type Stripe from "stripe";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";

import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import createOrderKey, {
  sendOrderVerification,
  verifyCancelKey,
} from "@/util/order/functions";
import { decryptPayload, encryptPayload } from "@/util/crypto";
import { stripeClient } from "@/util/stripe";
import { createOrderConfirmationEmail } from "@/util/order/templates/create-validation-order";
import { formatDisplayDate } from "@/util/date";
import { env } from "@/env";
import { getAppOriginFromHeaders } from "@/util/app-origin";
import { parsePartnerSessionMetadata } from "@/util/partner-program/session-metadata";
import { logger } from "@/util/logger";
import { enforceProcedureRateLimit } from "@/util/rate-limit";
import { isPartnerControlledFulfillmentEnabled } from "@/util/partner-program/flags";
import {
  createPartnerCorrelationId,
  recordPartnerOrderTransition,
} from "@/util/partner-program/transitions";
import {
  getCancellationGuardError,
  getCancellationPaymentStatus,
} from "./order-cancel-transition";

function mapCheckoutPaymentStatus(
  paymentStatus?: Stripe.Checkout.Session.PaymentStatus,
):
  | "SUCCEEDED"
  | "PENDING"
  | "CANCELLED" {
  if (paymentStatus === "paid" || paymentStatus === "no_payment_required") {
    return "SUCCEEDED";
  }
  if (paymentStatus === "unpaid") {
    return "PENDING";
  }
  return "PENDING";
}

function getPartnerSnapshotInvoiceUrl(partnerSnapshot: unknown): string | null {
  if (!partnerSnapshot || typeof partnerSnapshot !== "object") {
    return null;
  }

  const snapshotRecord = partnerSnapshot as Record<string, unknown>;
  const schoolInvoice =
    snapshotRecord.schoolInvoice &&
    typeof snapshotRecord.schoolInvoice === "object" &&
    !Array.isArray(snapshotRecord.schoolInvoice)
      ? (snapshotRecord.schoolInvoice as Record<string, unknown>)
      : null;
  const invoiceUrl = schoolInvoice?.hostedInvoiceUrl;
  return typeof invoiceUrl === "string" && invoiceUrl.length > 0 ? invoiceUrl : null;
}

export const orderRouter = createTRPCRouter({
  validate: publicProcedure
    .input(
      z.object({
        session: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "order.validate",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });

      const retrievedSession = await stripeClient.checkout.sessions.retrieve(
        input.session,
      );

      if (retrievedSession.status !== "complete") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Checkout ist noch nicht abgeschlossen",
        });
      }

      const existingBookOrder = await ctx.db.bookOrder.findFirst({
        where: {
          id: retrievedSession.metadata?.orderId,
        },
        include: {
          payment: true,
          order: {
            select: {
              id: true,
              orderKey: true,
            },
          },
        },
      });

      if (!existingBookOrder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Keine Bestellung gefunden",
        });
      }

      if (existingBookOrder.order?.orderKey) {
        return encryptPayload({ orderKey: existingBookOrder.order.orderKey });
      }

      const createdOrderRef = await ctx.db.$transaction(async (tx) => {
        await tx.bookOrder.update({
          where: {
            id: existingBookOrder.id,
          },
          data: {
            payment: {
              update: {
                status:
                  retrievedSession.payment_status === "unpaid"
                    ? "PENDING"
                    : "SUCCEEDED",
                total: retrievedSession.amount_total ?? 0,
                shippingCost: retrievedSession.shipping_cost?.amount_total ?? 0,
              },
            },
          },
        });

        const currentBookOrder = await tx.bookOrder.findUnique({
          where: { id: existingBookOrder.id },
          include: {
            order: true,
          },
        });

        if (!currentBookOrder) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Keine Bestellung gefunden",
          });
        }

        if (currentBookOrder.order?.orderKey) {
          return {
            orderKey: currentBookOrder.order.orderKey,
            orderId: currentBookOrder.order.id,
          };
        }

        let createdOrder = currentBookOrder.order ?? null;
        if (!createdOrder) {
          try {
            createdOrder = await tx.order.create({
              data: {
                user: ctx.session?.user
                  ? {
                      connect: {
                        id: ctx.session.user.id,
                      },
                    }
                  : undefined,
                bookOrder: {
                  connect: {
                    id: existingBookOrder.id,
                  },
                },
              },
            });
          } catch (error) {
            // Handle a concurrent validator creating the linked order.
            if (
              error instanceof Prisma.PrismaClientKnownRequestError &&
              error.code === "P2002"
            ) {
              const racedBookOrder = await tx.bookOrder.findUnique({
                where: { id: existingBookOrder.id },
                include: { order: true },
              });
              createdOrder = racedBookOrder?.order ?? null;
            } else {
              throw error;
            }
          }
        }

        if (!createdOrder) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create order",
          });
        }

        if (createdOrder.orderKey) {
          return {
            orderKey: createdOrder.orderKey,
            orderId: createdOrder.id,
          };
        }

        const newOrderKey = createOrderKey(createdOrder.id);
        await tx.order.update({
          where: {
            id: createdOrder.id,
          },
          data: {
            orderKey: newOrderKey,
          },
        });
        return {
          orderKey: newOrderKey,
          orderId: createdOrder.id,
        };
      });

      const partnerMetadata = parsePartnerSessionMetadata(
        retrievedSession.metadata,
      );
      const partnerControlledFulfillmentEnabled =
        isPartnerControlledFulfillmentEnabled();

      if (partnerMetadata && partnerControlledFulfillmentEnabled) {
        const transitioned = await ctx.db.partnerOrder.updateMany({
          where: {
            bookId: existingBookOrder.bookId,
            partnerUserId: partnerMetadata.partnerUserId,
            status: {
              in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"],
            },
          },
          data: {
            status: "UNDER_PARTNER_REVIEW",
            orderId: createdOrderRef.orderId,
          },
        });
        if (transitioned.count === 1) {
          const partnerOrder = await ctx.db.partnerOrder.findUnique({
            where: { bookId: existingBookOrder.bookId },
            select: { id: true },
          });
          if (partnerOrder) {
            await recordPartnerOrderTransition({
              db: ctx.db,
              partnerOrderId: partnerOrder.id,
              actorUserId: ctx.session?.user?.id ?? null,
              fromStatus: "SUBMITTED_BY_SCHOOL",
              toStatus: "UNDER_PARTNER_REVIEW",
              correlationId: createPartnerCorrelationId("partner_review"),
              payload: {
                orderId: createdOrderRef.orderId,
                orderKey: createdOrderRef.orderKey,
                checkoutSessionId: retrievedSession.id,
                flow: "checkout",
              },
            });
          }
        }
        logger.info("partner_order_waiting_for_partner_confirmation", {
          orderId: createdOrderRef.orderId,
          orderKey: createdOrderRef.orderKey,
          checkoutSessionId: retrievedSession.id,
          partnerUserId: partnerMetadata.partnerUserId,
        });
      } else if (partnerMetadata) {
        logger.info("partner_controlled_fulfillment_disabled_fallback", {
          partnerUserId: partnerMetadata.partnerUserId,
          orderId: createdOrderRef.orderId,
          orderKey: createdOrderRef.orderKey,
        });
      }

      const customerEmail =
        retrievedSession.customer_details?.email ?? env.SHOP_EMAIL;
      const customerName = retrievedSession.customer_details?.name ?? "Kunde";

      if (!partnerMetadata || !partnerControlledFulfillmentEnabled) {
        const appOrigin = getAppOriginFromHeaders(ctx.headers);
        const html = await createOrderConfirmationEmail(
          createdOrderRef.orderKey,
          customerName,
          appOrigin,
        );

        try {
          await sendOrderVerification(
            customerEmail,
            "Bestellung bestätigt - Pirrot",
            html,
          );
        } catch (err) {
          logger.error("order_confirmation_email_failed", {
            checkoutSessionId: retrievedSession.id,
            error: err,
          });
        }
      } else {
        logger.info("partner_order_confirmation_email_deferred", {
          orderId: createdOrderRef.orderId,
          orderKey: createdOrderRef.orderKey,
          customerEmail,
        });
      }

      return encryptPayload({ orderKey: createdOrderRef.orderKey });
    }),
  cancelByUser: publicProcedure
    .input(
      z.object({
        encryptedPayload: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Decrypt on server side
      const payload: { bookId: string; orderId: string; cancelKey: string } =
        await decryptPayload(input.encryptedPayload);

      // Validate the payload
      if (!payload.orderId || !payload.cancelKey) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid payload" });
      }

      // Verify cancel key
      const validCancelKey = verifyCancelKey(
        payload.orderId,
        payload.cancelKey,
      );
      if (!validCancelKey) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid cancellation key",
        });
      }

      // Check if order exists and is cancellable
      const bookOrder = await ctx.db.bookOrder.findFirst({
        where: {
          id: payload.orderId,
          orderId: null,
        },
      });

      if (!bookOrder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order not found or not cancellable",
        });
      }

      await ctx.db.bookOrder.delete({
        where: { id: bookOrder.id },
      });

      return payload.bookId;
    }),
  getById: protectedProcedure
    .input(
      z.object({
        orderId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const { orderId } = input;
      const payload: { orderId: string } = await decryptPayload(orderId);
      const order = await db.order.findUnique({
        where: {
          orderKey: payload.orderId,
        },
        include: {
          shipping: true,
          bookOrder: {
            include: {
              book: true,
              payment: true,
            },
          },
        },
      });
      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Keine Bestellung gefunden.",
        });
      }

      let orderDetails;
      let orderPrice = order?.bookOrder?.payment.total ?? 0;
      let shippingPrice = order?.bookOrder?.payment.shippingCost ?? 0;

      if (order.bookOrder?.payment.shopId) {
        orderDetails = await stripeClient.checkout.sessions.retrieve(
          order.bookOrder?.payment.shopId,
        );
        if (orderDetails.amount_total) {
          orderPrice = orderDetails?.amount_total;
        }
        if (orderDetails.shipping_cost?.amount_total) {
          shippingPrice = orderDetails?.shipping_cost?.amount_total;
        }
      }

      const booksPrice = order.bookOrder?.payment.price ?? 0;
      const orderObject = {
        id: order.orderKey,
        name: order.bookOrder?.book.name ?? `Buch-${order.id}`,
        date: formatDisplayDate(order.createdAt) ?? "NO ORDER",
        status: order.status,
        price: `${(booksPrice / 100).toFixed(2)}€`,
        shipping: `${(shippingPrice / 100).toFixed(2)}€`,
        total: `${(orderPrice / 100).toFixed(2)}€`,
        trackingId: order.shippingId,
        paymentStatus:
          orderDetails?.payment_status === "paid"
            ? "Bezahlt"
            : orderDetails?.payment_status === "no_payment_required"
              ? "Gratis"
              : order.bookOrder?.payment.status === "SUCCEEDED"
                ? "Bezahlt"
                : "Wartend",
      };

      return orderObject ?? null;
    }),
  getByPublicId: publicProcedure
    .input(
      z.object({
        orderId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const { orderId } = input;
      let payload: { orderKey: string };
      try {
        payload = await decryptPayload(orderId);
      } catch (err) {
        logger.warn("order_public_id_decrypt_failed", { error: err });
        throw new TRPCError({ code: "BAD_REQUEST", message: "Ungültiger Bestelllink" });
      }
      if (!payload) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "No payload found..." });
      }
      const order = await db.order.findUnique({
        where: {
          orderKey: payload.orderKey,
        },
        include: {
          shipping: true,
          bookOrder: {
            include: {
              book: true,
              payment: true,
            },
          },
          partnerOrder: {
            select: {
              partnerSnapshot: true,
            },
          },
        },
      });
      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Keine Bestellung gefunden.",
        });
      }

      let orderDetails;
      let orderPrice = order?.bookOrder?.payment.total ?? 0;
      let shippingPrice = order?.bookOrder?.payment.shippingCost ?? 0;
      let invoiceUrl: string | null | undefined;

      if (order.bookOrder?.payment.shopId) {
        orderDetails = await stripeClient.checkout.sessions.retrieve(
          order.bookOrder?.payment.shopId,
        );
        if (orderDetails.amount_total) {
          orderPrice = orderDetails?.amount_total;
        }
        if (orderDetails.shipping_cost?.amount_total) {
          shippingPrice = orderDetails?.shipping_cost?.amount_total;
        }
      }

      const invoiceId =
        typeof orderDetails?.invoice === "string" ? orderDetails.invoice : null;
      if (invoiceId) {
        const invoice = await stripeClient.invoices.retrieve(invoiceId);
        invoiceUrl = invoice.hosted_invoice_url;
      }
      invoiceUrl ??= getPartnerSnapshotInvoiceUrl(
        order.partnerOrder?.partnerSnapshot,
      );

      const booksPrice = order.bookOrder?.payment.price ?? 0;
      const orderObject = {
        id: order.orderKey,
        name: order.bookOrder?.book.name ?? `Buch-${order.id}`,
        date: formatDisplayDate(order.createdAt) ?? "NO ORDER",
        status: order.status,
        price: `${(booksPrice / 100).toFixed(2)}€`,
        shipping: `${(shippingPrice / 100).toFixed(2)}€`,
        total: `${(orderPrice / 100).toFixed(2)}€`,
        trackingId: order.shippingId,
        invoiceUrl: invoiceUrl ?? null,
        paymentStatus: orderDetails?.payment_status
          ? mapCheckoutPaymentStatus(orderDetails.payment_status)
          : order.bookOrder?.payment.status ?? "PENDING",
      };

      return orderObject ?? null;
    }),
  initSection: protectedProcedure.query(async ({ ctx }) => {
    const { db } = ctx;
    const all = await db.order.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      include: {
        bookOrder: {
          include: {
            book: true,
            payment: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
      skip: 1,
    });
    let latest = [];
    latest = await db.order.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      include: {
        bookOrder: {
          include: {
            book: true,
            payment: true,
          },
        },
      },
      take: 1,
      orderBy: {
        createdAt: "desc",
      },
    });

    latest = latest.map((o) => {
      const currentOrder = o.bookOrder;
      const totalOrderPrice = currentOrder?.payment.total ?? 0;
      return {
        id: o.orderKey,
        hash: encryptPayload({ orderKey: o.orderKey }),
        name: currentOrder?.book.name ?? `Buch-${o.id}`,
        date: o?.createdAt.toLocaleDateString() ?? "NO ORDER",
        status: o?.status ?? "FAILED",
        total: `${(totalOrderPrice / 100).toFixed(2)}€`,
      };
    });
    const latestOrder = latest[0];
    return {
      all:
        all.map((o) => {
          const currentOrder = o.bookOrder;
          const totalOrderPrice = currentOrder?.payment.total ?? 0;

          return {
            id: o.orderKey,
            hash: encryptPayload({ orderKey: o.orderKey }),
            name: currentOrder?.book.name ?? `Buch-${o.id}`,
            date: o?.createdAt.toLocaleDateString() ?? "NO ORDER",
            status: o?.status ?? "FAILED",
            total: `${(totalOrderPrice / 100).toFixed(2)}€`,
          };
        }) ?? [],
      latest: latestOrder ?? null,
    };
  }),
  cancelPending: publicProcedure
    .input(
      z.object({
        orderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "order.cancelPending",
        maxRequests: 5,
        windowMs: 10 * 60 * 1000,
      });

      const payload: { orderKey: string } = await decryptPayload(input.orderId);

      const order = await ctx.db.order.findUnique({
        where: {
          orderKey: payload.orderKey,
        },
        include: {
          bookOrder: {
            include: {
              payment: true,
            },
          },
        },
      });

      if (!order) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Order not found" });
      }

      const guardError = getCancellationGuardError({
        orderStatus: order.status,
        hasPayment: Boolean(order.bookOrder?.payment),
      });
      if (guardError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: guardError });
      }
      const payment = order.bookOrder?.payment;
      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Order payment not found",
        });
      }

      let paymentStatus: "REFUNDED" | "CANCELLED" = "CANCELLED";
      let refundId: string | undefined;
      let refundedAt: Date | undefined;

      // Handle Stripe refund if payment exists and has a payment intent.
      if (payment.shopId) {
        try {
          // Get the payment intent from the session
          const session = await stripeClient.checkout.sessions.retrieve(
            payment.shopId,
          );

          if (session.payment_intent) {
            const paymentIntentId = session.payment_intent as string;
            const paymentIntent = await stripeClient.paymentIntents.retrieve(
              paymentIntentId,
            );
            const isDestinationCharge = Boolean(
              paymentIntent.transfer_data?.destination,
            );
            const hasApplicationFee =
              (paymentIntent.application_fee_amount ?? 0) > 0;

            // Create refund
            const refund = await stripeClient.refunds.create(
              {
                payment_intent: paymentIntentId,
                reason: "requested_by_customer",
                ...(isDestinationCharge ? { reverse_transfer: true } : {}),
                ...(isDestinationCharge && hasApplicationFee
                  ? { refund_application_fee: true }
                  : {}),
              },
              {
                idempotencyKey: `refund_${payment.id}`,
              },
            );
            paymentStatus = getCancellationPaymentStatus({
              hasPaymentIntent: true,
            });
            refundId = refund.id;
            refundedAt = new Date();
          } else {
            paymentStatus = getCancellationPaymentStatus({
              hasPaymentIntent: false,
            });
          }
        } catch (error) {
          logger.error("stripe_refund_error", {
            orderKey: payload.orderKey,
            error,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to process refund",
          });
        }
      }
      await ctx.db.payment.update({
        where: {
          id: payment.id,
        },
        data: {
          status: paymentStatus,
          refundId,
          refundedAt,
        },
      });
      return ctx.db.order.update({
        where: {
          orderKey: payload.orderKey,
        },
        data: {
          status: "CANCELED",
          canceledAt: new Date(),
        },
      });
    }),
});
