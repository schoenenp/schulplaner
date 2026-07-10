import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type Stripe from "stripe";

import { protectedProcedure, createTRPCRouter } from "@/server/api/trpc";
import { stripeClient } from "@/server/stripe";
import { enforceProcedureRateLimit } from "@/server/util/rate-limit";
import { asJsonObject } from "@/server/util/partner/settlement";
import { logger } from "@/server/util/logger";

const CAMPAIGN_KIND = "partner_campaign";
const ADMIN_COUPON_KIND = "admin_platform_coupon";
const PROMO_CODE_REGEX = /^[A-Z0-9-_]{6,32}$/;
const SECONDS_IN_DAY = 24 * 60 * 60;
const MAX_CAMPAIGN_MAX_REDEMPTIONS = 1000;

function normalizePromoCode(input: string): string {
  return input.trim().toUpperCase();
}

function randomPromoCode(prefix = "SP"): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let random = "";
  for (let i = 0; i < 8; i++) {
    random += alphabet[Math.floor(Math.random() * alphabet.length)]!;
  }
  return `${prefix}-${random}`;
}

function isCampaignCode(promotion: {
  metadata: Record<string, string> | null | undefined;
}): boolean {
  return (promotion.metadata?.kind ?? "") === CAMPAIGN_KIND;
}

function getCouponIdFromPromotion(promotion: Stripe.PromotionCode): string {
  const promotionRecord = asJsonObject(promotion);
  const promotionNode = asJsonObject(promotionRecord.promotion);
  const couponNode = asJsonObject(promotionNode.coupon);
  if (typeof couponNode.id === "string" && couponNode.id.length > 0) {
    return couponNode.id;
  }
  if (
    typeof promotionNode.coupon === "string" &&
    promotionNode.coupon.length > 0
  ) {
    return promotionNode.coupon;
  }
  return "";
}

export const couponRouter = createTRPCRouter({
  /**
   * Platform coupons: every promotion code that is not a partner campaign
   * code. Covers coupons created here (tagged admin_platform_coupon) as well
   * as legacy codes from the retired orders app.
   */
  listPlatformCoupons: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().optional() }).optional())
    .query(async ({ input }) => {
      const promotions = await stripeClient.promotionCodes.list({
        limit: 100,
        ...(input?.includeInactive ? {} : { active: true }),
      });
      const platformPromotions = promotions.data.filter(
        (promotion) => !isCampaignCode(promotion),
      );

      const couponsById = new Map<string, Stripe.Coupon>();
      await Promise.all(
        platformPromotions.map(async (promotion) => {
          const couponId = getCouponIdFromPromotion(promotion);
          if (!couponId || couponsById.has(couponId)) {
            return;
          }
          try {
            const coupon = await stripeClient.coupons.retrieve(couponId);
            couponsById.set(couponId, coupon);
          } catch {
            logger.warn("coupon_retrieve_failed", { couponId });
          }
        }),
      );

      return platformPromotions.map((promotion) => {
        const couponId = getCouponIdFromPromotion(promotion);
        const coupon = couponId ? couponsById.get(couponId) : null;

        return {
          id: promotion.id,
          code: promotion.code,
          active: promotion.active,
          maxRedemptions: promotion.max_redemptions,
          timesRedeemed: promotion.times_redeemed,
          expiresAt: promotion.expires_at,
          createdAt: promotion.created,
          coupon: {
            id: coupon?.id ?? couponId,
            percentOff: coupon?.percent_off ?? null,
            amountOff: coupon?.amount_off ?? null,
            currency: coupon?.currency ?? null,
            duration: coupon?.duration ?? null,
          },
          metadata: promotion.metadata ?? {},
        };
      });
    }),

  createPlatformCoupon: protectedProcedure
    .input(
      z.object({
        code: z.string().trim().min(6).max(32),
        maxRedemptions: z.number().int().min(1).max(10000).optional(),
        validForDays: z.number().int().min(1).max(365).optional(),
        discount: z.discriminatedUnion("type", [
          z.object({
            type: z.literal("PERCENT"),
            percentOff: z.number().min(1).max(100),
          }),
          z.object({
            type: z.literal("AMOUNT"),
            amountOffCents: z.number().int().min(1),
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "coupon.createPlatformCoupon",
        maxRequests: 20,
        windowMs: 10 * 60 * 1000,
      });

      const code = normalizePromoCode(input.code);
      if (!PROMO_CODE_REGEX.test(code)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Coupon-Code Format ist ungueltig.",
        });
      }

      const existingPromotionCodes = await stripeClient.promotionCodes.list({
        code,
        active: true,
        limit: 1,
      });
      if (existingPromotionCodes.data.length > 0) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Coupon-Code existiert bereits.",
        });
      }

      const redeemBy = input.validForDays
        ? Math.floor(Date.now() / 1000) + input.validForDays * SECONDS_IN_DAY
        : undefined;

      const coupon = await stripeClient.coupons.create({
        duration: "once",
        ...(input.discount.type === "PERCENT"
          ? { percent_off: input.discount.percentOff }
          : {
              amount_off: input.discount.amountOffCents,
              currency: "eur",
            }),
        ...(input.maxRedemptions
          ? { max_redemptions: input.maxRedemptions }
          : {}),
        ...(redeemBy ? { redeem_by: redeemBy } : {}),
        metadata: {
          kind: ADMIN_COUPON_KIND,
          createdByUserId: ctx.session.user.id,
        },
      });

      const promotion = await stripeClient.promotionCodes.create({
        promotion: {
          type: "coupon",
          coupon: coupon.id,
        },
        code,
        ...(input.maxRedemptions
          ? { max_redemptions: input.maxRedemptions }
          : {}),
        ...(redeemBy ? { expires_at: redeemBy } : {}),
        metadata: {
          kind: ADMIN_COUPON_KIND,
          createdByUserId: ctx.session.user.id,
        },
      });

      return {
        id: promotion.id,
        code: promotion.code,
        active: promotion.active,
      };
    }),

  setPlatformCouponActive: protectedProcedure
    .input(
      z.object({
        promotionCodeId: z.string().min(1),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "coupon.setPlatformCouponActive",
        maxRequests: 50,
        windowMs: 10 * 60 * 1000,
      });

      const promotion = await stripeClient.promotionCodes.retrieve(
        input.promotionCodeId,
      );

      if (isCampaignCode(promotion)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Partner-Codes werden im Bereich Partner-Codes verwaltet.",
        });
      }

      const updated = await stripeClient.promotionCodes.update(promotion.id, {
        active: input.active,
      });

      return {
        id: updated.id,
        active: updated.active,
      };
    }),

  /** Partner campaign codes (backed by the Campaign table + Stripe). */
  listPartnerCodes: protectedProcedure
    .input(
      z
        .object({
          partnerUserId: z.string().optional(),
          active: z.boolean().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const campaigns = await ctx.db.campaign.findMany({
        where: {
          ...(input?.partnerUserId
            ? { partnerUserId: input.partnerUserId }
            : {}),
        },
        orderBy: {
          createdAt: "desc",
        },
      });

      const partnerUsers = await ctx.db.user.findMany({
        where: {
          id: {
            in: Array.from(
              new Set(campaigns.map((campaign) => campaign.partnerUserId)),
            ),
          },
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      });
      const partnerUserMap = new Map(
        partnerUsers.map((entry) => [entry.id, entry]),
      );

      const promotions = await Promise.all(
        campaigns.map(async (campaign) => {
          try {
            const promotion = await stripeClient.promotionCodes.retrieve(
              campaign.promotionCodeId,
            );
            return [campaign.id, promotion] as const;
          } catch {
            return [campaign.id, null] as const;
          }
        }),
      );
      const promotionByCampaignId = new Map(promotions);

      return campaigns
        .map((campaign) => {
          const promotion = promotionByCampaignId.get(campaign.id) ?? null;
          const partnerUser =
            partnerUserMap.get(campaign.partnerUserId) ?? null;
          return {
            id: campaign.id,
            partnerUserId: campaign.partnerUserId,
            partnerUser,
            templateId: campaign.templateId,
            snapshotBookId: campaign.snapshotBookId,
            promotionCodeId: campaign.promotionCodeId,
            promotionCode: promotion?.code ?? null,
            promotionActive: promotion?.active ?? false,
            maxRedemptions:
              promotion?.max_redemptions ?? campaign.maxRedemptions,
            expiresAt: promotion?.expires_at ?? null,
            timesRedeemed: campaign.timesRedeemed,
            createdAt: campaign.createdAt,
            updatedAt: campaign.updatedAt,
          };
        })
        .filter((entry) =>
          input?.active === undefined
            ? true
            : entry.promotionActive === input.active,
        );
    }),

  setPartnerCodeActive: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        active: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "coupon.setPartnerCodeActive",
        maxRequests: 50,
        windowMs: 10 * 60 * 1000,
      });

      const campaign = await ctx.db.campaign.findUnique({
        where: { id: input.campaignId },
        select: { id: true, promotionCodeId: true },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Code nicht gefunden.",
        });
      }

      const updated = await stripeClient.promotionCodes.update(
        campaign.promotionCodeId,
        {
          active: input.active,
        },
      );

      return {
        id: campaign.id,
        promotionCodeId: updated.id,
        active: updated.active,
      };
    }),

  rotatePartnerCode: protectedProcedure
    .input(
      z.object({
        campaignId: z.string().min(1),
        promoCode: z.string().trim().optional(),
        maxRedemptions: z
          .number()
          .int()
          .min(1)
          .max(MAX_CAMPAIGN_MAX_REDEMPTIONS)
          .optional(),
        validForDays: z.number().int().min(1).max(365).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      enforceProcedureRateLimit(ctx, {
        scope: "coupon.rotatePartnerCode",
        maxRequests: 30,
        windowMs: 10 * 60 * 1000,
      });

      const campaign = await ctx.db.campaign.findUnique({
        where: { id: input.campaignId },
      });
      if (!campaign) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Partner-Code nicht gefunden.",
        });
      }

      const currentPromotion = await stripeClient.promotionCodes.retrieve(
        campaign.promotionCodeId,
      );
      const currentMetadata = currentPromotion.metadata ?? {};
      const partnerUserId =
        currentMetadata.partnerUserId ?? campaign.partnerUserId;
      const templateId = currentMetadata.templateId ?? campaign.templateId;
      const snapshotBookId =
        currentMetadata.snapshotBookId ?? campaign.snapshotBookId;
      const partnerAccountId = currentMetadata.partnerAccountId ?? "";

      const codeFromInput = input.promoCode
        ? normalizePromoCode(input.promoCode)
        : randomPromoCode();
      let promoCode = codeFromInput;
      if (!PROMO_CODE_REGEX.test(promoCode)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Promo-Code Format ist ungueltig.",
        });
      }

      let attempts = 0;
      while (attempts < 5) {
        const existingPromotionCodes = await stripeClient.promotionCodes.list({
          code: promoCode,
          active: true,
          limit: 1,
        });

        if (
          existingPromotionCodes.data.length === 0 ||
          existingPromotionCodes.data[0]?.id === currentPromotion.id
        ) {
          break;
        }

        if (input.promoCode) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Promo-Code existiert bereits.",
          });
        }
        promoCode = randomPromoCode();
        attempts += 1;
      }
      if (attempts >= 5) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Es konnte kein eindeutiger Promo-Code erstellt werden.",
        });
      }

      const desiredMaxRedemptions =
        input.maxRedemptions ??
        currentPromotion.max_redemptions ??
        campaign.maxRedemptions;
      const desiredExpiresAt =
        input.validForDays !== undefined
          ? Math.floor(Date.now() / 1000) + input.validForDays * SECONDS_IN_DAY
          : (currentPromotion.expires_at ?? undefined);

      const previousActiveState = currentPromotion.active;
      if (currentPromotion.active) {
        await stripeClient.promotionCodes.update(currentPromotion.id, {
          active: false,
        });
      }

      try {
        const coupon = await stripeClient.coupons.create({
          duration: "once",
          percent_off: 100,
          max_redemptions: desiredMaxRedemptions,
          ...(desiredExpiresAt ? { redeem_by: desiredExpiresAt } : {}),
          metadata: {
            kind: CAMPAIGN_KIND,
            partnerUserId,
            templateId,
            snapshotBookId,
            partnerAccountId,
            rotatedByUserId: ctx.session.user.id,
          },
        });

        const nextPromotion = await stripeClient.promotionCodes.create({
          promotion: {
            type: "coupon",
            coupon: coupon.id,
          },
          code: promoCode,
          max_redemptions: desiredMaxRedemptions,
          ...(desiredExpiresAt ? { expires_at: desiredExpiresAt } : {}),
          metadata: {
            kind: CAMPAIGN_KIND,
            partnerUserId,
            templateId,
            snapshotBookId,
            partnerAccountId,
            rotatedByUserId: ctx.session.user.id,
          },
        });

        await ctx.db.campaign.update({
          where: { id: campaign.id },
          data: {
            promotionCodeId: nextPromotion.id,
            maxRedemptions: desiredMaxRedemptions,
            expiresAt: desiredExpiresAt
              ? new Date(desiredExpiresAt * 1000)
              : null,
          },
        });

        return {
          campaignId: campaign.id,
          promotionCodeId: nextPromotion.id,
          promoCode: nextPromotion.code,
          active: nextPromotion.active,
          maxRedemptions: nextPromotion.max_redemptions,
          expiresAt: nextPromotion.expires_at,
        };
      } catch (error) {
        if (previousActiveState) {
          try {
            await stripeClient.promotionCodes.update(currentPromotion.id, {
              active: true,
            });
          } catch {
            logger.error("coupon_rotate_partner_code_reactivate_failed", {
              campaignId: campaign.id,
              promotionCodeId: currentPromotion.id,
            });
          }
        }
        throw error;
      }
    }),
});
