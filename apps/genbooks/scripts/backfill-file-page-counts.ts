/**
 * Backfill File.pageCount for PDF rows uploaded before the column existed.
 *
 * The column ships with `prisma db push` (or apply scripts/sql/add-file-pagecount.sql
 * manually). New uploads store their page count automatically; this script
 * repairs existing rows so price estimation never has to download a PDF.
 *
 * Usage (from apps/genbooks, needs DATABASE_URL in the environment):
 *   bun scripts/backfill-file-page-counts.ts           # dry run, prints plan
 *   bun scripts/backfill-file-page-counts.ts --apply   # writes page counts
 */
import { PrismaClient } from "@prisma/client";
import { PDFDocument } from "pdf-lib";

const CDN_BASE = "https://cdn.pirrot.de";
const CONCURRENCY = 4;

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

function toAbsoluteUrl(src: string): string {
  return /^https?:\/\//i.test(src) ? src : `${CDN_BASE}${src}`;
}

async function countPages(url: string): Promise<number> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed with status ${response.status}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const doc = await PDFDocument.load(bytes, { updateMetadata: false });
  return doc.getPageCount();
}

async function main() {
  const files = await prisma.file.findMany({
    where: { type: "PDF", pageCount: null },
    select: { id: true, name: true, src: true },
  });

  console.log(
    `${files.length} PDF file rows without pageCount${apply ? "" : " (dry run, pass --apply to write)"}`,
  );

  let done = 0;
  let failed = 0;
  const queue = [...files];

  async function worker() {
    for (;;) {
      const file = queue.shift();
      if (!file) return;
      const url = toAbsoluteUrl(file.src);
      try {
        const pageCount = await countPages(url);
        if (apply) {
          await prisma.file.update({
            where: { id: file.id },
            data: { pageCount },
          });
        }
        done += 1;
        console.log(
          `${apply ? "updated" : "would update"} ${file.id} (${file.name ?? file.src}): ${pageCount} pages`,
        );
      } catch (error) {
        failed += 1;
        console.warn(
          `skipped ${file.id} (${url}): ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  console.log(`finished: ${done} ok, ${failed} skipped`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
