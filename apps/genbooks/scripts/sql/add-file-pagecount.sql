-- Legacy backfill prerequisite for PostgreSQL installations that predate the
-- current baseline. Fresh databases already have these columns through migrate deploy.
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "pageCount" INTEGER;
ALTER TABLE "File" ADD COLUMN IF NOT EXISTS "srcGrayscale" TEXT;
