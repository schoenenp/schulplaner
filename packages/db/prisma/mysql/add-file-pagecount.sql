-- Adds the stored PDF page count used by price estimation and the src of the
-- print-quality grayscale variant generated at upload.
-- Equivalent to running `prisma db push` after the schema change in
-- genbooks/prisma/schema.prisma (both apps share this database).
ALTER TABLE `File` ADD COLUMN `pageCount` INT NULL;
ALTER TABLE `File` ADD COLUMN `srcGrayscale` VARCHAR(191) NULL;
