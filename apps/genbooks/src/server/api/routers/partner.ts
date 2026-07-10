import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { PartnerOrderStatus, PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { Naming } from "@/util/naming";
import {
  createTRPCRouter,
  protectedProcedure,
  publicProcedure,
} from "@/server/api/trpc";
import { stripeClient } from "@/util/stripe";
import { getStripeV2CoreClient } from "@/util/stripe-connect";
import { env } from "@/env";
import {
  createPartnerCampaignLinkToken,
  createPartnerCheckoutToken,
  type PartnerCampaignLinkClaims,
  verifyPartnerToken,
} from "@/util/partner-link";
import { logger } from "@/util/logger";
import { enforceProcedureRateLimit } from "@/util/rate-limit";
import { pickCoverImageFile, pickModulePdfFile } from "@/util/module-files";
import {
  createPartnerClaimToken,
  getPartnerClaimExpiry,
  hashPartnerClaimToken,
  maskEmail,
} from "@/util/partner-claim";
import { sendOrderVerification } from "@/util/order/functions";
import { createOrderConfirmationEmail } from "@/util/order/templates/create-validation-order";
import { createPartnerSchoolInvoice } from "@/util/partner-program/invoices";
import {
  buildReleaseDispatchKey,
  canTransitionPartnerOrderStatus,
  createPartnerCorrelationId,
  recordPartnerOrderTransition,
} from "@/util/partner-program/transitions";
import {
  isPartnerControlledFulfillmentEnabled,
  isPartnerSettlementEnabled,
} from "@/util/partner-program/flags";
import { buildAppUrl, getAppOriginFromHeaders } from "@/util/app-origin";

const STRIPE_CONNECT_PROVIDER = "stripe_connect";
const STRIPE_GERMAN_LOCALE = "de";
const ACTIVE_PARTNER_SUBSCRIPTION_STATUSES = new Set(["active", "trialing"]);
const PARTNER_SUBSCRIPTION_PRICE_LABEL = "Monat/Jahr";

const CAMPAIGN_KIND = "partner_campaign";
const CAMPAIGN_PROMO_CODE_REGEX = /^[A-Z0-9-_]{6,32}$/;
const SECONDS_IN_DAY = 24 * 60 * 60;
const DEFAULT_CAMPAIGN_VALID_DAYS = 90;
const MIN_CAMPAIGN_VALID_DAYS = 1;
const MAX_CAMPAIGN_VALID_DAYS = 365;
const DEFAULT_CAMPAIGN_MAX_REDEMPTIONS = 10;
const MAX_CAMPAIGN_MAX_REDEMPTIONS = 1000;
const PARTNER_CLAIM_VERIFY_SCOPE = "partner.claim.verify";

type StripeV2Entity = Record<string, unknown>;
type PartnerSubscriptionState = {
  status: string | null;
  priceId: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  latestSubscriptionId: string | null;
};

type PartnerSubscriptionPriceOption = {
  id: string;
  interval: "month" | "year" | null;
  unitAmount: number | null;
  currency: string | null;
};

type SettlementCycleWindow = {
  cycleYear: number;
  cycleMonth: number;
  cycleStart: Date;
  cycleEnd: Date;
};

function normalizePromoCode(input: string): string {
  return input.trim().toUpperCase();
}

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function randomPromoCode(prefix = "SP"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 8; i++) {
    random += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return `${prefix}-${random}`;
}

function assertPartnerRole(
  role: "ADMIN" | "STAFF" | "MODERATOR" | "USER" | "SPONSOR" | "PARTNER",
) {
  if (
    role !== "PARTNER" &&
    role !== "SPONSOR" &&
    role !== "ADMIN" &&
    role !== "STAFF"
  ) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Partner-Konto erforderlich",
    });
  }
}

function resolveSettlementCycleWindow(input?: {
  cycleYear?: number;
  cycleMonth?: number;
}): SettlementCycleWindow {
  const now = new Date();
  const cycleYear = input?.cycleYear ?? now.getUTCFullYear();
  const cycleMonth = input?.cycleMonth ?? now.getUTCMonth() + 1;
  const cycleStart = new Date(Date.UTC(cycleYear, cycleMonth - 1, 1, 0, 0, 0));
  const cycleEnd = new Date(Date.UTC(cycleYear, cycleMonth, 1, 0, 0, 0));
  return {
    cycleYear,
    cycleMonth,
    cycleStart,
    cycleEnd,
  };
}

function readSettlementAmountsFromLineItems(lineItemsSnapshot: unknown): {
  baseTotalAmount: number;
  addOnTotalAmount: number;
} {
  const lineItems =
    lineItemsSnapshot &&
    typeof lineItemsSnapshot === "object" &&
    !Array.isArray(lineItemsSnapshot)
      ? (lineItemsSnapshot as Record<string, unknown>)
      : {};

  const baseRaw = lineItems.baseTotalAmount;
  const addOnRaw = lineItems.addOnTotalAmount;

  return {
    baseTotalAmount: typeof baseRaw === "number" ? baseRaw : 0,
    addOnTotalAmount: typeof addOnRaw === "number" ? addOnRaw : 0,
  };
}

function buildSettlementSummary(orders: Array<{ lineItemsSnapshot: unknown }>) {
  const totals = orders.reduce(
    (acc, order) => {
      const amounts = readSettlementAmountsFromLineItems(
        order.lineItemsSnapshot,
      );
      acc.baseTotalAmount += amounts.baseTotalAmount;
      acc.addOnTotalAmount += amounts.addOnTotalAmount;
      return acc;
    },
    {
      baseTotalAmount: 0,
      addOnTotalAmount: 0,
    },
  );
  return {
    ...totals,
    grandTotalAmount: totals.baseTotalAmount + totals.addOnTotalAmount,
  };
}

function isUnknownPartnerUserIdArgumentError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return (
    message.includes("Unknown argument `partnerUserId`") ||
    message.includes('Unknown argument "partnerUserId"')
  );
}

function isUniqueBookPartnerClaimError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = "code" in error ? String(error.code) : "";
  if (code !== "P2002") {
    return false;
  }
  const message =
    "message" in error && typeof error.message === "string"
      ? error.message
      : "";
  return (
    message.includes("Book_partnerClaimId_key") ||
    message.includes("partnerClaimId")
  );
}

async function createCampaignRecord(
  db: PrismaClient,
  input: {
    userId: string;
    templateId: string;
    snapshotBookId: string;
    promotionCodeId: string;
    maxRedemptions: number;
    expiresAt: Date | null;
  },
) {
  try {
    await db.campaign.create({
      data: {
        partnerUserId: input.userId,
        templateId: input.templateId,
        snapshotBookId: input.snapshotBookId,
        promotionCodeId: input.promotionCodeId,
        maxRedemptions: input.maxRedemptions,
        expiresAt: input.expiresAt,
      },
    });
  } catch (error) {
    if (!isUnknownPartnerUserIdArgumentError(error)) {
      throw error;
    }
    await (
      db.campaign as unknown as { create: (args: unknown) => Promise<unknown> }
    ).create({
      data: {
        sponsorUserId: input.userId,
        templateId: input.templateId,
        snapshotBookId: input.snapshotBookId,
        promotionCodeId: input.promotionCodeId,
        maxRedemptions: input.maxRedemptions,
        expiresAt: input.expiresAt,
      },
    });
  }
}

async function findCampaignsByPartnerUserId(db: PrismaClient, userId: string) {
  try {
    return await db.campaign.findMany({
      where: { partnerUserId: userId },
    });
  } catch (error) {
    if (!isUnknownPartnerUserIdArgumentError(error)) {
      throw error;
    }
    return await (
      db.campaign as unknown as {
        findMany: (args: unknown) => Promise<
          Array<{
            promotionCodeId: string;
            timesRedeemed: number;
            maxRedemptions: number;
          }>
        >;
      }
    ).findMany({
      where: { sponsorUserId: userId },
    });
  }
}

function hasPartnerOrderModel(db: PrismaClient): boolean {
  return Boolean((db as unknown as Record<string, unknown>).partnerOrder);
}

function hasPartnerNotificationModel(db: PrismaClient): boolean {
  return Boolean(
    (db as unknown as Record<string, unknown>).partnerNotification,
  );
}

async function getCanceledCampaignRedemptionsMap(
  db: PrismaClient,
  partnerUserId: string,
  promotionCodeIds: string[],
): Promise<Map<string, number>> {
  if (promotionCodeIds.length === 0 || !hasPartnerOrderModel(db)) {
    return new Map();
  }

  const partnerOrders = await db.partnerOrder.findMany({
    where: {
      partnerUserId,
      sourceCampaignId: {
        in: promotionCodeIds,
      },
    },
    select: {
      sourceCampaignId: true,
      status: true,
      order: {
        select: {
          status: true,
        },
      },
    },
  });

  const counts = new Map<string, number>();
  for (const partnerOrder of partnerOrders) {
    const campaignId = partnerOrder.sourceCampaignId;
    if (!campaignId) continue;
    const isCanceledActivation =
      partnerOrder.status === "PARTNER_DECLINED" ||
      partnerOrder.order?.status === "CANCELED";
    if (!isCanceledActivation) continue;
    counts.set(campaignId, (counts.get(campaignId) ?? 0) + 1);
  }
  return counts;
}

function getOnboardingUrls(appOrigin: string) {
  return {
    refresh_url: buildAppUrl(
      appOrigin,
      "/dashboard?view=profil&partner_refresh=1",
    ),
    return_url: buildAppUrl(
      appOrigin,
      "/dashboard?view=profil&partner_return=1",
    ),
  };
}

function getSubscriptionSuccessUrl(appOrigin: string) {
  return buildAppUrl(appOrigin, "/dashboard?view=profil&partner_sub=success");
}

function getSubscriptionCancelUrl(appOrigin: string) {
  return buildAppUrl(appOrigin, "/dashboard?view=profil&partner_sub=cancel");
}

function getSubscriptionManageReturnUrl(appOrigin: string) {
  return buildAppUrl(appOrigin, "/dashboard?view=profil&partner_sub=manage");
}

function getConfiguredSubscriptionPriceIds(): string[] {
  const monthlyPriceId =
    env.STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID?.trim();
  const yearlyPriceId = env.STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID?.trim();

  return [
    ...new Set([monthlyPriceId, yearlyPriceId].filter(Boolean) as string[]),
  ];
}

function getConfiguredSubscriptionPriceIdsOrThrow(): string[] {
  const configuredPriceIds = getConfiguredSubscriptionPriceIds();
  if (configuredPriceIds.length === 0) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "Missing subscription price config. Set STRIPE_CONNECT_SUBSCRIPTION_MONTHLY_PRICE_ID and/or STRIPE_CONNECT_SUBSCRIPTION_YEARLY_PRICE_ID.",
    });
  }

  return configuredPriceIds;
}

async function getConfiguredSubscriptionPriceOptions(
  configuredPriceIds: string[],
): Promise<PartnerSubscriptionPriceOption[]> {
  return Promise.all(
    configuredPriceIds.map(async (priceId) => {
      try {
        const price = await stripeClient.prices.retrieve(priceId);
        const interval = price.recurring?.interval;
        return {
          id: price.id,
          interval:
            interval === "month" || interval === "year" ? interval : null,
          unitAmount: price.unit_amount ?? null,
          currency: price.currency ?? null,
        };
      } catch (error) {
        logger.error("partner_subscription_price_lookup_failed", {
          priceId,
          error,
        });
        return {
          id: priceId,
          interval: null,
          unitAmount: null,
          currency: null,
        };
      }
    }),
  );
}

function isPartnerSubscriptionActive(
  snapshot: PartnerSubscriptionState,
  requiredPriceIds: readonly string[],
): boolean {
  if (!snapshot.status) {
    return false;
  }

  if (!ACTIVE_PARTNER_SUBSCRIPTION_STATUSES.has(snapshot.status)) {
    return false;
  }

  return (
    typeof snapshot.priceId === "string" &&
    requiredPriceIds.includes(snapshot.priceId)
  );
}

async function getLivePartnerSubscriptionState(
  _db: PrismaClient,
  userId: string,
  email: string | null | undefined,
  requiredPriceIds: readonly string[],
): Promise<PartnerSubscriptionState> {
  if (!email) {
    return {
      status: null,
      priceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestSubscriptionId: null,
    };
  }

  const customerList = await stripeClient.customers.list({
    email,
    limit: 100,
  });
  const customers = customerList.data;

  if (customers.length === 0) {
    return {
      status: null,
      priceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestSubscriptionId: null,
    };
  }

  const subscriptionLists: Stripe.ApiList<Stripe.Subscription>[] =
    await Promise.all(
      customers.map((customer) =>
        stripeClient.subscriptions.list({
          customer: customer.id,
          status: "all",
          limit: 100,
        }),
      ),
    );

  const subscriptions = {
    data: subscriptionLists.flatMap(
      (subscriptionList) => subscriptionList.data,
    ),
  };

  const withPrice = subscriptions.data
    .map((subscription) => {
      const firstItem = subscription.items.data[0];
      const priceId = firstItem?.price?.id ?? null;
      return {
        subscription,
        priceId,
      };
    })
    .filter(
      (
        entry,
      ): entry is { subscription: Stripe.Subscription; priceId: string } =>
        typeof entry.priceId === "string" &&
        requiredPriceIds.includes(entry.priceId),
    );

  if (withPrice.length === 0) {
    return {
      status: null,
      priceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestSubscriptionId: null,
    };
  }

  const userTagged = withPrice.filter(
    (entry) => entry.subscription.metadata?.partnerUserId === userId,
  );
  const candidatePool = userTagged.length > 0 ? userTagged : withPrice;

  const activeCandidate = candidatePool
    .filter((entry) =>
      ACTIVE_PARTNER_SUBSCRIPTION_STATUSES.has(entry.subscription.status),
    )
    .sort((a, b) => b.subscription.created - a.subscription.created)[0];

  const selected =
    activeCandidate ??
    candidatePool.sort(
      (a, b) => b.subscription.created - a.subscription.created,
    )[0];

  const selectedSubscription = selected?.subscription;
  if (!selectedSubscription) {
    return {
      status: null,
      priceId: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      latestSubscriptionId: null,
    };
  }

  return {
    status: selectedSubscription.status ?? null,
    priceId: selected.priceId,
    currentPeriodEnd:
      asNumber(
        (selectedSubscription as unknown as Record<string, unknown>)
          .current_period_end,
      ) ?? null,
    cancelAtPeriodEnd: selectedSubscription.cancel_at_period_end ?? false,
    latestSubscriptionId: selectedSubscription.id ?? null,
  };
}

async function findOrCreatePlatformCustomer(params: {
  email: string;
  name?: string;
  metadata?: Record<string, string>;
}) {
  const existing = await stripeClient.customers.list({
    email: params.email,
    limit: 1,
  });

  if (existing.data[0]) {
    return stripeClient.customers.update(existing.data[0].id, {
      preferred_locales: [STRIPE_GERMAN_LOCALE],
      ...(params.name ? { name: params.name } : {}),
      ...(params.metadata ? { metadata: params.metadata } : {}),
    });
  }

  return stripeClient.customers.create({
    email: params.email,
    name: params.name,
    preferred_locales: [STRIPE_GERMAN_LOCALE],
    ...(params.metadata ? { metadata: params.metadata } : {}),
  });
}

function parseCampaignClaims(token: string): PartnerCampaignLinkClaims {
  const claims = verifyPartnerToken(token);
  if (claims.kind !== "campaign_link") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Invalid campaign link token",
    });
  }
  return claims;
}

function getConnectCountryOrThrow(input?: string): string {
  const configured = (input ?? env.STRIPE_CONNECT_COUNTRY ?? "AT")
    .trim()
    .toUpperCase();
  if (configured !== "AT" && configured !== "DE") {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        "Stripe Connect is currently available for Austria (AT) and Germany (DE).",
    });
  }
  return configured;
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function getCardPaymentsCapabilityStatus(
  account: StripeV2Entity,
): string | undefined {
  return asString(
    asObject(
      asObject(
        asObject(asObject(account.configuration)?.merchant)?.capabilities,
      )?.card_payments,
    )?.status,
  );
}

function getRequirementsStatus(account: StripeV2Entity): string | undefined {
  return asString(
    asObject(
      asObject(asObject(account.requirements)?.summary)?.minimum_deadline,
    )?.status,
  );
}

function getV2EntityId(entity: StripeV2Entity): string | undefined {
  return asString(entity.id);
}

function getV2LinkUrl(entity: StripeV2Entity): string | undefined {
  return asString(entity.url);
}

function getV2LinkExpiresAt(entity: StripeV2Entity): number | undefined {
  return asNumber(entity.expires_at);
}

function isPartnerCampaignForUser(
  campaign: { metadata: Record<string, string> | null | undefined },
  userId: string,
): boolean {
  const metadata = campaign.metadata ?? {};
  const kind = metadata.kind ?? "";
  const ownerId = metadata.partnerUserId ?? "";
  return kind === CAMPAIGN_KIND && ownerId === userId;
}

async function getConnectAccountStatus(stripeAccountId: string) {
  // Always fetch account status directly from Stripe API for current truth.
  const v2Core = getStripeV2CoreClient();
  const account = await v2Core.accounts.retrieve(stripeAccountId, {
    include: ["configuration.merchant", "requirements"],
  });
  const readyToProcessPayments =
    getCardPaymentsCapabilityStatus(account) === "active";
  const requirementsStatus = getRequirementsStatus(account);

  const onboardingComplete =
    requirementsStatus !== "currently_due" && requirementsStatus !== "past_due";

  return {
    account,
    readyToProcessPayments,
    onboardingComplete,
    requirementsStatus,
  };
}

export const partnerRouter = createTRPCRouter({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
        role: true,
        accounts: {
          where: { provider: STRIPE_CONNECT_PROVIDER },
          select: { providerAccountId: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    let effectiveRole = user.role;
    const mappedAccountId = user.accounts[0]?.providerAccountId;
    const configuredSubscriptionPriceIds = getConfiguredSubscriptionPriceIds();
    const configuredSubscriptionPriceId =
      configuredSubscriptionPriceIds[0] ?? null;
    const configuredSubscriptionPriceOptions =
      configuredSubscriptionPriceIds.length > 0
        ? await getConfiguredSubscriptionPriceOptions(
            configuredSubscriptionPriceIds,
          )
        : [];
    let stripeAccount:
      | {
          id: string;
          readyToProcessPayments: boolean;
          onboardingComplete: boolean;
          requirementsStatus?: string;
          capabilitiesStatus?: string;
        }
      | undefined;
    let subscription:
      | {
          requiredPriceConfigured: boolean;
          configuredPriceId: string | null;
          configuredPriceIds: string[];
          configuredPriceOptions: PartnerSubscriptionPriceOption[];
          status: string | null;
          priceId: string | null;
          currentPeriodEnd: number | null;
          cancelAtPeriodEnd: boolean;
          latestSubscriptionId: string | null;
          isActive: boolean;
        }
      | undefined;

    if (mappedAccountId) {
      const status = await getConnectAccountStatus(mappedAccountId);
      const capabilitiesStatus =
        getCardPaymentsCapabilityStatus(status.account) ?? "unknown";

      stripeAccount = {
        id: getV2EntityId(status.account) ?? mappedAccountId,
        readyToProcessPayments: status.readyToProcessPayments,
        onboardingComplete: status.onboardingComplete,
        requirementsStatus: status.requirementsStatus,
        capabilitiesStatus,
      };

      if (status.onboardingComplete && effectiveRole !== "PARTNER") {
        await ctx.db.user.update({
          where: { id: user.id },
          data: { role: "PARTNER" },
        });
        effectiveRole = "PARTNER";
      }

      const storedSubscription = await getLivePartnerSubscriptionState(
        ctx.db,
        user.id,
        user.email,
        configuredSubscriptionPriceIds,
      );
      subscription = {
        requiredPriceConfigured: Boolean(configuredSubscriptionPriceId),
        configuredPriceId: configuredSubscriptionPriceId,
        configuredPriceIds: configuredSubscriptionPriceIds,
        configuredPriceOptions: configuredSubscriptionPriceOptions,
        status: storedSubscription.status,
        priceId: storedSubscription.priceId,
        currentPeriodEnd: storedSubscription.currentPeriodEnd,
        cancelAtPeriodEnd: storedSubscription.cancelAtPeriodEnd,
        latestSubscriptionId: storedSubscription.latestSubscriptionId,
        isActive:
          configuredSubscriptionPriceId != null &&
          isPartnerSubscriptionActive(
            storedSubscription,
            configuredSubscriptionPriceIds,
          ),
      };
    }

    const storedSubscription = await getLivePartnerSubscriptionState(
      ctx.db,
      user.id,
      user.email,
      configuredSubscriptionPriceIds,
    );

    return {
      role: effectiveRole,
      isPartner: effectiveRole === "PARTNER",
      hasConnectAccount: Boolean(mappedAccountId),
      onboardingComplete: stripeAccount?.onboardingComplete ?? false,
      readyToProcessPayments: stripeAccount?.readyToProcessPayments ?? false,
      stripeAccount,
      subscription: {
        requiredPriceConfigured: Boolean(configuredSubscriptionPriceId),
        configuredPriceId: configuredSubscriptionPriceId,
        configuredPriceIds: configuredSubscriptionPriceIds,
        configuredPriceOptions: configuredSubscriptionPriceOptions,
        status: subscription?.status ?? storedSubscription.status,
        priceId: subscription?.priceId ?? storedSubscription.priceId,
        currentPeriodEnd:
          subscription?.currentPeriodEnd ?? storedSubscription.currentPeriodEnd,
        cancelAtPeriodEnd:
          subscription?.cancelAtPeriodEnd ??
          storedSubscription.cancelAtPeriodEnd,
        latestSubscriptionId:
          subscription?.latestSubscriptionId ??
          storedSubscription.latestSubscriptionId,
        isActive:
          configuredSubscriptionPriceId != null &&
          isPartnerSubscriptionActive(
            subscription ?? storedSubscription,
            configuredSubscriptionPriceIds,
          ),
      },
    };
  }),

  startConnectOnboarding: protectedProcedure
    .input(
      z.object({
        country: z.string().trim().toUpperCase().length(2).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        include: {
          accounts: {
            where: { provider: STRIPE_CONNECT_PROVIDER },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      const configuredSubscriptionPriceIds =
        getConfiguredSubscriptionPriceIdsOrThrow();
      const storedSubscription = await getLivePartnerSubscriptionState(
        ctx.db,
        user.id,
        user.email,
        configuredSubscriptionPriceIds,
      );
      if (
        !isPartnerSubscriptionActive(
          storedSubscription,
          configuredSubscriptionPriceIds,
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Aktives Partner-Programm-Abo erforderlich, bevor Stripe Connect gestartet werden kann.",
        });
      }

      let stripeAccountId = user.accounts[0]?.providerAccountId;
      const v2Core = getStripeV2CoreClient();
      const requestedCountry = getConnectCountryOrThrow(input.country);

      if (!stripeAccountId) {
        if (!user.email) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              "Missing user email. A contact email is required before creating a connected account.",
          });
        }

        // V2 Connected Account creation with the exact required properties.
        const account = await v2Core.accounts.create({
          display_name: user.name ?? `Partner ${user.id}`,
          contact_email: user.email,
          identity: {
            country: requestedCountry,
          },
          dashboard: "full",
          defaults: {
            locales: [STRIPE_GERMAN_LOCALE],
            responsibilities: {
              fees_collector: "stripe",
              losses_collector: "stripe",
            },
          },
          configuration: {
            customer: {},
            merchant: {
              capabilities: {
                card_payments: {
                  requested: true,
                },
              },
            },
          },
        });

        stripeAccountId = getV2EntityId(account) ?? "";
        if (!stripeAccountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Stripe did not return a connected account ID.",
          });
        }

        await ctx.db.account.create({
          data: {
            userId: user.id,
            type: "oauth",
            provider: STRIPE_CONNECT_PROVIDER,
            providerAccountId: stripeAccountId,
          },
        });
      }

      if (!stripeAccountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stripe did not return a connected account ID.",
        });
      }

      await v2Core.accounts.update(stripeAccountId, {
        defaults: {
          locales: [STRIPE_GERMAN_LOCALE],
        },
      });
      const appOrigin = getAppOriginFromHeaders(ctx.headers);

      // V2 account links API for onboarding.
      const accountLink = await v2Core.accountLinks.create({
        account: stripeAccountId,
        use_case: {
          type: "account_onboarding",
          account_onboarding: {
            configurations: ["merchant", "customer"],
            ...getOnboardingUrls(appOrigin),
          },
        },
      });

      const onboardingUrl = getV2LinkUrl(accountLink) ?? "";
      if (!onboardingUrl) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stripe did not return an onboarding URL.",
        });
      }

      const expiresAt = getV2LinkExpiresAt(accountLink);

      return {
        onboardingUrl,
        expiresAt,
      };
    }),

  finalizeConnectOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        role: true,
        accounts: {
          where: { provider: STRIPE_CONNECT_PROVIDER },
          select: { providerAccountId: true },
          take: 1,
        },
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    const stripeAccountId = user.accounts[0]?.providerAccountId;
    if (!stripeAccountId) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No Stripe Connect account linked",
      });
    }

    const status = await getConnectAccountStatus(stripeAccountId);

    if (status.onboardingComplete && user.role !== "PARTNER") {
      await ctx.db.user.update({
        where: { id: user.id },
        data: { role: "PARTNER" },
      });
    }

    return {
      onboardingComplete: status.onboardingComplete,
      readyToProcessPayments: status.readyToProcessPayments,
      requirementsStatus: status.requirementsStatus,
      role: status.onboardingComplete ? "PARTNER" : user.role,
      stripeAccountId: getV2EntityId(status.account) ?? stripeAccountId,
    };
  }),

  startSubscriptionCheckout: protectedProcedure
    .input(
      z.object({
        priceId: z.string().trim().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          email: true,
          name: true,
          accounts: {
            where: { provider: STRIPE_CONNECT_PROVIDER },
            select: { providerAccountId: true },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      if (!user.email) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "E-Mail-Adresse ist für das Partner-Programm-Abo erforderlich.",
        });
      }

      const stripeAccountId = user.accounts[0]?.providerAccountId;

      const configuredSubscriptionPriceIds =
        getConfiguredSubscriptionPriceIdsOrThrow();
      const subscriptionPriceId = input.priceId;
      if (!configuredSubscriptionPriceIds.includes(subscriptionPriceId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ungültige Partner-Programm-Preis-ID.",
        });
      }
      const storedSubscription = await getLivePartnerSubscriptionState(
        ctx.db,
        user.id,
        user.email,
        configuredSubscriptionPriceIds,
      );
      if (
        isPartnerSubscriptionActive(
          storedSubscription,
          configuredSubscriptionPriceIds,
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner-Programm-Abo ist bereits aktiv.",
        });
      }

      const customer = await findOrCreatePlatformCustomer({
        email: user.email,
        name: user.name ?? undefined,
        metadata: {
          partnerUserId: user.id,
          ...(stripeAccountId
            ? { partnerStripeAccountId: stripeAccountId }
            : {}),
        },
      });
      const appOrigin = getAppOriginFromHeaders(ctx.headers);

      const checkout = await stripeClient.checkout.sessions.create({
        mode: "subscription",
        locale: STRIPE_GERMAN_LOCALE,
        customer: customer.id,
        success_url: getSubscriptionSuccessUrl(appOrigin),
        cancel_url: getSubscriptionCancelUrl(appOrigin),
        billing_address_collection: "required",
        customer_update: {
          address: "auto",
          name: "auto",
        },
        line_items: [
          {
            price: subscriptionPriceId,
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            partnerUserId: user.id,
            ...(stripeAccountId
              ? { partnerStripeAccountId: stripeAccountId }
              : {}),
            partnerSubscriptionPriceId: subscriptionPriceId,
          },
        },
        metadata: {
          partnerFlow: "subscription",
          partnerUserId: user.id,
          ...(stripeAccountId
            ? { partnerStripeAccountId: stripeAccountId }
            : {}),
        },
        automatic_tax: { enabled: true },
      });

      if (!checkout.url) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Stripe did not return a subscription checkout URL.",
        });
      }

      return { checkoutUrl: checkout.url };
    }),

  openSubscriptionPortal: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    if (!user.email) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "E-Mail-Adresse ist für die Aboverwaltung erforderlich.",
      });
    }

    const customerList = await stripeClient.customers.list({
      email: user.email,
      limit: 1,
    });
    const customer = customerList.data[0];

    if (!customer) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Kein Partner-Programm-Abo-Kunde gefunden.",
      });
    }
    const appOrigin = getAppOriginFromHeaders(ctx.headers);

    const session = await stripeClient.billingPortal.sessions.create({
      customer: customer.id,
      return_url: getSubscriptionManageReturnUrl(appOrigin),
    });

    return { portalUrl: session.url };
  }),

  createCampaign: protectedProcedure
    .input(
      z.object({
        templateId: z.string(),
        promoCode: z.string().optional(),
        maxRedemptions: z
          .number()
          .int()
          .min(1)
          .max(MAX_CAMPAIGN_MAX_REDEMPTIONS)
          .default(DEFAULT_CAMPAIGN_MAX_REDEMPTIONS),
        validForDays: z
          .number()
          .int()
          .min(MIN_CAMPAIGN_VALID_DAYS)
          .max(MAX_CAMPAIGN_VALID_DAYS)
          .default(DEFAULT_CAMPAIGN_VALID_DAYS),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        include: {
          accounts: {
            where: { provider: STRIPE_CONNECT_PROVIDER },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      assertPartnerRole(user.role);

      const stripeAccountId = user.accounts[0]?.providerAccountId;
      if (!stripeAccountId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Complete Stripe Connect onboarding first",
        });
      }

      const status = await getConnectAccountStatus(stripeAccountId);
      if (!status.onboardingComplete || !status.readyToProcessPayments) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Stripe Connect onboarding is incomplete",
        });
      }

      const configuredSubscriptionPriceIds =
        getConfiguredSubscriptionPriceIdsOrThrow();
      const storedSubscription = await getLivePartnerSubscriptionState(
        ctx.db,
        user.id,
        user.email,
        configuredSubscriptionPriceIds,
      );
      if (
        !isPartnerSubscriptionActive(
          storedSubscription,
          configuredSubscriptionPriceIds,
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Aktives Partner-Programm-Abo erforderlich (${PARTNER_SUBSCRIPTION_PRICE_LABEL}).`,
        });
      }

      const template = await ctx.db.book.findFirst({
        where: {
          id: input.templateId,
          createdById: user.id,
          isTemplate: true,
          deletedAt: null,
        },
        include: {
          modules: true,
        },
      });

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Template not found",
        });
      }

      const snapshot = await ctx.db.book.create({
        data: {
          name: `partner-snapshot-${Date.now()}`,
          bookTitle: template.bookTitle,
          subTitle: template.subTitle,
          format: template.format,
          region: template.region,
          planStart: template.planStart,
          planEnd: template.planEnd,
          country: template.country,
          createdById: user.id,
          copyFromId: template.id,
          modules: {
            create: template.modules.map((moduleItem) => ({
              idx: moduleItem.idx,
              moduleId: moduleItem.moduleId,
              colorCode: moduleItem.colorCode,
            })),
          },
        },
      });

      const nowUnix = Math.floor(Date.now() / 1000);
      const expiresAt = nowUnix + input.validForDays * SECONDS_IN_DAY;
      const maxRedemptions = input.maxRedemptions;

      const codeFromInput = input.promoCode
        ? normalizePromoCode(input.promoCode)
        : undefined;
      let promoCode = codeFromInput ?? randomPromoCode();

      if (!CAMPAIGN_PROMO_CODE_REGEX.test(promoCode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Promo code format is invalid",
        });
      }

      let attempts = 0;
      while (attempts < 5) {
        const existingPromotionCodes = await stripeClient.promotionCodes.list({
          code: promoCode,
          active: true,
          limit: 1,
        });

        if (existingPromotionCodes.data.length === 0) {
          break;
        }

        if (codeFromInput) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Promo code already exists",
          });
        }

        promoCode = randomPromoCode();
        attempts += 1;
      }

      if (attempts >= 5) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not generate a unique promo code",
        });
      }

      const coupon = await stripeClient.coupons.create({
        duration: "once",
        percent_off: 100,
        max_redemptions: maxRedemptions,
        redeem_by: expiresAt,
        metadata: {
          kind: CAMPAIGN_KIND,
          partnerUserId: user.id,
          templateId: template.id,
          snapshotBookId: snapshot.id,
          partnerAccountId: stripeAccountId,
        },
      });

      const promotion = await stripeClient.promotionCodes.create({
        promotion: {
          type: "coupon",
          coupon: coupon.id,
        },
        code: promoCode,
        max_redemptions: maxRedemptions,
        expires_at: expiresAt,
        metadata: {
          kind: CAMPAIGN_KIND,
          partnerUserId: user.id,
          templateId: template.id,
          snapshotBookId: snapshot.id,
          partnerAccountId: stripeAccountId,
        },
      });

      await createCampaignRecord(ctx.db, {
        userId: user.id,
        templateId: template.id,
        snapshotBookId: snapshot.id,
        promotionCodeId: promotion.id,
        maxRedemptions: maxRedemptions,
        expiresAt: expiresAt ? new Date(expiresAt * 1000) : null,
      });

      const token = createPartnerCampaignLinkToken({
        partnerUserId: user.id,
        templateId: template.id,
        snapshotBookId: snapshot.id,
        promotionCodeId: promotion.id,
        exp: expiresAt,
      });

      return {
        campaignId: promotion.id,
        promoCode: promotion.code,
        expiresAt,
        maxRedemptions,
        templateId: template.id,
        snapshotBookId: snapshot.id,
        token,
      };
    }),

  listCampaigns: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { role: true },
    });

    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }

    assertPartnerRole(user.role);

    let dbCampaigns: Awaited<ReturnType<typeof findCampaignsByPartnerUserId>>;
    try {
      dbCampaigns = await findCampaignsByPartnerUserId(
        ctx.db,
        ctx.session.user.id,
      );
    } catch (error) {
      logger.error("partner_list_campaigns_db_failed", {
        userId: ctx.session.user.id,
        error,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Kampagnen konnten derzeit nicht geladen werden. Bitte erneut versuchen.",
      });
    }
    const dbCampaignMap = new Map(
      dbCampaigns.map((c) => [c.promotionCodeId, c]),
    );

    const campaigns = await stripeClient.promotionCodes.list({ limit: 100 });

    const filtered = campaigns.data.filter((campaign) =>
      isPartnerCampaignForUser(campaign, ctx.session.user.id),
    );
    const canceledByCampaign = await getCanceledCampaignRedemptionsMap(
      ctx.db,
      ctx.session.user.id,
      filtered.map((campaign) => campaign.id),
    );

    return filtered.map((campaign) => {
      const metadata = campaign.metadata ?? {};
      const expiresAt = campaign.expires_at ?? undefined;
      const token = createPartnerCampaignLinkToken({
        partnerUserId: metadata.partnerUserId ?? "",
        templateId: metadata.templateId ?? "",
        snapshotBookId: metadata.snapshotBookId ?? "",
        promotionCodeId: campaign.id,
        exp: expiresAt,
      });

      const dbCampaign = dbCampaignMap.get(campaign.id);
      const grossRedemptions = dbCampaign?.timesRedeemed ?? 0;
      const canceledRedemptions = canceledByCampaign.get(campaign.id) ?? 0;
      const activeRedemptions = Math.max(
        0,
        grossRedemptions - canceledRedemptions,
      );

      return {
        id: campaign.id,
        code: campaign.code,
        active: campaign.active,
        timesRedeemed: grossRedemptions,
        canceledRedemptions,
        activeRedemptions,
        maxRedemptions: campaign.max_redemptions,
        expiresAt,
        templateId: metadata.templateId ?? "",
        snapshotBookId: metadata.snapshotBookId ?? "",
        token,
      };
    });
  }),

  updateCampaign: protectedProcedure
    .input(
      z
        .object({
          campaignId: z.string().min(1),
          active: z.boolean().optional(),
          maxRedemptions: z
            .number()
            .int()
            .min(1)
            .max(MAX_CAMPAIGN_MAX_REDEMPTIONS)
            .optional(),
          validForDays: z
            .number()
            .int()
            .min(MIN_CAMPAIGN_VALID_DAYS)
            .max(MAX_CAMPAIGN_VALID_DAYS)
            .optional(),
        })
        .refine(
          (value) =>
            value.active !== undefined ||
            value.maxRedemptions !== undefined ||
            value.validForDays !== undefined,
          "No campaign updates provided",
        ),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          email: true,
          role: true,
          accounts: {
            where: { provider: STRIPE_CONNECT_PROVIDER },
            select: { providerAccountId: true },
            take: 1,
          },
        },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      assertPartnerRole(user.role);

      const requiresActiveSubscription =
        input.active !== false ||
        input.maxRedemptions !== undefined ||
        input.validForDays !== undefined;

      if (requiresActiveSubscription) {
        const stripeAccountId = user.accounts[0]?.providerAccountId;
        if (!stripeAccountId) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Complete Stripe Connect onboarding first",
          });
        }

        const configuredSubscriptionPriceIds =
          getConfiguredSubscriptionPriceIdsOrThrow();
        const storedSubscription = await getLivePartnerSubscriptionState(
          ctx.db,
          ctx.session.user.id,
          user.email,
          configuredSubscriptionPriceIds,
        );
        if (
          !isPartnerSubscriptionActive(
            storedSubscription,
            configuredSubscriptionPriceIds,
          )
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Aktives Partner-Programm-Abo erforderlich (${PARTNER_SUBSCRIPTION_PRICE_LABEL}).`,
          });
        }
      }

      const campaign = await stripeClient.promotionCodes.retrieve(
        input.campaignId,
      );
      if (!isPartnerCampaignForUser(campaign, ctx.session.user.id)) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      const nextExpiresAt =
        input.validForDays !== undefined
          ? Math.floor(Date.now() / 1000) + input.validForDays * SECONDS_IN_DAY
          : undefined;

      // Stripe does not allow changing max redemptions/expires_at on existing promotion codes.
      // When either setting changes we rotate the campaign: deactivate old and create a new one.
      let updatedCampaign = campaign;
      if (input.maxRedemptions === undefined && nextExpiresAt === undefined) {
        updatedCampaign = await stripeClient.promotionCodes.update(
          input.campaignId,
          {
            active: input.active,
          },
        );
      } else {
        const metadata = campaign.metadata ?? {};
        const partnerUserId = metadata.partnerUserId ?? "";
        const templateId = metadata.templateId ?? "";
        const snapshotBookId = metadata.snapshotBookId ?? "";
        const partnerAccountId = metadata.partnerAccountId ?? "";

        if (
          !partnerUserId ||
          !templateId ||
          !snapshotBookId ||
          !partnerAccountId
        ) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Campaign metadata is incomplete",
          });
        }

        const desiredMaxRedemptions =
          input.maxRedemptions ??
          campaign.max_redemptions ??
          DEFAULT_CAMPAIGN_MAX_REDEMPTIONS;
        const desiredExpiresAt =
          nextExpiresAt ??
          campaign.expires_at ??
          Math.floor(Date.now() / 1000) +
            DEFAULT_CAMPAIGN_VALID_DAYS * SECONDS_IN_DAY;

        const wasActive = campaign.active;
        if (campaign.active) {
          await stripeClient.promotionCodes.update(campaign.id, {
            active: false,
          });
        }

        try {
          const coupon = await stripeClient.coupons.create({
            duration: "once",
            percent_off: 100,
            max_redemptions: desiredMaxRedemptions,
            redeem_by: desiredExpiresAt,
            metadata: {
              kind: CAMPAIGN_KIND,
              partnerUserId,
              templateId,
              snapshotBookId,
              partnerAccountId,
            },
          });

          updatedCampaign = await stripeClient.promotionCodes.create({
            promotion: {
              type: "coupon",
              coupon: coupon.id,
            },
            code: campaign.code,
            max_redemptions: desiredMaxRedemptions,
            expires_at: desiredExpiresAt,
            metadata: {
              kind: CAMPAIGN_KIND,
              partnerUserId,
              templateId,
              snapshotBookId,
              partnerAccountId,
            },
          });

          if (input.active === false) {
            updatedCampaign = await stripeClient.promotionCodes.update(
              updatedCampaign.id,
              {
                active: false,
              },
            );
          }
        } catch (error) {
          if (wasActive) {
            try {
              await stripeClient.promotionCodes.update(campaign.id, {
                active: true,
              });
            } catch (reactivateError) {
              logger.error("failed_to_reactivate_replaced_campaign", {
                campaignId: campaign.id,
                error: reactivateError,
              });
            }
          }
          throw error;
        }
      }

      const metadata = updatedCampaign.metadata ?? {};
      const expiresAt = updatedCampaign.expires_at ?? undefined;
      const token = createPartnerCampaignLinkToken({
        partnerUserId: metadata.partnerUserId ?? "",
        templateId: metadata.templateId ?? "",
        snapshotBookId: metadata.snapshotBookId ?? "",
        promotionCodeId: updatedCampaign.id,
        exp: expiresAt,
      });

      return {
        id: updatedCampaign.id,
        code: updatedCampaign.code,
        active: updatedCampaign.active,
        timesRedeemed: updatedCampaign.times_redeemed,
        maxRedemptions: updatedCampaign.max_redemptions,
        expiresAt,
        token,
      };
    }),

  getSalesOverview: protectedProcedure.query(async ({ ctx }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });

      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }

      assertPartnerRole(user.role);

      const dbCampaigns = await findCampaignsByPartnerUserId(
        ctx.db,
        ctx.session.user.id,
      );

      const campaigns = await stripeClient.promotionCodes.list({ limit: 100 });
      const ownCampaigns = campaigns.data.filter((campaign) =>
        isPartnerCampaignForUser(campaign, ctx.session.user.id),
      );
      const canceledByCampaign = await getCanceledCampaignRedemptionsMap(
        ctx.db,
        ctx.session.user.id,
        dbCampaigns.map((campaign) => campaign.promotionCodeId),
      );

      const activeCampaignCount = ownCampaigns.filter(
        (campaign) => campaign.active,
      ).length;

      const grossRedemptions = dbCampaigns.reduce(
        (sum, campaign) => sum + campaign.timesRedeemed,
        0,
      );
      const canceledRedemptions = Array.from(
        canceledByCampaign.values(),
      ).reduce((sum, count) => sum + count, 0);
      const totalRedemptions = Math.max(
        0,
        grossRedemptions - canceledRedemptions,
      );

      const remainingRedemptions = dbCampaigns.reduce((sum, campaign) => {
        const canceledForCampaign =
          canceledByCampaign.get(campaign.promotionCodeId) ?? 0;
        const activeRedemptionsForCampaign = Math.max(
          0,
          campaign.timesRedeemed - canceledForCampaign,
        );
        return (
          sum +
          Math.max(campaign.maxRedemptions - activeRedemptionsForCampaign, 0)
        );
      }, 0);

      const platformInvoices = await stripeClient.invoices.list({ limit: 100 });
      const partnerInvoices = platformInvoices.data.filter(
        (invoice) =>
          (invoice.metadata?.invoiceType ?? "") === "PARTNER_BASE_CHARGE" &&
          (invoice.metadata?.partnerUserId ?? "") === ctx.session.user.id,
      );

      const billedPartnerAmountCents = partnerInvoices.reduce(
        (sum, invoice) =>
          sum + (invoice.amount_paid || invoice.amount_due || 0),
        0,
      );

      const partnerSessions = await stripeClient.checkout.sessions.list({
        limit: 100,
      });
      const ownPartnerSessions = partnerSessions.data.filter(
        (session) =>
          (session.metadata?.partnerFlow ?? "") === "1" &&
          (session.metadata?.partnerUserId ?? "") === ctx.session.user.id,
      );

      const addOnRevenueCents = ownPartnerSessions.reduce(
        (sum, session) => sum + (session.amount_total ?? 0),
        0,
      );
      const addOnOrderCount = ownPartnerSessions.filter(
        (session) => (session.amount_total ?? 0) > 0,
      ).length;

      return {
        campaignCount: ownCampaigns.length,
        activeCampaignCount,
        totalRedemptions,
        canceledRedemptions,
        grossRedemptions,
        remainingRedemptions,
        partnerInvoiceCount: partnerInvoices.length,
        billedPartnerAmountCents,
        partneredCheckoutCount: ownPartnerSessions.length,
        addOnOrderCount,
        addOnRevenueCents,
      };
    } catch (e) {
      logger.error("get_sales_overview_error", {
        userId: ctx.session.user.id,
        error: e,
      });
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message:
          "Sales-Übersicht konnte derzeit nicht geladen werden. Bitte später erneut versuchen.",
      });
    }
  }),

  getCampaignTemplate: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
      }),
    )
    .query(async ({ ctx, input }) => {
      const claims = parseCampaignClaims(input.token);

      const campaign = await stripeClient.promotionCodes.retrieve(
        claims.promotionCodeId,
      );
      const metadata = campaign.metadata ?? {};

      if (metadata.kind !== CAMPAIGN_KIND) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign not found",
        });
      }

      if (
        metadata.partnerUserId !== claims.partnerUserId ||
        metadata.templateId !== claims.templateId ||
        metadata.snapshotBookId !== claims.snapshotBookId
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Campaign metadata mismatch",
        });
      }

      const template = await ctx.db.book.findFirst({
        where: {
          id: claims.snapshotBookId,
          deletedAt: null,
        },
        include: {
          modules: {
            include: {
              module: {
                include: {
                  files: true,
                },
              },
            },
          },
        },
      });

      if (!template) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Campaign template no longer exists",
        });
      }

      return {
        template,
        campaign: {
          promotionCodeId: campaign.id,
          expiresAt: campaign.expires_at,
          active: campaign.active,
        },
      };
    }),

  startPartnerClaim: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        promoCode: z.string().min(1),
        email: z.string().email(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.claim.start",
        maxRequests: 8,
        windowMs: 10 * 60 * 1000,
      });

      const claims = parseCampaignClaims(input.token);
      const normalizedCode = normalizePromoCode(input.promoCode);
      const normalizedEmail = input.email.trim().toLowerCase();

      const campaign = await stripeClient.promotionCodes.retrieve(
        claims.promotionCodeId,
      );
      const metadata = campaign.metadata ?? {};

      if (metadata.kind !== CAMPAIGN_KIND) {
        logger.warn("partner_claim_start_invalid_campaign_kind", {
          promotionCodeId: claims.promotionCodeId,
          kind: metadata.kind ?? null,
        });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Kampagne wurde nicht gefunden.",
        });
      }
      if (!campaign.active) {
        logger.warn("partner_claim_start_inactive_promo", {
          promotionCodeId: campaign.id,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Promo-Code ist nicht mehr aktiv.",
        });
      }
      if (normalizePromoCode(campaign.code) !== normalizedCode) {
        logger.warn("partner_claim_start_promo_mismatch", {
          promotionCodeId: campaign.id,
          providedCode: normalizedCode,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Promo-Code ist ungültig.",
        });
      }
      if (
        metadata.partnerUserId !== claims.partnerUserId ||
        metadata.templateId !== claims.templateId ||
        metadata.snapshotBookId !== claims.snapshotBookId
      ) {
        logger.warn("partner_claim_start_metadata_mismatch", {
          promotionCodeId: campaign.id,
          tokenPartnerUserId: claims.partnerUserId,
          metadataPartnerUserId: metadata.partnerUserId ?? null,
          tokenTemplateId: claims.templateId,
          metadataTemplateId: metadata.templateId ?? null,
          tokenSnapshotBookId: claims.snapshotBookId,
          metadataSnapshotBookId: metadata.snapshotBookId ?? null,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Partner-Link passt nicht zur Kampagne.",
        });
      }

      const now = Date.now();
      const campaignExpiryMs = campaign.expires_at
        ? campaign.expires_at * 1000
        : Number.POSITIVE_INFINITY;
      if (campaignExpiryMs <= now) {
        logger.warn("partner_claim_start_promo_expired", {
          promotionCodeId: campaign.id,
          expiresAt: campaign.expires_at ?? null,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Promo-Code ist abgelaufen.",
        });
      }

      const defaultExpiry = getPartnerClaimExpiry();
      const finalExpiryMs = Math.min(defaultExpiry.getTime(), campaignExpiryMs);
      const expiresAt = new Date(finalExpiryMs);

      await ctx.db.partnerClaim.updateMany({
        where: {
          promotionCodeId: campaign.id,
          email: normalizedEmail,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
        },
      });

      const verifyToken = createPartnerClaimToken();
      const verifyTokenHash = hashPartnerClaimToken(verifyToken);
      const dbCampaign = await ctx.db.campaign.findUnique({
        where: {
          promotionCodeId: campaign.id,
        },
      });

      await ctx.db.partnerClaim.create({
        data: {
          campaignId: dbCampaign?.id,
          promotionCodeId: campaign.id,
          snapshotBookId: claims.snapshotBookId,
          email: normalizedEmail,
          status: "PENDING",
          verifyTokenHash,
          expiresAt,
        },
      });
      logger.info("partner_claim_start_created", {
        promotionCodeId: campaign.id,
        snapshotBookId: claims.snapshotBookId,
        email: normalizedEmail,
        expiresAt: expiresAt.toISOString(),
      });

      const verifyUrl = buildAppUrl(
        getAppOriginFromHeaders(ctx.headers),
        `/template?claim=${encodeURIComponent(verifyToken)}`,
      );
      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5">
          <h2>Partner-Angebot verifizieren</h2>
          <p>Bitte bestätigen Sie Ihre E-Mail und öffnen Sie danach Ihre Partner-Vorlage.</p>
          <p><a href="${verifyUrl}">E-Mail bestätigen und Vorlage öffnen</a></p>
          <p>Dieser Link ist bis ${expiresAt.toLocaleString("de-DE")} gültig.</p>
        </div>
      `;

      await sendOrderVerification(
        normalizedEmail,
        "Partner-Angebot: E-Mail bestätigen",
        html,
      );

      return {
        verificationSent: true,
        email: maskEmail(normalizedEmail),
      };
    }),

  completePartnerClaim: protectedProcedure
    .input(
      z.object({
        claimToken: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: PARTNER_CLAIM_VERIFY_SCOPE,
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });

      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          id: true,
          email: true,
        },
      });
      if (!user?.email) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Bitte mit verifizierter E-Mail anmelden.",
        });
      }

      const verifyTokenHash = hashPartnerClaimToken(input.claimToken);
      const claim = await ctx.db.partnerClaim.findUnique({
        where: { verifyTokenHash },
      });
      if (!claim) {
        logger.warn("partner_claim_complete_not_found", {
          userId: user.id,
          verifyTokenHashPrefix: verifyTokenHash.slice(0, 12),
        });
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Der Verifizierungslink ist ungültig.",
        });
      }
      if (claim.expiresAt.getTime() < Date.now()) {
        await ctx.db.partnerClaim.update({
          where: { id: claim.id },
          data: { status: "EXPIRED" },
        });
        logger.warn("partner_claim_complete_expired", {
          claimId: claim.id,
          userId: user.id,
          expiresAt: claim.expiresAt.toISOString(),
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Verifizierungslink ist abgelaufen.",
        });
      }

      if (claim.email !== user.email.trim().toLowerCase()) {
        logger.warn("partner_claim_complete_email_mismatch", {
          claimId: claim.id,
          userId: user.id,
          claimEmail: claim.email,
          sessionEmail: user.email.trim().toLowerCase(),
        });
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Diese E-Mail passt nicht zum Partner-Angebot.",
        });
      }

      if (claim.bookId) {
        logger.info("partner_claim_complete_idempotent_return", {
          claimId: claim.id,
          userId: user.id,
          bookId: claim.bookId,
        });
        const promotion = await stripeClient.promotionCodes.retrieve(
          claim.promotionCodeId,
        );
        const partnerCheckoutToken = createPartnerCheckoutToken({
          partnerUserId: promotion.metadata?.partnerUserId ?? "",
          templateId: promotion.metadata?.templateId ?? "",
          snapshotBookId: claim.snapshotBookId,
          promotionCodeId: claim.promotionCodeId,
          promotionCode: promotion.code,
          exp: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
        });

        return {
          bookId: claim.bookId,
          partnerCheckoutToken: partnerCheckoutToken,
        };
      }

      const promotion = await stripeClient.promotionCodes.retrieve(
        claim.promotionCodeId,
      );
      const buildPartnerCheckoutToken = () =>
        createPartnerCheckoutToken({
          partnerUserId: promotion.metadata?.partnerUserId ?? "",
          templateId: promotion.metadata?.templateId ?? "",
          snapshotBookId: claim.snapshotBookId,
          promotionCodeId: claim.promotionCodeId,
          promotionCode: promotion.code,
          exp: Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60,
        });
      if (!promotion.active) {
        logger.warn("partner_claim_complete_promo_inactive", {
          claimId: claim.id,
          promotionCodeId: claim.promotionCodeId,
        });
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Der Promo-Code ist nicht mehr aktiv.",
        });
      }

      let resolvedBookId: string | null = null;
      try {
        const clonedBook = await ctx.db.$transaction(async (tx) => {
          const dbCampaign = await tx.campaign.findUnique({
            where: { promotionCodeId: claim.promotionCodeId },
          });
          if (!dbCampaign) {
            logger.warn("partner_claim_complete_missing_campaign", {
              claimId: claim.id,
              promotionCodeId: claim.promotionCodeId,
            });
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Partner-Kampagne wurde nicht gefunden.",
            });
          }

          const incremented = await tx.campaign.updateMany({
            where: {
              promotionCodeId: claim.promotionCodeId,
              timesRedeemed: {
                lt: dbCampaign.maxRedemptions,
              },
            },
            data: {
              timesRedeemed: {
                increment: 1,
              },
            },
          });
          if (incremented.count !== 1) {
            logger.warn("partner_claim_complete_redemption_limit_reached", {
              claimId: claim.id,
              promotionCodeId: claim.promotionCodeId,
            });
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Der Promo-Code wurde bereits aufgebraucht.",
            });
          }

          const snapshotTemplate = await tx.book.findFirst({
            where: {
              id: claim.snapshotBookId,
              deletedAt: null,
            },
            include: {
              modules: true,
            },
          });
          if (!snapshotTemplate) {
            logger.warn("partner_claim_complete_snapshot_missing", {
              claimId: claim.id,
              snapshotBookId: claim.snapshotBookId,
            });
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Die Partner-Vorlage ist nicht mehr verfügbar.",
            });
          }

          const book = await tx.book.create({
            data: {
              name: Naming.partner(snapshotTemplate.name),
              bookTitle: snapshotTemplate.bookTitle,
              subTitle: snapshotTemplate.subTitle,
              format: snapshotTemplate.format,
              region: snapshotTemplate.region,
              planStart: snapshotTemplate.planStart,
              planEnd: snapshotTemplate.planEnd,
              country: snapshotTemplate.country,
              copyFromId: snapshotTemplate.id,
              createdById: user.id,
              sourceType: "PARTNER_TEMPLATE",
              partnerClaimId: claim.id,
              partnerPromotionCodeId: claim.promotionCodeId,
              partnerSnapshotBookId: claim.snapshotBookId,
              modules: {
                create: snapshotTemplate.modules.map((moduleItem) => ({
                  idx: moduleItem.idx,
                  moduleId: moduleItem.moduleId,
                  colorCode: moduleItem.colorCode,
                })),
              },
            },
          });

          await tx.partnerClaim.update({
            where: { id: claim.id },
            data: {
              status: "CONSUMED",
              verifiedAt: new Date(),
              consumedAt: new Date(),
              userId: user.id,
              bookId: book.id,
            },
          });

          return book;
        });
        resolvedBookId = clonedBook.id;
      } catch (error) {
        if (!isUniqueBookPartnerClaimError(error)) {
          throw error;
        }

        const existingBook = await ctx.db.book.findFirst({
          where: { partnerClaimId: claim.id, deletedAt: null },
          select: { id: true },
        });
        const refreshedClaim = await ctx.db.partnerClaim.findUnique({
          where: { id: claim.id },
          select: { bookId: true },
        });
        const existingBookId =
          refreshedClaim?.bookId ?? existingBook?.id ?? null;

        if (!existingBookId) {
          logger.error("partner_claim_complete_race_without_book", {
            claimId: claim.id,
            userId: user.id,
            error,
          });
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message:
              "Partner-Vorlage konnte nicht finalisiert werden. Bitte erneut versuchen.",
          });
        }

        logger.info("partner_claim_complete_race_idempotent_return", {
          claimId: claim.id,
          userId: user.id,
          bookId: existingBookId,
        });
        resolvedBookId = existingBookId;
      }

      const partnerCheckoutToken = buildPartnerCheckoutToken();
      logger.info("partner_claim_complete_success", {
        claimId: claim.id,
        userId: user.id,
        bookId: resolvedBookId,
        promotionCodeId: claim.promotionCodeId,
      });

      return {
        bookId: resolvedBookId,
        partnerCheckoutToken: partnerCheckoutToken,
      };
    }),

  listPartnerClaims: protectedProcedure.query(async ({ ctx }) => {
    const claims = await ctx.db.partnerClaim.findMany({
      where: {
        userId: ctx.session.user.id,
      },
      orderBy: { updatedAt: "desc" },
      include: {
        book: {
          select: {
            id: true,
            name: true,
            updatedAt: true,
          },
        },
      },
    });

    return claims.map((claim) => ({
      id: claim.id,
      status: claim.status,
      promotionCodeId: claim.promotionCodeId,
      snapshotBookId: claim.snapshotBookId,
      expiresAt: Math.floor(claim.expiresAt.getTime() / 1000),
      book: claim.book,
    }));
  }),

  listPartnerNotifications: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(25),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!hasPartnerNotificationModel(ctx.db)) {
        logger.warn("partner_notification_model_missing", {
          userId: ctx.session.user.id,
        });
        return [];
      }

      const notifications = await ctx.db.partnerNotification.findMany({
        where: {
          partnerUserId: ctx.session.user.id,
        },
        orderBy: {
          createdAt: "desc",
        },
        take: input?.limit ?? 25,
        include: {
          partnerOrder: {
            select: {
              id: true,
              status: true,
              bookId: true,
              submittedAt: true,
            },
          },
        },
      });

      return notifications.map((notification) => ({
        id: notification.id,
        type: notification.type,
        readAt: notification.readAt,
        createdAt: notification.createdAt,
        payload: notification.payload,
        partnerOrder: notification.partnerOrder,
      }));
    }),

  getUnreadPartnerNotificationCount: protectedProcedure.query(
    async ({ ctx }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!hasPartnerNotificationModel(ctx.db)) {
        logger.warn("partner_notification_model_missing_unread_count", {
          userId: ctx.session.user.id,
        });
        return { count: 0 };
      }

      const count = await ctx.db.partnerNotification.count({
        where: {
          partnerUserId: ctx.session.user.id,
          readAt: null,
        },
      });

      return { count };
    },
  ),

  markPartnerNotificationRead: protectedProcedure
    .input(
      z.object({
        notificationId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      const updated = await ctx.db.partnerNotification.updateMany({
        where: {
          id: input.notificationId,
          partnerUserId: ctx.session.user.id,
          readAt: null,
        },
        data: {
          readAt: new Date(),
        },
      });

      return { updated: updated.count === 1 };
    }),

  listIncomingPartnerOrders: protectedProcedure
    .input(
      z
        .object({
          statuses: z
            .enum([
              "SUBMITTED_BY_SCHOOL",
              "UNDER_PARTNER_REVIEW",
              "PARTNER_CONFIRMED",
              "PARTNER_DECLINED",
              "RELEASED_TO_PRODUCTION",
              "FULFILLED",
            ])
            .array()
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!hasPartnerOrderModel(ctx.db)) {
        logger.warn("partner_order_model_missing_list", {
          userId: ctx.session.user.id,
        });
        return [];
      }

      const statuses =
        input?.statuses && input.statuses.length > 0
          ? input.statuses
          : ([
              "SUBMITTED_BY_SCHOOL",
              "UNDER_PARTNER_REVIEW",
            ] satisfies PartnerOrderStatus[]);

      const orders = await ctx.db.partnerOrder.findMany({
        where: {
          partnerUserId: ctx.session.user.id,
          status: {
            in: statuses,
          },
        },
        orderBy: {
          submittedAt: "desc",
        },
        include: {
          order: {
            select: {
              status: true,
              canceledAt: true,
            },
          },
          book: {
            select: {
              id: true,
              name: true,
              updatedAt: true,
            },
          },
          schoolUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      return orders.map((order) => ({
        id: order.id,
        status: order.status,
        submittedAt: order.submittedAt,
        reviewedAt: order.reviewedAt,
        declineReason: order.declineReason,
        orderStatus: order.order?.status ?? null,
        orderCanceledAt: order.order?.canceledAt ?? null,
        book: order.book,
        schoolUser: order.schoolUser,
      }));
    }),

  getPartnerOrderMetrics: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.session.user.id },
      select: { role: true },
    });
    if (!user) {
      throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    }
    assertPartnerRole(user.role);

    if (!hasPartnerOrderModel(ctx.db)) {
      logger.warn("partner_order_model_missing_metrics", {
        userId: ctx.session.user.id,
      });
      return {
        incomingCount: 0,
        pendingReviewAgeHours: 0,
        confirmedVsDeclinedRatio: null,
        confirmedCount: 0,
        declinedCount: 0,
      };
    }

    const incomingCount = await ctx.db.partnerOrder.count({
      where: {
        partnerUserId: ctx.session.user.id,
        status: {
          in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"],
        },
      },
    });

    const oldestPending = await ctx.db.partnerOrder.findFirst({
      where: {
        partnerUserId: ctx.session.user.id,
        status: {
          in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"],
        },
      },
      orderBy: {
        submittedAt: "asc",
      },
      select: {
        submittedAt: true,
      },
    });

    const confirmedCount = await ctx.db.partnerOrder.count({
      where: {
        partnerUserId: ctx.session.user.id,
        status: "PARTNER_CONFIRMED",
      },
    });
    const declinedCount = await ctx.db.partnerOrder.count({
      where: {
        partnerUserId: ctx.session.user.id,
        status: "PARTNER_DECLINED",
      },
    });
    const ratioBase = confirmedCount + declinedCount;

    return {
      incomingCount,
      pendingReviewAgeHours: oldestPending?.submittedAt
        ? Math.max(
            0,
            Math.floor(
              (Date.now() - oldestPending.submittedAt.getTime()) /
                (1000 * 60 * 60),
            ),
          )
        : 0,
      confirmedVsDeclinedRatio:
        ratioBase > 0 ? Number((confirmedCount / ratioBase).toFixed(4)) : null,
      confirmedCount,
      declinedCount,
    };
  }),

  getPartnerOrderById: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      const order = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
          partnerUserId: ctx.session.user.id,
        },
        include: {
          book: {
            select: {
              id: true,
              name: true,
              updatedAt: true,
            },
          },
          order: {
            select: {
              id: true,
              orderKey: true,
              status: true,
              createdAt: true,
            },
          },
          schoolUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          transitions: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              actorUserId: true,
              correlationId: true,
              payloadHash: true,
              createdAt: true,
            },
          },
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Bestellung nicht gefunden.",
        });
      }

      return {
        id: order.id,
        status: order.status,
        submittedAt: order.submittedAt,
        reviewedAt: order.reviewedAt,
        declineReason: order.declineReason,
        releasedAt: order.releasedAt,
        fulfilledAt: order.fulfilledAt,
        schoolSnapshot: order.schoolSnapshot,
        partnerSnapshot: order.partnerSnapshot,
        lineItemsSnapshot: order.lineItemsSnapshot,
        sourceCampaignId: order.sourceCampaignId,
        sourceClaimId: order.sourceClaimId,
        book: order.book,
        order: order.order,
        schoolUser: order.schoolUser,
        transitions: order.transitions,
      };
    }),

  getPartnerOrderPlannerPreview: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      const order = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
          partnerUserId: ctx.session.user.id,
        },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          reviewedAt: true,
          declineReason: true,
          releasedAt: true,
          fulfilledAt: true,
          schoolSnapshot: true,
          partnerSnapshot: true,
          lineItemsSnapshot: true,
          sourceCampaignId: true,
          sourceClaimId: true,
          order: {
            select: {
              id: true,
              orderKey: true,
              status: true,
              createdAt: true,
            },
          },
          schoolUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
          transitions: {
            orderBy: {
              createdAt: "asc",
            },
            select: {
              id: true,
              fromStatus: true,
              toStatus: true,
              actorUserId: true,
              correlationId: true,
              createdAt: true,
            },
          },
          book: {
            select: {
              id: true,
              name: true,
              bookTitle: true,
              subTitle: true,
              format: true,
              country: true,
              region: true,
              planStart: true,
              planEnd: true,
              modules: {
                orderBy: { idx: "asc" },
                select: {
                  idx: true,
                  colorCode: true,
                  module: {
                    select: {
                      id: true,
                      name: true,
                      part: true,
                      files: {
                        select: {
                          name: true,
                          src: true,
                          type: true,
                          pageCount: true,
                          srcGrayscale: true,
                        },
                      },
                      type: {
                        select: {
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
              customDates: {
                select: {
                  date: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!order) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Bestellung nicht gefunden.",
        });
      }

      return {
        ...order,
        book: {
          ...order.book,
          modules: order.book.modules.map((moduleItem) => {
            const pickedFile = pickModulePdfFile(moduleItem.module.files);
            const pickedCoverImage = pickCoverImageFile(moduleItem.module.files);
            const modulePdfUrl = pickedFile
              ? /^https?:\/\//i.test(pickedFile.src)
                ? pickedFile.src
                : `${env.NEXT_PUBLIC_CDN_SERVER_URL}${pickedFile.src}`
              : `${env.NEXT_PUBLIC_CDN_SERVER_URL}/storage/notizen.pdf`;
            const coverImageUrl = pickedCoverImage
              ? /^https?:\/\//i.test(pickedCoverImage.src)
                ? pickedCoverImage.src
                : `${env.NEXT_PUBLIC_CDN_SERVER_URL}${pickedCoverImage.src}`
              : null;
            return {
              ...moduleItem,
              module: {
                id: moduleItem.module.id,
                name: moduleItem.module.name,
                part: moduleItem.module.part,
                type: moduleItem.module.type,
              },
              modulePdfUrl,
              coverImageUrl,
              modulePageCount: pickedFile?.pageCount ?? null,
              moduleGrayscalePdfUrl: pickedFile?.srcGrayscale
                ? /^https?:\/\//i.test(pickedFile.srcGrayscale)
                  ? pickedFile.srcGrayscale
                  : `${env.NEXT_PUBLIC_CDN_SERVER_URL}${pickedFile.srcGrayscale}`
                : null,
            };
          }),
        },
      };
    }),

  previewPartnerSettlementTotals: protectedProcedure
    .input(
      z
        .object({
          cycleYear: z.number().int().min(2024).max(2100),
          cycleMonth: z.number().int().min(1).max(12),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement preview is disabled.",
        });
      }

      const { cycleYear, cycleMonth, cycleStart, cycleEnd } =
        resolveSettlementCycleWindow(input);

      const releasedOrders = await ctx.db.partnerOrder.findMany({
        where: {
          partnerUserId: ctx.session.user.id,
          status: {
            in: ["RELEASED_TO_PRODUCTION", "FULFILLED"],
          },
          submittedAt: {
            gte: cycleStart,
            lt: cycleEnd,
          },
          settlementBatchId: null,
        },
        select: {
          id: true,
          lineItemsSnapshot: true,
          submittedAt: true,
        },
      });

      const totals = buildSettlementSummary(releasedOrders);

      return {
        cycleYear,
        cycleMonth,
        cycleStart,
        cycleEnd,
        orderCount: releasedOrders.length,
        currency: "EUR",
        totals,
      };
    }),

  listPartnerSettlementBatches: protectedProcedure
    .input(
      z
        .object({
          statuses: z
            .enum(["DRAFT", "FINALIZED", "EXPORTED", "PAID", "CANCELLED"])
            .array()
            .optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement is disabled.",
        });
      }

      const batches = await ctx.db.partnerSettlementBatch.findMany({
        where: {
          partnerUserId: ctx.session.user.id,
          ...(input?.statuses && input.statuses.length > 0
            ? { status: { in: input.statuses } }
            : {}),
        },
        orderBy: [
          {
            cycleStart: "desc",
          },
          {
            createdAt: "desc",
          },
        ],
        include: {
          _count: {
            select: {
              orders: true,
            },
          },
        },
      });

      return batches.map((batch) => ({
        id: batch.id,
        status: batch.status,
        cycleStart: batch.cycleStart,
        cycleEnd: batch.cycleEnd,
        currency: batch.currency,
        summary: batch.summary,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        finalizedAt: batch.finalizedAt,
        orderCount: batch._count.orders,
      }));
    }),

  getPartnerSettlementBatchById: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement is disabled.",
        });
      }

      const batch = await ctx.db.partnerSettlementBatch.findFirst({
        where: {
          id: input.batchId,
          partnerUserId: ctx.session.user.id,
        },
        include: {
          orders: {
            select: {
              id: true,
              status: true,
              submittedAt: true,
              releasedAt: true,
              fulfilledAt: true,
              lineItemsSnapshot: true,
              book: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              submittedAt: "asc",
            },
          },
        },
      });

      if (!batch) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Settlement batch nicht gefunden.",
        });
      }

      return {
        id: batch.id,
        status: batch.status,
        cycleStart: batch.cycleStart,
        cycleEnd: batch.cycleEnd,
        currency: batch.currency,
        summary: batch.summary,
        createdAt: batch.createdAt,
        updatedAt: batch.updatedAt,
        finalizedAt: batch.finalizedAt,
        orders: batch.orders,
      };
    }),

  createPartnerSettlementBatch: protectedProcedure
    .input(
      z.object({
        cycleYear: z.number().int().min(2024).max(2100),
        cycleMonth: z.number().int().min(1).max(12),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.createPartnerSettlementBatch",
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement is disabled.",
        });
      }

      const { cycleYear, cycleMonth, cycleStart, cycleEnd } =
        resolveSettlementCycleWindow(input);

      const existing = await ctx.db.partnerSettlementBatch.findFirst({
        where: {
          partnerUserId: ctx.session.user.id,
          cycleStart,
          cycleEnd,
          status: {
            in: ["DRAFT", "FINALIZED", "EXPORTED", "PAID"],
          },
        },
        select: {
          id: true,
        },
      });
      if (existing) {
        return {
          batchId: existing.id,
          created: false,
        };
      }

      const eligibleOrders = await ctx.db.partnerOrder.findMany({
        where: {
          partnerUserId: ctx.session.user.id,
          status: {
            in: ["RELEASED_TO_PRODUCTION", "FULFILLED"],
          },
          submittedAt: {
            gte: cycleStart,
            lt: cycleEnd,
          },
          settlementBatchId: null,
        },
        select: {
          id: true,
          lineItemsSnapshot: true,
        },
      });

      if (eligibleOrders.length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Keine abrechenbaren Partner-Bestellungen im gewählten Zeitraum.",
        });
      }

      const totals = buildSettlementSummary(eligibleOrders);
      const correlationId = createPartnerCorrelationId("partner_settlement");

      const result = await ctx.db.$transaction(async (tx) => {
        const batch = await tx.partnerSettlementBatch.create({
          data: {
            partnerUserId: ctx.session.user.id,
            cycleStart,
            cycleEnd,
            status: "DRAFT",
            currency: "EUR",
            summary: {
              cycleYear,
              cycleMonth,
              orderCount: eligibleOrders.length,
              totals,
              correlationId,
            },
          },
        });

        await tx.partnerOrder.updateMany({
          where: {
            id: {
              in: eligibleOrders.map((order) => order.id),
            },
            partnerUserId: ctx.session.user.id,
            settlementBatchId: null,
          },
          data: {
            settlementBatchId: batch.id,
          },
        });

        return batch;
      });

      logger.info("partner_settlement_batch_created", {
        batchId: result.id,
        partnerUserId: ctx.session.user.id,
        cycleYear,
        cycleMonth,
        orderCount: eligibleOrders.length,
        correlationId,
      });

      return {
        batchId: result.id,
        created: true,
      };
    }),

  finalizePartnerSettlementBatch: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.finalizePartnerSettlementBatch",
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement is disabled.",
        });
      }

      const updated = await ctx.db.partnerSettlementBatch.updateMany({
        where: {
          id: input.batchId,
          partnerUserId: ctx.session.user.id,
          status: "DRAFT",
        },
        data: {
          status: "FINALIZED",
          finalizedAt: new Date(),
        },
      });
      if (updated.count !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Settlement batch kann nicht finalisiert werden.",
        });
      }

      logger.info("partner_settlement_batch_finalized", {
        batchId: input.batchId,
        partnerUserId: ctx.session.user.id,
      });

      return { finalized: true };
    }),

  markPartnerSettlementBatchExported: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.markPartnerSettlementBatchExported",
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement is disabled.",
        });
      }

      const updated = await ctx.db.partnerSettlementBatch.updateMany({
        where: {
          id: input.batchId,
          partnerUserId: ctx.session.user.id,
          status: "FINALIZED",
        },
        data: {
          status: "EXPORTED",
        },
      });
      if (updated.count !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Settlement batch kann nicht exportiert werden.",
        });
      }

      logger.info("partner_settlement_batch_exported", {
        batchId: input.batchId,
        partnerUserId: ctx.session.user.id,
      });

      return { exported: true };
    }),

  markPartnerSettlementBatchPaid: protectedProcedure
    .input(
      z.object({
        batchId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.markPartnerSettlementBatchPaid",
        maxRequests: 10,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);

      if (!isPartnerSettlementEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner settlement is disabled.",
        });
      }

      const updated = await ctx.db.partnerSettlementBatch.updateMany({
        where: {
          id: input.batchId,
          partnerUserId: ctx.session.user.id,
          status: "EXPORTED",
        },
        data: {
          status: "PAID",
        },
      });
      if (updated.count !== 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Settlement batch kann nicht als bezahlt markiert werden.",
        });
      }

      logger.info("partner_settlement_batch_paid", {
        batchId: input.batchId,
        partnerUserId: ctx.session.user.id,
      });

      return { paid: true };
    }),

  confirmPartnerOrder: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.confirmPartnerOrder",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: {
          role: true,
          id: true,
          name: true,
          email: true,
        },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);
      if (!isPartnerControlledFulfillmentEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner review flow is currently disabled.",
        });
      }

      const partnerOrder = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
          partnerUserId: ctx.session.user.id,
          status: {
            in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"],
          },
        },
        include: {
          order: {
            select: {
              orderKey: true,
            },
          },
        },
      });
      if (!partnerOrder) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner-Bestellung konnte nicht bestätigt werden.",
        });
      }
      if (
        !canTransitionPartnerOrderStatus(
          partnerOrder.status,
          "PARTNER_CONFIRMED",
        )
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ungültiger Statuswechsel für Partner-Bestellung.",
        });
      }

      const correlationId = createPartnerCorrelationId("partner_confirm");

      let schoolInvoice: Awaited<ReturnType<typeof createPartnerSchoolInvoice>>;
      try {
        schoolInvoice = await createPartnerSchoolInvoice({
          partnerOrderId: partnerOrder.id,
          partnerUserId: user.id,
          partnerName: user.name ?? "Partner",
          partnerEmail: user.email ?? null,
          schoolSnapshot: partnerOrder.schoolSnapshot,
          lineItemsSnapshot: partnerOrder.lineItemsSnapshot,
          orderKey: partnerOrder.order?.orderKey ?? null,
        });
      } catch (error) {
        logger.error("partner_school_invoice_create_failed", {
          partnerOrderId: partnerOrder.id,
          partnerUserId: ctx.session.user.id,
          correlationId,
          error,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Schulrechnung konnte nicht erstellt werden.",
        });
      }

      const updated = await ctx.db.partnerOrder.updateMany({
        where: {
          id: input.partnerOrderId,
          partnerUserId: ctx.session.user.id,
          status: partnerOrder.status,
          updatedAt: partnerOrder.updatedAt,
        },
        data: {
          status: "PARTNER_CONFIRMED",
          reviewedAt: new Date(),
          reviewedByUserId: ctx.session.user.id,
          partnerSnapshot: {
            partnerUserId: user.id,
            partnerName: user.name,
            partnerEmail: user.email,
            confirmedAt: new Date().toISOString(),
            invoiceIssuer: schoolInvoice.issuerSnapshot,
            schoolInvoice: {
              invoiceId: schoolInvoice.invoiceId,
              hostedInvoiceUrl: schoolInvoice.hostedInvoiceUrl,
              issuedAt: schoolInvoice.issuedAt,
            },
          },
        },
      });

      if (updated.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Partner-Bestellung wurde zwischenzeitlich geändert. Bitte Ansicht aktualisieren.",
        });
      }

      await recordPartnerOrderTransition({
        db: ctx.db,
        partnerOrderId: partnerOrder.id,
        actorUserId: ctx.session.user.id,
        fromStatus: partnerOrder.status,
        toStatus: "PARTNER_CONFIRMED",
        correlationId,
        payload: {
          schoolInvoiceId: schoolInvoice.invoiceId,
          hostedInvoiceUrl: schoolInvoice.hostedInvoiceUrl,
          invoiceIssuer: schoolInvoice.issuerSnapshot,
        },
      });

      logger.info("partner_order_confirmed", {
        partnerOrderId: input.partnerOrderId,
        partnerUserId: ctx.session.user.id,
        schoolInvoiceId: schoolInvoice.invoiceId,
        correlationId,
      });

      return { confirmed: true };
    }),

  declinePartnerOrder: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
        reason: z.string().trim().min(3).max(500),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.declinePartnerOrder",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);
      if (!isPartnerControlledFulfillmentEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner review flow is currently disabled.",
        });
      }

      const current = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
          partnerUserId: ctx.session.user.id,
          status: {
            in: ["SUBMITTED_BY_SCHOOL", "UNDER_PARTNER_REVIEW"],
          },
        },
        select: {
          id: true,
          status: true,
          updatedAt: true,
        },
      });
      if (!current) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner-Bestellung konnte nicht abgelehnt werden.",
        });
      }
      if (
        !canTransitionPartnerOrderStatus(current.status, "PARTNER_DECLINED")
      ) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Ungültiger Statuswechsel für Partner-Bestellung.",
        });
      }
      const correlationId = createPartnerCorrelationId("partner_decline");

      const updated = await ctx.db.partnerOrder.updateMany({
        where: {
          id: current.id,
          partnerUserId: ctx.session.user.id,
          status: current.status,
          updatedAt: current.updatedAt,
        },
        data: {
          status: "PARTNER_DECLINED",
          reviewedAt: new Date(),
          reviewedByUserId: ctx.session.user.id,
          declineReason: input.reason,
        },
      });

      if (updated.count !== 1) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Partner-Bestellung wurde zwischenzeitlich geändert. Bitte Ansicht aktualisieren.",
        });
      }

      await recordPartnerOrderTransition({
        db: ctx.db,
        partnerOrderId: current.id,
        actorUserId: ctx.session.user.id,
        fromStatus: current.status,
        toStatus: "PARTNER_DECLINED",
        correlationId,
        payload: {
          reason: input.reason,
        },
      });

      logger.info("partner_order_declined", {
        partnerOrderId: input.partnerOrderId,
        partnerUserId: ctx.session.user.id,
        correlationId,
      });

      return { declined: true };
    }),

  releasePartnerOrderToProduction: protectedProcedure
    .input(
      z.object({
        partnerOrderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "partner.releasePartnerOrderToProduction",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.session.user.id },
        select: { role: true },
      });
      if (!user) {
        throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
      }
      assertPartnerRole(user.role);
      if (!isPartnerControlledFulfillmentEnabled()) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Partner review flow is currently disabled.",
        });
      }

      const partnerOrder = await ctx.db.partnerOrder.findFirst({
        where: {
          id: input.partnerOrderId,
          partnerUserId: ctx.session.user.id,
        },
        include: {
          order: {
            select: {
              id: true,
              orderKey: true,
            },
          },
          book: {
            select: {
              id: true,
              name: true,
            },
          },
          schoolUser: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      });

      if (!partnerOrder) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Bestellung nicht gefunden.",
        });
      }

      if (
        partnerOrder.status === "RELEASED_TO_PRODUCTION" ||
        partnerOrder.status === "FULFILLED"
      ) {
        return { released: true, alreadyReleased: true };
      }

      if (partnerOrder.status !== "PARTNER_CONFIRMED") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bestellung muss zuerst durch den Partner bestätigt werden.",
        });
      }

      if (!partnerOrder.order?.orderKey) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Bestellung ist noch nicht für die Produktion vorbereitet.",
        });
      }

      const correlationId = createPartnerCorrelationId("partner_release");
      const releaseAt = new Date();
      const releaseTransition = await ctx.db.partnerOrder.updateMany({
        where: {
          id: partnerOrder.id,
          partnerUserId: ctx.session.user.id,
          status: "PARTNER_CONFIRMED",
        },
        data: {
          status: "RELEASED_TO_PRODUCTION",
          releasedAt: releaseAt,
        },
      });
      if (releaseTransition.count !== 1) {
        const fresh = await ctx.db.partnerOrder.findFirst({
          where: {
            id: partnerOrder.id,
            partnerUserId: ctx.session.user.id,
          },
          select: {
            status: true,
          },
        });
        if (
          fresh?.status === "RELEASED_TO_PRODUCTION" ||
          fresh?.status === "FULFILLED"
        ) {
          return { released: true, alreadyReleased: true };
        }
        throw new TRPCError({
          code: "CONFLICT",
          message: "Partner-Bestellung konnte nicht freigegeben werden.",
        });
      }

      const dispatchKey = buildReleaseDispatchKey(partnerOrder.id, releaseAt);
      const lockedReleaseSnapshot = {
        partnerOrderId: partnerOrder.id,
        partnerOrderStatus: "RELEASED_TO_PRODUCTION",
        releasedAt: releaseAt.toISOString(),
        order: {
          id: partnerOrder.order.id,
          orderKey: partnerOrder.order.orderKey,
        },
        book: {
          id: partnerOrder.book.id,
          name: partnerOrder.book.name,
        },
        schoolSnapshot: partnerOrder.schoolSnapshot,
        schoolUser: partnerOrder.schoolUser,
        partnerSnapshot: partnerOrder.partnerSnapshot,
        lineItemsSnapshot: partnerOrder.lineItemsSnapshot,
        sourceCampaignId: partnerOrder.sourceCampaignId,
        sourceClaimId: partnerOrder.sourceClaimId,
      };

      const html = await createOrderConfirmationEmail(
        partnerOrder.order.orderKey,
        "Produktion",
        getAppOriginFromHeaders(ctx.headers),
      );
      const releasePayloadHtml = `<hr/><h3>Finale Partnerfreigabe (Locked Snapshot)</h3><pre>${escapeHtml(JSON.stringify(lockedReleaseSnapshot, null, 2))}</pre>`;
      try {
        await sendOrderVerification(
          env.SHOP_EMAIL,
          `Partnerfreigabe zur Produktion: ${partnerOrder.order.orderKey}`,
          `${html}${releasePayloadHtml}`,
        );
      } catch (error) {
        await ctx.db.partnerOrder.updateMany({
          where: {
            id: partnerOrder.id,
            partnerUserId: ctx.session.user.id,
            status: "RELEASED_TO_PRODUCTION",
            releasedAt: releaseAt,
          },
          data: {
            status: "PARTNER_CONFIRMED",
            releasedAt: null,
          },
        });
        logger.error("partner_order_release_email_failed", {
          partnerOrderId: partnerOrder.id,
          orderKey: partnerOrder.order.orderKey,
          dispatchKey,
          correlationId,
          error,
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Freigabe fehlgeschlagen. Bitte erneut versuchen.",
        });
      }

      await ctx.db.partnerNotification.create({
        data: {
          partnerUserId: ctx.session.user.id,
          partnerOrderId: partnerOrder.id,
          type: "PARTNER_ORDER_RELEASED",
          payload: {
            orderKey: partnerOrder.order.orderKey,
            bookId: partnerOrder.book.id,
            bookName: partnerOrder.book.name,
            lockedReleaseSnapshot,
          },
        },
      });

      await recordPartnerOrderTransition({
        db: ctx.db,
        partnerOrderId: partnerOrder.id,
        actorUserId: ctx.session.user.id,
        fromStatus: "PARTNER_CONFIRMED",
        toStatus: "RELEASED_TO_PRODUCTION",
        correlationId,
        payload: {
          dispatchKey,
          orderKey: partnerOrder.order.orderKey,
        },
      });

      logger.info("partner_order_released_to_production", {
        partnerOrderId: partnerOrder.id,
        orderId: partnerOrder.order.id,
        orderKey: partnerOrder.order.orderKey,
        partnerUserId: ctx.session.user.id,
        dispatchKey,
        correlationId,
      });

      return { released: true, orderKey: partnerOrder.order.orderKey };
    }),

  redeemCampaign: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        promoCode: z.string().min(1),
        email: z.string().email().optional(),
      }),
    )
    .mutation(async () => {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          "Direct redeem is disabled. Start claim verification via startPartnerClaim.",
      });
    }),
});
