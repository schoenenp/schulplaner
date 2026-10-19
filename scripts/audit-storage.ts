/** Read-only object inventory. Never deletes, changes policies, or modifies the database. */
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { PrismaClient } from "db";
import { storageClient, storageConfig, storageObjectKey } from "books-storage";
import { storagePath } from "books-storage/references";
import { auditObjectListing } from "../packages/storage/src/audit";

if (process.argv.length > 2) throw new Error("Usage: bun run storage:audit (read-only; no --apply mode)");

const prisma = new PrismaClient();
try {
  const { bucket, prefix } = storageConfig();
  const client = storageClient();
  // Intentionally include every File row, including disconnected files and
  // files belonging to soft-deleted modules. No retention policy is inferred.
  const files = await prisma.file.findMany({ select: { src: true, srcGrayscale: true } });
  const referencedKeys = new Set<string>([storageObjectKey("/storage/notizen.pdf")]);
  const unsupportedReferences = new Set<string>();
  const include = (src: string | null | undefined) => {
    if (!src) return;
    let path: string | null = null;
    try { path = storagePath(src); } catch { /* Report malformed legacy references for review. */ }
    if (path) referencedKeys.add(storageObjectKey(path));
    else unsupportedReferences.add(src);
  };
  for (const file of files) {
    include(file.src);
    include(file.srcGrayscale);
  }
  include(process.env.CUSTOM_COVER_TEMPLATE_URL);

  const report = await auditObjectListing({
    bucket, prefix, referencedKeys,
    listPage: (request) => client.send(new ListObjectsV2Command(request)),
  });
  console.log(JSON.stringify({
    mode: "read-only",
    complete: report.complete,
    bucket,
    namespace: prefix ? `${prefix}/` : "entire bucket (S3_PREFIX is empty)",
    fileRows: files.length,
    knownReferenceCount: referencedKeys.size,
    unsupportedReferenceCount: unsupportedReferences.size,
    pagesListed: report.pages,
    total: report.total,
    byStorageClass: report.byStorageClass,
    referenced: report.referenced,
    notReferencedByThisDatabase: {
      status: "Review only: these objects may be needed by other apps, external references, or an unfinished upload.",
      ...report.unreferenced,
      largest20: report.largestUnreferenced,
    },
    knownReferencesMissingFromListing: {
      count: report.missingReferenceCount,
      first20: report.missingReferenceSample,
    },
    limitations: [
      "Current objects only; excludes noncurrent versions, delete markers and incomplete multipart uploads.",
      "Sizes come from S3 listings, not legacy File.size metadata; provider billing and object metadata overhead are not included.",
      "Versioning and lifecycle policies are not inspected or modified. No storage class changes are applied.",
      "A listing is not a point-in-time snapshot; uploads or deletions during this run can affect the totals.",
      "Unsupported/external references are counted but cannot be matched to objects in this namespace.",
    ],
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    mode: "read-only",
    complete: false,
    warning: "Inventory did not complete. No totals or missing-reference findings from this run are valid. No objects or database rows were changed.",
  }, null, 2));
  throw error;
} finally {
  await prisma.$disconnect();
}
