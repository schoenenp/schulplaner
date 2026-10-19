import { expect, test } from "bun:test";
import type { ListObjectsV2CommandInput } from "@aws-sdk/client-s3";
import { auditObjectListing } from "./audit";

test("paginates only the client namespace and separates known references from review-only objects", async () => {
  const requests: ListObjectsV2CommandInput[] = [];
  const report = await auditObjectListing({
    bucket: "shared-books", prefix: "clients/foto-raabe",
    referencedKeys: new Set(["clients/foto-raabe/storage/known.pdf", "clients/foto-raabe/storage/missing.pdf"]),
    listPage: async (request) => {
      requests.push(request);
      return requests.length === 1
        ? { IsTruncated: true, NextContinuationToken: "page-2", Contents: [{ Key: "clients/foto-raabe/storage/known.pdf", Size: 10 }] , $metadata: {} }
        : { Contents: [{ Key: "clients/foto-raabe/storage/review.pdf", Size: 30, StorageClass: "STANDARD_IA" }], $metadata: {} };
    },
  });
  expect(requests).toEqual([
    { Bucket: "shared-books", Prefix: "clients/foto-raabe/", MaxKeys: 1000, ContinuationToken: undefined },
    { Bucket: "shared-books", Prefix: "clients/foto-raabe/", MaxKeys: 1000, ContinuationToken: "page-2" },
  ]);
  expect(report.total).toEqual({ objects: 2, bytes: 40 });
  expect(report.complete).toBe(true);
  expect(report.referenced).toEqual({ objects: 1, bytes: 10 });
  expect(report.unreferenced).toEqual({ objects: 1, bytes: 30 });
  expect(report.byStorageClass.STANDARD_IA).toEqual({ objects: 1, bytes: 30 });
  expect(report.largestUnreferenced[0]?.key).toBe("clients/foto-raabe/storage/review.pdf");
  expect(report.missingReferenceCount).toBe(1);
  expect(report.missingReferenceSample).toEqual(["clients/foto-raabe/storage/missing.pdf"]);
});

test("keeps only the largest 20 review-only objects and supports an explicitly empty namespace", async () => {
  const report = await auditObjectListing({
    bucket: "dedicated-books", prefix: "", referencedKeys: new Set(),
    listPage: async (request) => {
      expect(request.Prefix).toBeUndefined();
      return { $metadata: {}, Contents: Array.from({ length: 25 }, (_, i) => ({ Key: `storage/object-${i}`, Size: i })) };
    },
  });
  expect(report.total).toEqual({ objects: 25, bytes: 300 });
  expect(report.largestUnreferenced).toHaveLength(20);
  expect(report.largestUnreferenced[0]?.bytes).toBe(24);
  expect(report.largestUnreferenced[19]?.bytes).toBe(5);
});

test("rejects unsafe prefixes and unexpected cross-client listing results", async () => {
  let called = false;
  const listPage = async () => { called = true; return { $metadata: {} }; };
  for (const prefix of ["clients/../other", "/clients/one", "clients//one", "clients/one/"]) {
    await expect(auditObjectListing({ bucket: "shared", prefix, referencedKeys: new Set(), listPage })).rejects.toThrow("prefix");
  }
  expect(called).toBe(false);
  await expect(auditObjectListing({
    bucket: "shared", prefix: "clients/one", referencedKeys: new Set(["clients/two/storage/a.pdf"]), listPage,
  })).rejects.toThrow("references must belong");
  expect(called).toBe(false);
  await expect(auditObjectListing({
    bucket: "shared", prefix: "clients/one", referencedKeys: new Set(),
    listPage: async () => ({ $metadata: {}, Contents: [{ Key: "clients/one-extra/storage/a.pdf", Size: 1 }] }),
  })).rejects.toThrow("outside the requested namespace");
});

test("does not produce a completed report after an invalid size or failed page", async () => {
  for (const size of [undefined, -1, NaN, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    await expect(auditObjectListing({
      bucket: "shared", prefix: "clients/one", referencedKeys: new Set(),
      listPage: async () => ({ $metadata: {}, Contents: [{ Key: "clients/one/storage/a.pdf", Size: size }] }),
    })).rejects.toThrow("invalid object size");
  }
  let calls = 0;
  await expect(auditObjectListing({
    bucket: "shared", prefix: "clients/one", referencedKeys: new Set(),
    listPage: async () => {
      calls++;
      if (calls === 2) throw new Error("List permission denied");
      return { $metadata: {}, IsTruncated: true, NextContinuationToken: "next", Contents: [{ Key: "clients/one/storage/a.pdf", Size: 100 }] };
    },
  })).rejects.toThrow("List permission denied");
  expect(calls).toBe(2);
});

test("fails honestly on broken pagination rather than hanging or reporting incomplete totals", async () => {
  for (const token of [undefined, "repeated-token"]) {
    let calls = 0;
    await expect(auditObjectListing({
      bucket: "shared", prefix: "clients/one", referencedKeys: new Set(),
      listPage: async () => { calls++; return { $metadata: {}, IsTruncated: true, NextContinuationToken: token }; },
    })).rejects.toThrow("continuation token");
    expect(calls).toBe(token ? 2 : 1);
  }
});
