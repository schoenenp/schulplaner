import { createHash, randomUUID } from "node:crypto";
import type { PartnerOrderStatus, PrismaClient, Prisma } from "@prisma/client";

const ALLOWED_STATUS_TRANSITIONS: Record<
  PartnerOrderStatus,
  ReadonlyArray<PartnerOrderStatus>
> = {
  SUBMITTED_BY_SCHOOL: ["UNDER_PARTNER_REVIEW", "PARTNER_CONFIRMED", "PARTNER_DECLINED"],
  UNDER_PARTNER_REVIEW: ["PARTNER_CONFIRMED", "PARTNER_DECLINED"],
  PARTNER_CONFIRMED: ["RELEASED_TO_PRODUCTION"],
  PARTNER_DECLINED: [],
  RELEASED_TO_PRODUCTION: ["FULFILLED"],
  FULFILLED: [],
};

export function canTransitionPartnerOrderStatus(
  from: PartnerOrderStatus,
  to: PartnerOrderStatus,
): boolean {
  return ALLOWED_STATUS_TRANSITIONS[from].includes(to);
}

export function buildPartnerOrderPayloadHash(payload: unknown): string {
  return createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

export function createPartnerCorrelationId(prefix = "partner"): string {
  return `${prefix}_${randomUUID()}`;
}

export async function recordPartnerOrderTransition(params: {
  db: PrismaClient;
  partnerOrderId: string;
  actorUserId?: string | null;
  fromStatus?: PartnerOrderStatus | null;
  toStatus?: PartnerOrderStatus | null;
  correlationId: string;
  payload?: unknown;
}) {
  await params.db.partnerOrderTransition.create({
    data: {
      partnerOrderId: params.partnerOrderId,
      actorUserId: params.actorUserId ?? null,
      fromStatus: params.fromStatus ?? null,
      toStatus: params.toStatus ?? null,
      correlationId: params.correlationId,
      payloadHash:
        params.payload === undefined
          ? null
          : buildPartnerOrderPayloadHash(params.payload),
      ...(params.payload === undefined
        ? {}
        : { payload: params.payload as Prisma.InputJsonValue }),
    },
  });
}

export function buildReleaseDispatchKey(
  partnerOrderId: string,
  releasedAt: Date,
): string {
  return `partner_release_${partnerOrderId}_${releasedAt.getTime()}`;
}
