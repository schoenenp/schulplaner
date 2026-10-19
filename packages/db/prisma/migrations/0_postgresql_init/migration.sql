CREATE EXTENSION IF NOT EXISTS citext;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TagStatus" AS ENUM ('RELEASED', 'BETA', 'UNRELEASED');

-- CreateEnum
CREATE TYPE "TagType" AS ENUM ('CONFIG', 'FUNCTION', 'DEFAULT');

-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PDF', 'IMAGE_PNG', 'IMAGE_JPEG');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PENDING', 'PREPARING', 'SHIPPED', 'COMPLETED', 'RETOURING', 'RETOURED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'COMPLETED', 'SHIPPED', 'CANCELED', 'FAILED');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'MODERATOR', 'USER', 'SPONSOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "BookPart" AS ENUM ('COVER', 'DEFAULT', 'PLANNER', 'BINDING', 'SETTINGS');

-- CreateEnum
CREATE TYPE "ModuleColors" AS ENUM ('GRAYSCALE', 'COLOR');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'SHARED', 'PRIVATE');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ORGANIZATION', 'SCHOOL', 'WAREHOUSE', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "PartnerClaimStatus" AS ENUM ('PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "BookSourceType" AS ENUM ('STANDARD', 'PARTNER_TEMPLATE', 'TEMPLATE_SHARE');

-- CreateEnum
CREATE TYPE "TemplateShareKind" AS ENUM ('LINK', 'INVITE');

-- CreateEnum
CREATE TYPE "PartnerOrderStatus" AS ENUM ('SUBMITTED_BY_SCHOOL', 'UNDER_PARTNER_REVIEW', 'PARTNER_CONFIRMED', 'PARTNER_DECLINED', 'RELEASED_TO_PRODUCTION', 'FULFILLED');

-- CreateEnum
CREATE TYPE "PartnerNotificationType" AS ENUM ('INCOMING_PARTNER_ORDER', 'PARTNER_ORDER_CONFIRMED', 'PARTNER_ORDER_DECLINED', 'PARTNER_ORDER_RELEASED');

-- CreateEnum
CREATE TYPE "PartnerSettlementBatchStatus" AS ENUM ('DRAFT', 'FINALIZED', 'EXPORTED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "Book" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "bookTitle" TEXT,
    "subTitle" TEXT,
    "format" TEXT NOT NULL DEFAULT 'A5',
    "region" TEXT,
    "planStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "planEnd" TIMESTAMP(3),
    "country" TEXT NOT NULL DEFAULT 'DE',
    "createdById" TEXT,
    "copyFromId" TEXT,
    "isTemplate" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "clientRef" TEXT DEFAULT 'pirrot',
    "sourceType" "BookSourceType" NOT NULL DEFAULT 'STANDARD',
    "partnerClaimId" TEXT,
    "partnerPromotionCodeId" TEXT,
    "partnerSnapshotBookId" TEXT,

    CONSTRAINT "Book_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookModule" (
    "id" TEXT NOT NULL,
    "idx" INTEGER NOT NULL DEFAULT 0,
    "colorCode" "ModuleColors",
    "bookId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,

    CONSTRAINT "BookModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModuleType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPages" INTEGER NOT NULL DEFAULT 0,
    "maxPages" INTEGER NOT NULL DEFAULT -1,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ModuleType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "typeId" TEXT NOT NULL,
    "part" "BookPart" NOT NULL DEFAULT 'DEFAULT',
    "theme" TEXT,
    "visible" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "size" INTEGER NOT NULL DEFAULT 15,
    "src" TEXT NOT NULL,
    "type" "FileType" NOT NULL DEFAULT 'PDF',
    "pageCount" INTEGER,
    "srcGrayscale" TEXT,

    CONSTRAINT "File_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "refresh_token_expires_in" INTEGER,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "email" CITEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" SERIAL NOT NULL,
    "userId" TEXT,
    "orderKey" TEXT,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "shippingId" TEXT,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "shippingCost" INTEGER NOT NULL DEFAULT 0,
    "price" INTEGER NOT NULL DEFAULT 0,
    "total" INTEGER NOT NULL DEFAULT 0,
    "shopId" TEXT,
    "cancelKey" TEXT,
    "refundId" TEXT,
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookOrder" (
    "id" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "bookId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" INTEGER,

    CONSTRAINT "BookOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tooltip" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "tip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tooltip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" CITEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Shipping" (
    "id" TEXT NOT NULL,
    "title" TEXT,
    "trackId" TEXT,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "shippedAt" TIMESTAMP(3),
    "retouredAt" TIMESTAMP(3),

    CONSTRAINT "Shipping_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "streetNr" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "state" TEXT,
    "optional" TEXT,
    "country" TEXT NOT NULL DEFAULT 'DE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Location" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "LocationType" NOT NULL DEFAULT 'OTHER',
    "addressId" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,

    CONSTRAINT "Location_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "type" "TagType" NOT NULL DEFAULT 'DEFAULT',
    "name" TEXT NOT NULL,
    "desc" TEXT,
    "output" TEXT,
    "status" "TagStatus" NOT NULL DEFAULT 'UNRELEASED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomDate" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,

    CONSTRAINT "CustomDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "sponsorUserId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "snapshotBookId" TEXT NOT NULL,
    "promotionCodeId" TEXT NOT NULL,
    "maxRedemptions" INTEGER NOT NULL,
    "timesRedeemed" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOrder" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "schoolUserId" TEXT,
    "reviewedByUserId" TEXT,
    "bookId" TEXT NOT NULL,
    "orderId" INTEGER,
    "status" "PartnerOrderStatus" NOT NULL DEFAULT 'SUBMITTED_BY_SCHOOL',
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "releasedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "schoolSnapshot" JSONB,
    "partnerSnapshot" JSONB,
    "lineItemsSnapshot" JSONB,
    "sourceCampaignId" TEXT,
    "sourceClaimId" TEXT,
    "settlementBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerNotification" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "partnerOrderId" TEXT,
    "type" "PartnerNotificationType" NOT NULL,
    "payload" JSONB,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOrderTransition" (
    "id" TEXT NOT NULL,
    "partnerOrderId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "fromStatus" "PartnerOrderStatus",
    "toStatus" "PartnerOrderStatus",
    "correlationId" TEXT NOT NULL,
    "payloadHash" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerOrderTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSettlementBatch" (
    "id" TEXT NOT NULL,
    "partnerUserId" TEXT NOT NULL,
    "cycleStart" TIMESTAMP(3) NOT NULL,
    "cycleEnd" TIMESTAMP(3) NOT NULL,
    "status" "PartnerSettlementBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "summary" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finalizedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerSettlementBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerClaim" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "promotionCodeId" TEXT NOT NULL,
    "snapshotBookId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "bookId" TEXT,
    "status" "PartnerClaimStatus" NOT NULL DEFAULT 'PENDING',
    "verifyTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateShare" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "TemplateShareKind" NOT NULL DEFAULT 'LINK',
    "recipientEmail" TEXT,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TemplateShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateShareClaim" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateShareClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_BookModuleToLocation" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_BookModuleToLocation_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_ModuleToTag" (
    "A" TEXT NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_ModuleToTag_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_FileToModule" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_FileToModule_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "Book_partnerClaimId_key" ON "Book"("partnerClaimId");

-- CreateIndex
CREATE INDEX "Book_createdById_idx" ON "Book"("createdById");

-- CreateIndex
CREATE INDEX "Book_copyFromId_idx" ON "Book"("copyFromId");

-- CreateIndex
CREATE INDEX "BookModule_moduleId_idx" ON "BookModule"("moduleId");

-- CreateIndex
CREATE UNIQUE INDEX "BookModule_bookId_moduleId_key" ON "BookModule"("bookId", "moduleId");

-- CreateIndex
CREATE INDEX "ModuleType_name_idx" ON "ModuleType"("name");

-- CreateIndex
CREATE INDEX "Module_typeId_idx" ON "Module"("typeId");

-- CreateIndex
CREATE INDEX "Module_createdById_idx" ON "Module"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "File_id_name_key" ON "File"("id", "name");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderKey_key" ON "Order"("orderKey");

-- CreateIndex
CREATE UNIQUE INDEX "Order_shippingId_key" ON "Order"("shippingId");

-- CreateIndex
CREATE INDEX "Order_userId_idx" ON "Order"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "BookOrder_paymentId_key" ON "BookOrder"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "BookOrder_orderId_key" ON "BookOrder"("orderId");

-- CreateIndex
CREATE INDEX "BookOrder_bookId_idx" ON "BookOrder"("bookId");

-- CreateIndex
CREATE INDEX "Tooltip_title_idx" ON "Tooltip"("title");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Location_addressId_idx" ON "Location"("addressId");

-- CreateIndex
CREATE INDEX "Location_creatorId_idx" ON "Location"("creatorId");

-- CreateIndex
CREATE INDEX "CustomDate_bookId_idx" ON "CustomDate"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "Campaign_promotionCodeId_key" ON "Campaign"("promotionCodeId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrder_bookId_key" ON "PartnerOrder"("bookId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOrder_orderId_key" ON "PartnerOrder"("orderId");

-- CreateIndex
CREATE INDEX "PartnerOrder_partnerUserId_status_updatedAt_idx" ON "PartnerOrder"("partnerUserId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "PartnerOrder_status_submittedAt_idx" ON "PartnerOrder"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "PartnerOrder_partnerUserId_settlementBatchId_status_idx" ON "PartnerOrder"("partnerUserId", "settlementBatchId", "status");

-- CreateIndex
CREATE INDEX "PartnerOrder_schoolUserId_idx" ON "PartnerOrder"("schoolUserId");

-- CreateIndex
CREATE INDEX "PartnerOrder_reviewedByUserId_idx" ON "PartnerOrder"("reviewedByUserId");

-- CreateIndex
CREATE INDEX "PartnerOrder_settlementBatchId_idx" ON "PartnerOrder"("settlementBatchId");

-- CreateIndex
CREATE INDEX "PartnerNotification_partnerUserId_readAt_createdAt_idx" ON "PartnerNotification"("partnerUserId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerNotification_type_createdAt_idx" ON "PartnerNotification"("type", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerNotification_partnerOrderId_idx" ON "PartnerNotification"("partnerOrderId");

-- CreateIndex
CREATE INDEX "PartnerOrderTransition_partnerOrderId_createdAt_idx" ON "PartnerOrderTransition"("partnerOrderId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerOrderTransition_actorUserId_createdAt_idx" ON "PartnerOrderTransition"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "PartnerSettlementBatch_partnerUserId_status_cycleStart_cycl_idx" ON "PartnerSettlementBatch"("partnerUserId", "status", "cycleStart", "cycleEnd");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerClaim_verifyTokenHash_key" ON "PartnerClaim"("verifyTokenHash");

-- CreateIndex
CREATE INDEX "PartnerClaim_email_status_idx" ON "PartnerClaim"("email", "status");

-- CreateIndex
CREATE INDEX "PartnerClaim_promotionCodeId_status_idx" ON "PartnerClaim"("promotionCodeId", "status");

-- CreateIndex
CREATE INDEX "PartnerClaim_userId_idx" ON "PartnerClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateShare_tokenHash_key" ON "TemplateShare"("tokenHash");

-- CreateIndex
CREATE INDEX "TemplateShare_templateId_kind_expiresAt_idx" ON "TemplateShare"("templateId", "kind", "expiresAt");

-- CreateIndex
CREATE INDEX "TemplateShare_createdById_createdAt_idx" ON "TemplateShare"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "TemplateShare_recipientEmail_idx" ON "TemplateShare"("recipientEmail");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateShareClaim_bookId_key" ON "TemplateShareClaim"("bookId");

-- CreateIndex
CREATE INDEX "TemplateShareClaim_email_idx" ON "TemplateShareClaim"("email");

-- CreateIndex
CREATE INDEX "TemplateShareClaim_userId_idx" ON "TemplateShareClaim"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateShareClaim_shareId_userId_key" ON "TemplateShareClaim"("shareId", "userId");

-- CreateIndex
CREATE INDEX "_BookModuleToLocation_B_index" ON "_BookModuleToLocation"("B");

-- CreateIndex
CREATE INDEX "_ModuleToTag_B_index" ON "_ModuleToTag"("B");

-- CreateIndex
CREATE INDEX "_FileToModule_B_index" ON "_FileToModule"("B");

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_copyFromId_fkey" FOREIGN KEY ("copyFromId") REFERENCES "Book"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Book" ADD CONSTRAINT "Book_partnerClaimId_fkey" FOREIGN KEY ("partnerClaimId") REFERENCES "PartnerClaim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookModule" ADD CONSTRAINT "BookModule_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookModule" ADD CONSTRAINT "BookModule_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "Module"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ModuleType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Module" ADD CONSTRAINT "Module_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shippingId_fkey" FOREIGN KEY ("shippingId") REFERENCES "Shipping"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookOrder" ADD CONSTRAINT "BookOrder_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookOrder" ADD CONSTRAINT "BookOrder_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookOrder" ADD CONSTRAINT "BookOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Location" ADD CONSTRAINT "Location_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomDate" ADD CONSTRAINT "CustomDate_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrder" ADD CONSTRAINT "PartnerOrder_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrder" ADD CONSTRAINT "PartnerOrder_schoolUserId_fkey" FOREIGN KEY ("schoolUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrder" ADD CONSTRAINT "PartnerOrder_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrder" ADD CONSTRAINT "PartnerOrder_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrder" ADD CONSTRAINT "PartnerOrder_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrder" ADD CONSTRAINT "PartnerOrder_settlementBatchId_fkey" FOREIGN KEY ("settlementBatchId") REFERENCES "PartnerSettlementBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNotification" ADD CONSTRAINT "PartnerNotification_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNotification" ADD CONSTRAINT "PartnerNotification_partnerOrderId_fkey" FOREIGN KEY ("partnerOrderId") REFERENCES "PartnerOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrderTransition" ADD CONSTRAINT "PartnerOrderTransition_partnerOrderId_fkey" FOREIGN KEY ("partnerOrderId") REFERENCES "PartnerOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOrderTransition" ADD CONSTRAINT "PartnerOrderTransition_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSettlementBatch" ADD CONSTRAINT "PartnerSettlementBatch_partnerUserId_fkey" FOREIGN KEY ("partnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClaim" ADD CONSTRAINT "PartnerClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateShare" ADD CONSTRAINT "TemplateShare_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateShare" ADD CONSTRAINT "TemplateShare_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateShareClaim" ADD CONSTRAINT "TemplateShareClaim_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "TemplateShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateShareClaim" ADD CONSTRAINT "TemplateShareClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateShareClaim" ADD CONSTRAINT "TemplateShareClaim_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookModuleToLocation" ADD CONSTRAINT "_BookModuleToLocation_A_fkey" FOREIGN KEY ("A") REFERENCES "BookModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_BookModuleToLocation" ADD CONSTRAINT "_BookModuleToLocation_B_fkey" FOREIGN KEY ("B") REFERENCES "Location"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ModuleToTag" ADD CONSTRAINT "_ModuleToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_ModuleToTag" ADD CONSTRAINT "_ModuleToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileToModule" ADD CONSTRAINT "_FileToModule_A_fkey" FOREIGN KEY ("A") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_FileToModule" ADD CONSTRAINT "_FileToModule_B_fkey" FOREIGN KEY ("B") REFERENCES "Module"("id") ON DELETE CASCADE ON UPDATE CASCADE;
