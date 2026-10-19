/** Preserve legacy references while copying assets to the configured private S3 prefix. */
import { PrismaClient } from "db";
import { storageClient, storageConfig, storageObjectKey } from "books-storage";
import { migrateStorage, migrationMode, migrationReferences } from "../packages/storage/src/migration";

const mode = migrationMode(process.argv.slice(2));
const prisma = new PrismaClient();
try {
  // Include soft-deleted and disconnected files; they may be needed for retained orders.
  const files = await prisma.file.findMany({ select: { src: true, srcGrayscale: true } });
  const { references, unsupported } = migrationReferences(files, process.env.CUSTOM_COVER_TEMPLATE_URL);
  for (const reference of unsupported) console.warn(`Unsupported reference (not copied): ${reference}`);
  const { bucket, prefix } = storageConfig();
  console.log(`${mode}: ${references.length} unique references; target ${bucket}/${prefix || "(root)"}; ${unsupported.length} unsupported references.`);
  const stats = await migrateStorage(references, {
    mode, bucket, objectKey: storageObjectKey,
    client: mode === "dry-run" ? undefined : storageClient(),
    legacyOrigin: process.env.LEGACY_STORAGE_URL,
    legacyApiKey: process.env.LEGACY_STORAGE_API_KEY,
  });
  console.log(JSON.stringify(stats));
  if (stats.failed || unsupported.length) {
    process.exitCode = 1;
    console.error("Resolve failed/unsupported references before switching delivery or retiring the legacy server.");
  }
  if (mode === "dry-run") console.log("Dry run completed without S3 requests or writes. Use --apply to copy, then --verify to compare stored bytes.");
} finally {
  await prisma.$disconnect();
}
