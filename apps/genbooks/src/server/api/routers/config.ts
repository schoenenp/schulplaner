import { cdnAssetUrl } from "@/util/cdn-asset-url";
import { SCHOOL_ORDER_CLIENT } from "@/util/school-planner-input";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { stripeClient, toStripeAddress } from "@/util/stripe";
import { env } from "@/env";
import type Stripe from "stripe";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { calculatePdfPageCounts } from "@/util/pdf";
import type { ColorCode, ModuleId } from "@/app/_components/module-changer";
import { calculatePrintCost } from "@/util/pdf/calculator";
import { getPriceBook } from "@/server/price-book";
import { encryptPayload } from "@/util/crypto";
import createOrderKey, {
  createCancelKey,
  sendOrderVerification,
} from "@/util/order/functions";
import { createOrderConfirmationEmail } from "@/util/order/templates/create-validation-order";
import { getAppOriginFromHeaders } from "@/util/app-origin";
import { cloneBookForOrder } from "@/util/book/clone-book";
import { logger } from "@/util/logger";
import { pickCoverImageFile, pickModulePdfFile } from "@/util/module-files";
import { enforceProcedureRateLimit } from "@/util/rate-limit";
import {
  getBindingLimitMessage,
  isBindingAllowedForTotalPages,
} from "@/util/book/binding-rules";
import { buildModuleFeedVisibilityWhere } from "./module-visibility";
import { canAccessBookForSetupOrder } from "./setup-order-access";

const REQUIRED_TEXT_MIN = 1;
const NAME_MAX = 120;
const STREET_MAX = 160;
const STREET_NO_MAX = 24;
const CITY_MAX = 120;
const ZIP_MAX = 16;
const TITLE_MAX = 24;
const ORG_MAX = 140;
const OPTIONAL_MAX = 240;
const STATE_MAX = 80;
const PHONE_MAX = 40;
const EMAIL_MAX = 254;
const VAT_ID_MAX = 40;

const OptionalTrimmedString = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return value.length > 0 ? value : undefined;
    });

const ConfigAddressSchema = z.object({
  org: OptionalTrimmedString(ORG_MAX),
  title: OptionalTrimmedString(TITLE_MAX),
  name: z.string().trim().min(REQUIRED_TEXT_MIN).max(NAME_MAX),
  prename: z.string().trim().min(REQUIRED_TEXT_MIN).max(NAME_MAX),
  street: z.string().trim().min(REQUIRED_TEXT_MIN).max(STREET_MAX),
  streetNr: z.string().trim().min(REQUIRED_TEXT_MIN).max(STREET_NO_MAX),
  city: z.string().trim().min(REQUIRED_TEXT_MIN).max(CITY_MAX),
  zip: z
    .string()
    .trim()
    .min(3)
    .max(ZIP_MAX)
    .regex(/^[A-Za-z0-9 -]+$/),
  optional: OptionalTrimmedString(OPTIONAL_MAX),
  state: OptionalTrimmedString(STATE_MAX),
  email: z.string().trim().email().max(EMAIL_MAX),
  vatId: OptionalTrimmedString(VAT_ID_MAX),
  phone: z
    .string()
    .trim()
    .max(PHONE_MAX)
    .regex(/^[0-9+()\-./\s]*$/)
    .optional()
    .transform((value) => {
      if (!value) return undefined;
      return value.length > 0 ? value : undefined;
    }),
});

const ConfigDetailsSchema = z.object({
  bookId: z.string(),
  isPickup: z.boolean(),
  format: z.enum(["DIN A4", "DIN A5"]).default("DIN A5"),
  quantity: z.number().min(1).max(5000),
  saveUser: z.boolean(),
  partnerToken: z.string().optional(),
});

export type ConfigAddress = z.infer<typeof ConfigAddressSchema>;
const STRIPE_GERMAN_LOCALE = "de";

export const configRouter = createTRPCRouter({
  /** Admin-managed prices for the configurator's live estimate. */
  getPriceBook: publicProcedure.query(() => getPriceBook()),
  setupOrder: publicProcedure
    .input(
      z.object({
        details: ConfigDetailsSchema,
        orderAddress: ConfigAddressSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "config.setupOrder",
        maxRequests: 6,
        windowMs: 10 * 60 * 1000,
      });

      const { db } = ctx;

      const { details, orderAddress } = input;

      const { bookId, quantity, format, saveUser, isPickup, partnerToken } =
        details;
      if (partnerToken !== undefined) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Dieser Bestelllink ist nicht mehr verfügbar.",
        });
      }

      const existingBook = await db.book.findFirst({
        where: {
          id: bookId,
        },
        include: {
          modules: {
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

      if (
        !existingBook ||
        existingBook.deletedAt ||
        existingBook.clientRef === SCHOOL_ORDER_CLIENT ||
        existingBook.sourceType === "PARTNER_TEMPLATE"
      ) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "book doesn't exist. must order a book.",
        });
      }

      const sessionUserId = ctx.session?.user?.id;
      if (
        !canAccessBookForSetupOrder({
          bookOwnerId: existingBook.createdById,
          sessionUserId,
          bookSourceType: existingBook.sourceType,
          isPublic: existingBook.isPublic,
        })
      ) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }

      // One price book version for every amount in this checkout.
      const { priceBook, version: priceBookVersion } = await getPriceBook();

      const calculateBookCost = async (bookForCost: {
        bookTitle: string | null;
        planStart: Date;
        planEnd: Date | null;
        region: string | null;
        country: string;
        modules: Array<{
          id: string;
          idx: number;
          colorCode: "COLOR" | "GRAYSCALE" | null;
          module: {
            name: string;
            theme: string | null;
            part: string;
            type: { name: string };
            files: Array<{
              name: string | null;
              src: string;
              type: string;
              pageCount?: number | null;
            }>;
          };
        }>;
      }) => {
        const moduleColorMap = new Map<ModuleId, ColorCode>();
        const pdfModules = bookForCost.modules.map((moduleItem) => {
          const type = moduleItem.module.type.name;
          const pdfFile = pickModulePdfFile(moduleItem.module.files);
          const rawPdfUrl = pdfFile?.src ?? "/storage/notizen.pdf";
          const coverImageFile = pickCoverImageFile(moduleItem.module.files);
          const coverImageUrl = coverImageFile
            ? cdnAssetUrl(coverImageFile.src)
            : undefined;

          const pdfUrl = cdnAssetUrl(rawPdfUrl);
          moduleColorMap.set(
            moduleItem.id,
            moduleItem.colorCode === "COLOR" ? 4 : 1,
          );

          return {
            id: moduleItem.id,
            idx: moduleItem.idx,
            type,
            pdfUrl,
            coverImageUrl,
            pageCount: pdfFile?.pageCount ?? null,
          };
        });

        const pageCounts = await calculatePdfPageCounts(
          {
            title: bookForCost.bookTitle ?? "Schulplaner",
            period: {
              start: bookForCost.planStart,
              end: bookForCost.planEnd ?? undefined,
            },
            code: bookForCost.region ?? "DE-SL",
            country: bookForCost.country ?? "DE",
            addHolidays: true,
          },
          pdfModules,
          {
            colorMap: moduleColorMap,
          },
        );

        const bindingModules = bookForCost.modules.filter((moduleItem) => {
          const moduleType = moduleItem.module.type.name.toLowerCase();
          const modulePart = moduleItem.module.part.toUpperCase();
          return modulePart === "BINDING" || moduleType === "bindung";
        });

        const getBindingRuleKeyCandidates = (moduleItem: {
          name: string;
          theme: string | null;
        }) =>
          [moduleItem.theme?.toLocaleLowerCase(), moduleItem.name].filter(
            (val): val is string => Boolean(val && val.trim().length > 0),
          );

        const getMatchedBindingRuleKey = (moduleItem: {
          name: string;
          theme: string | null;
        }) =>
          getBindingRuleKeyCandidates(moduleItem).find(
            (candidate) =>
              getBindingLimitMessage(candidate, pageCounts.fullPageCount) !==
              null,
          );

        const selectedBindingRuleKey = bindingModules[0]
          ? (getMatchedBindingRuleKey(bindingModules[0].module) ??
            bindingModules[0].module.theme?.toLocaleLowerCase() ??
            bindingModules[0].module.name)
          : undefined;

        for (const moduleItem of bindingModules) {
          const bindingRuleKey =
            getMatchedBindingRuleKey(moduleItem.module) ??
            moduleItem.module.theme?.toLocaleLowerCase() ??
            moduleItem.module.name;
          if (
            !isBindingAllowedForTotalPages(
              bindingRuleKey,
              pageCounts.fullPageCount,
            )
          ) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message:
                getBindingLimitMessage(
                  bindingRuleKey,
                  pageCounts.fullPageCount,
                ) ??
                "Die gewählte Bindung ist für die aktuelle Seitenzahl nicht verfügbar.",
            });
          }
        }

        return calculatePrintCost({
          amount: quantity,
          bPages: pageCounts.bPages,
          cPages: pageCounts.cPages,
          format,
          bindingName: selectedBindingRuleKey,
          priceBook,
        });
      };

      const existingUser = await db.user.findUnique({
        where: {
          email: orderAddress.email,
        },
      });

      let estimatedCost: { single: number; total: number };
      try {
        estimatedCost = await calculateBookCost(existingBook);
      } catch (e) {
        logger.error("config_setup_order_cost_calculation_failed", {
          bookId: existingBook.id,
          error: e,
        });
        if (e instanceof TRPCError) {
          throw e;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "PDF PROCESSING ERROR",
        });
      }

      const unitAmountCents = estimatedCost.total;

      let createdUser: Awaited<ReturnType<typeof db.user.create>> | undefined;
      if (!existingUser && saveUser) {
        createdUser = await db.user.create({
          data: {
            email: orderAddress.email,
          },
        });
      }

      const existingCustomers = await stripeClient.customers.list({
        email: orderAddress.email,
        limit: 1,
      });
      const existingCustomer = existingCustomers.data[0];

      let customer: Stripe.Customer | Stripe.DeletedCustomer | undefined;
      if (existingCustomer) {
        customer = await stripeClient.customers.update(existingCustomer.id, {
          preferred_locales: [STRIPE_GERMAN_LOCALE],
        });
      } else {
        const address = toStripeAddress(orderAddress);
        const shipping = {
          address: toStripeAddress(orderAddress),
          name: `${orderAddress.title !== undefined ? `${orderAddress.title} ` : null} ${orderAddress.prename} ${orderAddress.name}`,
          phone: orderAddress.phone,
        };

        // Customer does not exist, create a new one
        customer = await stripeClient.customers.create({
          email: orderAddress.email,
          address,
          shipping,
          preferred_locales: [STRIPE_GERMAN_LOCALE],
          metadata: {
            userId: existingUser?.id ?? createdUser?.id ?? "guest-user",
          },
        });
      }

      if (!customer) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "something went wrong. try again later.",
        });
      }

      let createdPayment: Awaited<ReturnType<typeof db.payment.create>> | null =
        null;
      let createdOrderId = "";

      try {
        createdPayment = await db.payment.create({
          data: {
            price: unitAmountCents,
          },
        });

        createdOrderId = await cloneBookForOrder(
          existingBook.id,
          createdPayment.id,
          quantity,
        );
      } catch (error) {
        if (createdPayment?.id) {
          await db.payment
            .delete({
              where: { id: createdPayment.id },
            })
            .catch(() => undefined);
        }
        throw error;
      }

      const cancelKey = createCancelKey(createdOrderId);

      const cancelParams = encryptPayload({
        bookId: existingBook.id,
        orderId: createdOrderId,
        cancelKey,
      });

      const checkoutMetadata: Record<string, string> = {
        orderId: createdOrderId,
        priceBookVersion: String(priceBookVersion),
      };

      if (unitAmountCents <= 0) {
        const createdOrder = await db.$transaction(async (tx) => {
          await tx.payment.update({
            where: {
              id: createdPayment.id,
            },
            data: {
              cancelKey,
              status: "SUCCEEDED",
              total: 0,
              shippingCost: 0,
              bookOrder: {
                connect: {
                  id: createdOrderId,
                },
              },
            },
          });

          const createdOrderRecord = await tx.order.create({
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
                  id: createdOrderId,
                },
              },
            },
          });

          const createdOrderKey = createOrderKey(createdOrderRecord.id);
          await tx.order.update({
            where: {
              id: createdOrderRecord.id,
            },
            data: {
              orderKey: createdOrderKey,
            },
          });
          return {
            id: createdOrderRecord.id,
            orderKey: createdOrderKey,
          };
        });

        try {
          const appOrigin = getAppOriginFromHeaders(ctx.headers);
          const html = await createOrderConfirmationEmail(
            createdOrder.orderKey,
            `${orderAddress.prename} ${orderAddress.name}`.trim(),
            appOrigin,
          );
          await sendOrderVerification(
            orderAddress.email,
            "Bestellung bestätigt - Pirrot",
            html,
          );
        } catch (emailError) {
          logger.error("direct_checkout_confirmation_email_failed", {
            orderId: createdOrder.id,
            error: emailError,
          });
        }

        const orderPayload = encryptPayload({
          orderKey: createdOrder.orderKey,
        });
        return {
          redirect_url: `/payment/success?order_ref=${encodeURIComponent(
            orderPayload,
          )}&flow=direct`,
        };
      }

      const baseParams: Stripe.Checkout.SessionCreateParams = {
        mode: "payment",
        locale: STRIPE_GERMAN_LOCALE,
        customer: customer.id,
        success_url: `${env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.STRIPE_CANCEL_URL}?q=${cancelParams}`,
        invoice_creation: { enabled: true },
        billing_address_collection: "required",
        customer_update: {
          address: "auto",
          name: "auto",
          shipping: "auto",
        },
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "eur",
              tax_behavior: "inclusive",
              product_data: {
                name: existingBook.name ?? existingBook.id,
                description: "Planer von pirrot.de",
                tax_code: "txcd_20090028",
              },
              unit_amount: unitAmountCents,
            },
          },
        ],
        automatic_tax: { enabled: true },
        metadata: checkoutMetadata,
      };

      const sessionParams = isPickup
        ? {
            ...baseParams,

            phone_number_collection: { enabled: true },
          }
        : ({
            ...baseParams,
            shipping_address_collection: {
              allowed_countries: ["DE", "AT", "NL", "LU", "FR", "ES", "IT"],
            },

            shipping_options: [
              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  tax_behavior: "inclusive",
                  fixed_amount: {
                    amount: priceBook.shipping.standardCents,
                    currency: "eur",
                  },
                  display_name: "Standardversand",
                  delivery_estimate: {
                    minimum: { unit: "business_day", value: 14 },
                    maximum: { unit: "business_day", value: 21 },
                  },
                },
              },

              {
                shipping_rate_data: {
                  type: "fixed_amount",
                  tax_behavior: "inclusive",
                  fixed_amount: {
                    amount: priceBook.shipping.expressCents,
                    currency: "eur",
                  },
                  display_name: "Expressversand",
                  delivery_estimate: {
                    minimum: { unit: "business_day", value: 7 },
                    maximum: { unit: "business_day", value: 10 },
                  },
                },
              },
            ],
          } as Stripe.Checkout.SessionCreateParams);

      let checkout;
      try {
        checkout = await stripeClient.checkout.sessions.create(sessionParams, {
          idempotencyKey: `checkout_session_${createdPayment.id}`,
        });
      } catch (error) {
        logger.error("stripe_checkout_session_create_failed", {
          paymentId: createdPayment.id,
          orderId: createdOrderId,
          error,
        });
        await db.payment
          .update({
            where: { id: createdPayment.id },
            data: { status: "FAILED", cancelKey },
          })
          .catch(() => undefined);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create checkout session",
        });
      }

      await db.payment.update({
        where: {
          id: createdPayment.id,
        },
        data: {
          cancelKey,
          shopId: checkout.id,
          bookOrder: {
            connect: {
              id: createdOrderId,
            },
          },
        },
      });

      return { checkout_session: checkout.url };
    }),
  init: publicProcedure
    .input(
      z.object({
        bookId: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { db } = ctx;
      const { bookId } = input;

      const existingBook = await db.book.findFirst({
        where: {
          id: bookId,
          deletedAt: null,
        },
        include: {
          partnerClaim: {
            select: {
              userId: true,
            },
          },
          modules: {
            include: {
              module: true,
            },
            orderBy: {
              idx: "asc",
            },
          },
          customDates: true,
        },
      });

      if (existingBook?.clientRef === SCHOOL_ORDER_CLIENT) return null;
      const sessionUserId = ctx.session?.user?.id;
      const canAccessExistingBook = !existingBook
        ? true
        : canAccessBookForSetupOrder({
            bookOwnerId: existingBook.createdById,
            sessionUserId,
            bookSourceType: existingBook.sourceType,
            partnerClaimUserId: existingBook.partnerClaim?.userId,
            isPublic: existingBook.isPublic,
          });

      if (!canAccessExistingBook) {
        return null;
      }

      let hydratedBook:
        | (NonNullable<typeof existingBook> & {
            partnerCampaignExpiresAt?: Date | null;
            partnerOrderSubmittedAt?: Date | null;
            partnerOrderStatus?: string | null;
          })
        | null = existingBook;
      if (
        existingBook?.sourceType === "PARTNER_TEMPLATE" &&
        existingBook.partnerPromotionCodeId
      ) {
        const [campaign, partnerOrder] = await Promise.all([
          db.campaign.findUnique({
            where: { promotionCodeId: existingBook.partnerPromotionCodeId },
            select: { expiresAt: true },
          }),
          db.partnerOrder.findUnique({
            where: { bookId: existingBook.id },
            select: { submittedAt: true, status: true },
          }),
        ]);

        hydratedBook = {
          ...existingBook,
          partnerCampaignExpiresAt: campaign?.expiresAt ?? null,
          partnerOrderSubmittedAt: partnerOrder?.submittedAt ?? null,
          partnerOrderStatus: partnerOrder?.status ?? null,
        };
      }

      const userId = sessionUserId;
      const existingBookModuleIds = Array.from(
        new Set(
          (existingBook?.modules ?? []).map(
            (moduleItem) => moduleItem.moduleId,
          ),
        ),
      );

      const combinedModules = await db.module.findMany({
        where: {
          deletedAt: null,
          OR: [
            ...(buildModuleFeedVisibilityWhere(userId).OR ?? []),
            ...(existingBookModuleIds.length > 0
              ? [{ id: { in: existingBookModuleIds } }]
              : []),
          ],
        },
        orderBy: {
          createdAt: "asc",
        },
        include: {
          _count: {
            select: {
              books: {
                where: {
                  book: {
                    isTemplate: false,
                    ordered: {
                      some: {
                        order: {
                          deletedAt: null,
                          canceledAt: null,
                          status: { in: ["PENDING", "COMPLETED", "SHIPPED"] },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          type: true,
          files: true,
        },
      });

      const moduleResponse = combinedModules.map((moduleItem) => {
        const { id, name, theme, files, type, part, createdAt } = moduleItem;

        const thumbnailFile = files.find((f) => f.name?.startsWith("thumb_"));
        const moduleFile = pickModulePdfFile(files);
        const coverImageFile = pickCoverImageFile(files);

        const thumbnail = cdnAssetUrl(
          (thumbnailFile ?? coverImageFile)?.src ?? "/default.png",
        );
        const url = cdnAssetUrl(moduleFile?.src ?? "/storage/notizen.pdf");
        const coverImageUrl = coverImageFile
          ? cdnAssetUrl(coverImageFile.src)
          : null;
        const grayscaleSrc = moduleFile?.srcGrayscale ?? null;
        const grayscalePdfUrl = grayscaleSrc ? cdnAssetUrl(grayscaleSrc) : null;

        return {
          id,
          name,
          theme,
          part,
          type: type.name,
          thumbnail,
          url,
          coverImageUrl,
          pageCount: moduleFile?.pageCount ?? null,
          grayscalePdfUrl,
          createdAt,
          booksCount: moduleItem._count.books,
        };
      });

      const existingTypes = await db.moduleType.findMany({
        where: {
          name: {
            notIn: ["custom"],
          },
        },
      });
      const existingTips = await db.tooltip.findMany();

      return {
        modules: moduleResponse.sort((a, b) => a.booksCount - b.booksCount),
        book: hydratedBook,
        types: existingTypes.map((t) => ({ id: t.id, name: t.name })),
        tips: existingTips.map((tip) => ({
          id: tip.id,
          title: tip.title,
          content: tip.tip,
        })),
      };
    }),
});
