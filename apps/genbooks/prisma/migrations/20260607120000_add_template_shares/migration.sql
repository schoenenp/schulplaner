-- Add private template sharing. Shared planners are regular owned books with
-- sourceType TEMPLATE_SHARE; share and claim rows keep tokens revocable,
-- expirable, and idempotent per user.

ALTER TABLE `Book`
  MODIFY `sourceType` ENUM('STANDARD', 'PARTNER_TEMPLATE', 'TEMPLATE_SHARE') NOT NULL DEFAULT 'STANDARD';

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

CREATE TABLE `TemplateShareClaim` (
  `id` VARCHAR(191) NOT NULL,
  `shareId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `bookId` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL,
  `claimedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  UNIQUE INDEX `TemplateShareClaim_bookId_key`(`bookId`),
  UNIQUE INDEX `TemplateShareClaim_shareId_userId_key`(`shareId`, `userId`),
  INDEX `TemplateShareClaim_email_idx`(`email`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TemplateShare`
  ADD CONSTRAINT `TemplateShare_templateId_fkey`
  FOREIGN KEY (`templateId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TemplateShare`
  ADD CONSTRAINT `TemplateShare_createdById_fkey`
  FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TemplateShareClaim`
  ADD CONSTRAINT `TemplateShareClaim_shareId_fkey`
  FOREIGN KEY (`shareId`) REFERENCES `TemplateShare`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TemplateShareClaim`
  ADD CONSTRAINT `TemplateShareClaim_userId_fkey`
  FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `TemplateShareClaim`
  ADD CONSTRAINT `TemplateShareClaim_bookId_fkey`
  FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
