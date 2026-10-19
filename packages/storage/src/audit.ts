import type { ListObjectsV2CommandInput, ListObjectsV2CommandOutput } from "@aws-sdk/client-s3";

type Totals = { objects: number; bytes: number };
type ListedObject = { key: string; bytes: number; storageClass: string; lastModified?: string };

/** Read-only current-object inventory. A missing database reference is not permission to delete. */
export async function auditObjectListing(input: {
  bucket: string;
  prefix: string;
  referencedKeys: ReadonlySet<string>;
  listPage: (request: ListObjectsV2CommandInput) => Promise<ListObjectsV2CommandOutput>;
}) {
  if (input.prefix && !input.prefix.split("/").every(segment => /^[a-zA-Z0-9._-]+$/.test(segment) && segment !== "." && segment !== "..")) {
    throw new Error("Audit prefix must contain safe relative path segments");
  }
  const prefix = input.prefix ? `${input.prefix}/` : undefined;
  if (prefix && [...input.referencedKeys].some(key => !key.startsWith(prefix))) {
    throw new Error("Audit references must belong to the requested namespace");
  }
  const total: Totals = { objects: 0, bytes: 0 };
  const referenced: Totals = { objects: 0, bytes: 0 };
  const unreferenced: Totals = { objects: 0, bytes: 0 };
  const byStorageClass: Record<string, Totals> = Object.create(null);
  const largestUnreferenced: ListedObject[] = [];
  const missingReferences = new Set(input.referencedKeys);
  const seenTokens = new Set<string>();
  let continuationToken: string | undefined;
  let pages = 0;
  do {
    const page = await input.listPage({
      Bucket: input.bucket, Prefix: prefix, MaxKeys: 1000,
      ContinuationToken: continuationToken,
    });
    pages++;
    for (const object of page.Contents ?? []) {
      const key = object.Key;
      const bytes = object.Size;
      if (!key || (prefix && !key.startsWith(prefix))) throw new Error("Storage listing returned a key outside the requested namespace");
      if (bytes === undefined || !Number.isSafeInteger(bytes) || bytes < 0) throw new Error("Storage listing returned an invalid object size");
      const storageClass = object.StorageClass ?? "STANDARD";
      const classTotals = byStorageClass[storageClass] ??= { objects: 0, bytes: 0 };
      total.objects++;
      total.bytes += bytes;
      classTotals.objects++;
      classTotals.bytes += bytes;
      const known = input.referencedKeys.has(key);
      const group = known ? referenced : unreferenced;
      group.objects++;
      group.bytes += bytes;
      if (known) {
        missingReferences.delete(key);
      } else {
        largestUnreferenced.push({ key, bytes, storageClass, lastModified: object.LastModified?.toISOString() });
        largestUnreferenced.sort((a, b) => b.bytes - a.bytes || a.key.localeCompare(b.key));
        if (largestUnreferenced.length > 20) largestUnreferenced.pop();
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
    if (page.IsTruncated && (!continuationToken || seenTokens.has(continuationToken))) {
      throw new Error("Storage listing returned a missing or repeated continuation token");
    }
    if (continuationToken) seenTokens.add(continuationToken);
  } while (continuationToken);

  return {
    complete: true as const,
    pages, total, byStorageClass, referenced, unreferenced, largestUnreferenced,
    missingReferenceCount: missingReferences.size,
    missingReferenceSample: [...missingReferences].slice(0, 20),
  };
}
