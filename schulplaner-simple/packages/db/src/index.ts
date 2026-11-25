import { PrismaClient } from "@prisma/client";

export {
  BookPart,
  FileType,
  ModuleColors,
  OrderStatus,
  PaymentStatus,
  Prisma,
  PrismaClient,
  UserRole,
  Visibility,
} from "@prisma/client";
export type {
  Account,
  Book,
  BookModule,
  CustomDate,
  File,
  Module,
  ModuleType,
  Order,
  OrderEvent,
  Session,
  ShopSettings,
  User,
  VerificationToken,
} from "@prisma/client";

const createPrismaClient = () =>
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development" && process.env.PRISMA_LOG_QUERIES
        ? ["query", "error", "warn"]
        : ["error"],
  });

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;
