import { PrismaClient } from "@prisma/client";

export {
  BookPart,
  BookSourceType,
  DeliveryStatus,
  FileType,
  LocationType,
  ModuleColors,
  OrderStatus,
  PartnerClaimStatus,
  PartnerNotificationType,
  PartnerOrderStatus,
  PartnerSettlementBatchStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  TagStatus,
  TagType,
  TemplateShareKind,
  UserRole,
  Visibility,
} from "@prisma/client";
export type {
  Account,
  Address,
  Book,
  BookModule,
  BookOrder,
  Campaign,
  CustomDate,
  File,
  Location,
  Module,
  ModuleType,
  Order,
  PartnerClaim,
  PartnerNotification,
  PartnerOrder,
  PartnerOrderTransition,
  PartnerSettlementBatch,
  Payment,
  Session,
  Shipping,
  Tag,
  TemplateShare,
  TemplateShareClaim,
  Tooltip,
  User,
  VerificationToken,
} from "@prisma/client";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
