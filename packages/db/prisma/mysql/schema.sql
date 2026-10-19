-- CreateTable
CREATE TABLE `Book` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `bookTitle` VARCHAR(191) NULL,
    `subTitle` VARCHAR(191) NULL,
    `format` VARCHAR(191) NOT NULL DEFAULT 'A5',
    `region` VARCHAR(191) NULL,
    `planStart` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `planEnd` DATETIME(3) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'DE',
    `createdById` VARCHAR(191) NULL,
    `copyFromId` VARCHAR(191) NULL,
    `isTemplate` BOOLEAN NOT NULL DEFAULT false,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `isPublic` BOOLEAN NOT NULL DEFAULT false,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `clientRef` VARCHAR(191) NULL DEFAULT 'pirrot',
    `sourceType` ENUM('STANDARD', 'PARTNER_TEMPLATE', 'TEMPLATE_SHARE') NOT NULL DEFAULT 'STANDARD',
    `partnerClaimId` VARCHAR(191) NULL,
    `partnerPromotionCodeId` VARCHAR(191) NULL,
    `partnerSnapshotBookId` VARCHAR(191) NULL,

    UNIQUE INDEX `Book_partnerClaimId_key`(`partnerClaimId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookModule` (
    `id` VARCHAR(191) NOT NULL,
    `idx` INTEGER NOT NULL DEFAULT 0,
    `colorCode` ENUM('GRAYSCALE', 'COLOR') NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `moduleId` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `BookModule_bookId_moduleId_key`(`bookId`, `moduleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ModuleType` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `minPages` INTEGER NOT NULL DEFAULT 0,
    `maxPages` INTEGER NOT NULL DEFAULT -1,
    `deletedAt` DATETIME(3) NULL,

    INDEX `ModuleType_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Module` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `typeId` VARCHAR(191) NOT NULL,
    `part` ENUM('COVER', 'DEFAULT', 'PLANNER', 'BINDING', 'SETTINGS') NOT NULL DEFAULT 'DEFAULT',
    `theme` VARCHAR(191) NULL,
    `visible` ENUM('PUBLIC', 'SHARED', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `File` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `size` INTEGER NOT NULL DEFAULT 15,
    `src` VARCHAR(191) NOT NULL,
    `type` ENUM('PDF', 'IMAGE_PNG', 'IMAGE_JPEG') NOT NULL DEFAULT 'PDF',
    `pageCount` INTEGER NULL,
    `srcGrayscale` VARCHAR(191) NULL,

    UNIQUE INDEX `File_id_name_key`(`id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Account` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` TEXT NULL,
    `access_token` TEXT NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` TEXT NULL,
    `session_state` VARCHAR(191) NULL,
    `refresh_token_expires_in` INTEGER NULL,

    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Session` (
    `id` VARCHAR(191) NOT NULL,
    `sessionToken` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Session_sessionToken_key`(`sessionToken`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `role` ENUM('ADMIN', 'STAFF', 'MODERATOR', 'USER', 'SPONSOR', 'PARTNER') NOT NULL DEFAULT 'USER',
    `email` VARCHAR(191) NULL,
    `emailVerified` DATETIME(3) NULL,
    `image` VARCHAR(191) NULL,

    UNIQUE INDEX `User_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` VARCHAR(191) NULL,
    `orderKey` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'COMPLETED', 'SHIPPED', 'CANCELED', 'FAILED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `canceledAt` DATETIME(3) NULL,
    `shippingId` VARCHAR(191) NULL,

    UNIQUE INDEX `Order_orderKey_key`(`orderKey`),
    UNIQUE INDEX `Order_shippingId_key`(`shippingId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `status` ENUM('PENDING', 'SUCCEEDED', 'FAILED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `shippingCost` INTEGER NOT NULL DEFAULT 0,
    `price` INTEGER NOT NULL DEFAULT 0,
    `total` INTEGER NOT NULL DEFAULT 0,
    `shopId` VARCHAR(191) NULL,
    `cancelKey` TEXT NULL,
    `refundId` VARCHAR(191) NULL,
    `refundedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookOrder` (
    `id` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NOT NULL,
    `orderId` INTEGER NULL,

    UNIQUE INDEX `BookOrder_paymentId_key`(`paymentId`),
    UNIQUE INDEX `BookOrder_orderId_key`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tooltip` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(191) NOT NULL,
    `tip` TEXT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    INDEX `Tooltip_title_idx`(`title`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `VerificationToken` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `VerificationToken_token_key`(`token`),
    UNIQUE INDEX `VerificationToken_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shipping` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `trackId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PREPARING', 'SHIPPED', 'COMPLETED', 'RETOURING', 'RETOURED') NOT NULL DEFAULT 'PENDING',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,
    `shippedAt` DATETIME(3) NULL,
    `retouredAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Address` (
    `id` VARCHAR(191) NOT NULL,
    `street` VARCHAR(191) NOT NULL,
    `streetNr` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `zip` VARCHAR(191) NOT NULL,
    `state` VARCHAR(191) NULL,
    `optional` VARCHAR(191) NULL,
    `country` VARCHAR(191) NOT NULL DEFAULT 'DE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Location` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `type` ENUM('ORGANIZATION', 'SCHOOL', 'WAREHOUSE', 'OTHER') NOT NULL DEFAULT 'OTHER',
    `addressId` VARCHAR(191) NOT NULL,
    `creatorId` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Tag` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('CONFIG', 'FUNCTION', 'DEFAULT') NOT NULL DEFAULT 'DEFAULT',
    `name` VARCHAR(191) NOT NULL,
    `desc` VARCHAR(191) NULL,
    `output` VARCHAR(191) NULL,
    `status` ENUM('RELEASED', 'BETA', 'UNRELEASED') NOT NULL DEFAULT 'UNRELEASED',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `deletedAt` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomDate` (
    `id` VARCHAR(191) NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,

    INDEX `CustomDate_bookId_idx`(`bookId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Campaign` (
    `id` VARCHAR(191) NOT NULL,
    `sponsorUserId` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `snapshotBookId` VARCHAR(191) NOT NULL,
    `promotionCodeId` VARCHAR(191) NOT NULL,
    `maxRedemptions` INTEGER NOT NULL,
    `timesRedeemed` INTEGER NOT NULL DEFAULT 0,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Campaign_promotionCodeId_key`(`promotionCodeId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerOrder` (
    `id` VARCHAR(191) NOT NULL,
    `partnerUserId` VARCHAR(191) NOT NULL,
    `schoolUserId` VARCHAR(191) NULL,
    `reviewedByUserId` VARCHAR(191) NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `orderId` INTEGER NULL,
    `status` ENUM('SUBMITTED_BY_SCHOOL', 'UNDER_PARTNER_REVIEW', 'PARTNER_CONFIRMED', 'PARTNER_DECLINED', 'RELEASED_TO_PRODUCTION', 'FULFILLED') NOT NULL DEFAULT 'SUBMITTED_BY_SCHOOL',
    `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `reviewedAt` DATETIME(3) NULL,
    `declineReason` TEXT NULL,
    `releasedAt` DATETIME(3) NULL,
    `fulfilledAt` DATETIME(3) NULL,
    `schoolSnapshot` JSON NULL,
    `partnerSnapshot` JSON NULL,
    `lineItemsSnapshot` JSON NULL,
    `sourceCampaignId` VARCHAR(191) NULL,
    `sourceClaimId` VARCHAR(191) NULL,
    `settlementBatchId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerOrder_bookId_key`(`bookId`),
    UNIQUE INDEX `PartnerOrder_orderId_key`(`orderId`),
    INDEX `PartnerOrder_partnerUserId_status_updatedAt_idx`(`partnerUserId`, `status`, `updatedAt`),
    INDEX `PartnerOrder_status_submittedAt_idx`(`status`, `submittedAt`),
    INDEX `PartnerOrder_partnerUserId_settlementBatchId_status_idx`(`partnerUserId`, `settlementBatchId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerNotification` (
    `id` VARCHAR(191) NOT NULL,
    `partnerUserId` VARCHAR(191) NOT NULL,
    `partnerOrderId` VARCHAR(191) NULL,
    `type` ENUM('INCOMING_PARTNER_ORDER', 'PARTNER_ORDER_CONFIRMED', 'PARTNER_ORDER_DECLINED', 'PARTNER_ORDER_RELEASED') NOT NULL,
    `payload` JSON NULL,
    `readAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerNotification_partnerUserId_readAt_createdAt_idx`(`partnerUserId`, `readAt`, `createdAt`),
    INDEX `PartnerNotification_type_createdAt_idx`(`type`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerOrderTransition` (
    `id` VARCHAR(191) NOT NULL,
    `partnerOrderId` VARCHAR(191) NOT NULL,
    `actorUserId` VARCHAR(191) NULL,
    `fromStatus` ENUM('SUBMITTED_BY_SCHOOL', 'UNDER_PARTNER_REVIEW', 'PARTNER_CONFIRMED', 'PARTNER_DECLINED', 'RELEASED_TO_PRODUCTION', 'FULFILLED') NULL,
    `toStatus` ENUM('SUBMITTED_BY_SCHOOL', 'UNDER_PARTNER_REVIEW', 'PARTNER_CONFIRMED', 'PARTNER_DECLINED', 'RELEASED_TO_PRODUCTION', 'FULFILLED') NULL,
    `correlationId` VARCHAR(191) NOT NULL,
    `payloadHash` VARCHAR(191) NULL,
    `payload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PartnerOrderTransition_partnerOrderId_createdAt_idx`(`partnerOrderId`, `createdAt`),
    INDEX `PartnerOrderTransition_actorUserId_createdAt_idx`(`actorUserId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerSettlementBatch` (
    `id` VARCHAR(191) NOT NULL,
    `partnerUserId` VARCHAR(191) NOT NULL,
    `cycleStart` DATETIME(3) NOT NULL,
    `cycleEnd` DATETIME(3) NOT NULL,
    `status` ENUM('DRAFT', 'FINALIZED', 'EXPORTED', 'PAID', 'CANCELLED') NOT NULL DEFAULT 'DRAFT',
    `currency` VARCHAR(191) NOT NULL DEFAULT 'EUR',
    `summary` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `finalizedAt` DATETIME(3) NULL,

    INDEX `PartnerSettlementBatch_partnerUserId_status_cycleStart_cycle_idx`(`partnerUserId`, `status`, `cycleStart`, `cycleEnd`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PartnerClaim` (
    `id` VARCHAR(191) NOT NULL,
    `campaignId` VARCHAR(191) NULL,
    `promotionCodeId` VARCHAR(191) NOT NULL,
    `snapshotBookId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `bookId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'VERIFIED', 'CONSUMED', 'EXPIRED') NOT NULL DEFAULT 'PENDING',
    `verifyTokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `verifiedAt` DATETIME(3) NULL,
    `consumedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `PartnerClaim_verifyTokenHash_key`(`verifyTokenHash`),
    INDEX `PartnerClaim_email_status_idx`(`email`, `status`),
    INDEX `PartnerClaim_promotionCodeId_status_idx`(`promotionCodeId`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateShare` (
    `id` VARCHAR(191) NOT NULL,
    `templateId` VARCHAR(191) NOT NULL,
    `createdById` VARCHAR(191) NOT NULL,
    `kind` ENUM('LINK', 'INVITE') NOT NULL DEFAULT 'LINK',
    `recipientEmail` VARCHAR(191) NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `revokedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TemplateShare_tokenHash_key`(`tokenHash`),
    INDEX `TemplateShare_templateId_kind_expiresAt_idx`(`templateId`, `kind`, `expiresAt`),
    INDEX `TemplateShare_createdById_createdAt_idx`(`createdById`, `createdAt`),
    INDEX `TemplateShare_recipientEmail_idx`(`recipientEmail`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TemplateShareClaim` (
    `id` VARCHAR(191) NOT NULL,
    `shareId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `bookId` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `TemplateShareClaim_bookId_key`(`bookId`),
    INDEX `TemplateShareClaim_email_idx`(`email`),
    UNIQUE INDEX `TemplateShareClaim_shareId_userId_key`(`shareId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_BookModuleToLocation` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_BookModuleToLocation_AB_unique`(`A`, `B`),
    INDEX `_BookModuleToLocation_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_ModuleToTag` (
    `A` VARCHAR(191) NOT NULL,
    `B` INTEGER NOT NULL,

    UNIQUE INDEX `_ModuleToTag_AB_unique`(`A`, `B`),
    INDEX `_ModuleToTag_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `_FileToModule` (
    `A` VARCHAR(191) NOT NULL,
    `B` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `_FileToModule_AB_unique`(`A`, `B`),
    INDEX `_FileToModule_B_index`(`B`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Book` ADD CONSTRAINT `Book_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Book` ADD CONSTRAINT `Book_copyFromId_fkey` FOREIGN KEY (`copyFromId`) REFERENCES `Book`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Book` ADD CONSTRAINT `Book_partnerClaimId_fkey` FOREIGN KEY (`partnerClaimId`) REFERENCES `PartnerClaim`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookModule` ADD CONSTRAINT `BookModule_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookModule` ADD CONSTRAINT `BookModule_moduleId_fkey` FOREIGN KEY (`moduleId`) REFERENCES `Module`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Module` ADD CONSTRAINT `Module_typeId_fkey` FOREIGN KEY (`typeId`) REFERENCES `ModuleType`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Module` ADD CONSTRAINT `Module_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_shippingId_fkey` FOREIGN KEY (`shippingId`) REFERENCES `Shipping`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookOrder` ADD CONSTRAINT `BookOrder_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookOrder` ADD CONSTRAINT `BookOrder_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `Payment`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookOrder` ADD CONSTRAINT `BookOrder_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_addressId_fkey` FOREIGN KEY (`addressId`) REFERENCES `Address`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Location` ADD CONSTRAINT `Location_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CustomDate` ADD CONSTRAINT `CustomDate_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrder` ADD CONSTRAINT `PartnerOrder_partnerUserId_fkey` FOREIGN KEY (`partnerUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrder` ADD CONSTRAINT `PartnerOrder_schoolUserId_fkey` FOREIGN KEY (`schoolUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrder` ADD CONSTRAINT `PartnerOrder_reviewedByUserId_fkey` FOREIGN KEY (`reviewedByUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrder` ADD CONSTRAINT `PartnerOrder_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrder` ADD CONSTRAINT `PartnerOrder_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrder` ADD CONSTRAINT `PartnerOrder_settlementBatchId_fkey` FOREIGN KEY (`settlementBatchId`) REFERENCES `PartnerSettlementBatch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerNotification` ADD CONSTRAINT `PartnerNotification_partnerUserId_fkey` FOREIGN KEY (`partnerUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerNotification` ADD CONSTRAINT `PartnerNotification_partnerOrderId_fkey` FOREIGN KEY (`partnerOrderId`) REFERENCES `PartnerOrder`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrderTransition` ADD CONSTRAINT `PartnerOrderTransition_partnerOrderId_fkey` FOREIGN KEY (`partnerOrderId`) REFERENCES `PartnerOrder`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerOrderTransition` ADD CONSTRAINT `PartnerOrderTransition_actorUserId_fkey` FOREIGN KEY (`actorUserId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerSettlementBatch` ADD CONSTRAINT `PartnerSettlementBatch_partnerUserId_fkey` FOREIGN KEY (`partnerUserId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PartnerClaim` ADD CONSTRAINT `PartnerClaim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateShare` ADD CONSTRAINT `TemplateShare_templateId_fkey` FOREIGN KEY (`templateId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateShare` ADD CONSTRAINT `TemplateShare_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateShareClaim` ADD CONSTRAINT `TemplateShareClaim_shareId_fkey` FOREIGN KEY (`shareId`) REFERENCES `TemplateShare`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateShareClaim` ADD CONSTRAINT `TemplateShareClaim_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TemplateShareClaim` ADD CONSTRAINT `TemplateShareClaim_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_BookModuleToLocation` ADD CONSTRAINT `_BookModuleToLocation_A_fkey` FOREIGN KEY (`A`) REFERENCES `BookModule`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_BookModuleToLocation` ADD CONSTRAINT `_BookModuleToLocation_B_fkey` FOREIGN KEY (`B`) REFERENCES `Location`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ModuleToTag` ADD CONSTRAINT `_ModuleToTag_A_fkey` FOREIGN KEY (`A`) REFERENCES `Module`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_ModuleToTag` ADD CONSTRAINT `_ModuleToTag_B_fkey` FOREIGN KEY (`B`) REFERENCES `Tag`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FileToModule` ADD CONSTRAINT `_FileToModule_A_fkey` FOREIGN KEY (`A`) REFERENCES `File`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `_FileToModule` ADD CONSTRAINT `_FileToModule_B_fkey` FOREIGN KEY (`B`) REFERENCES `Module`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
