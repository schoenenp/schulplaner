import { fetchCdnAsset } from "pdf-pipeline";
import { uploadStorageFiles } from "books-storage";
/**
 * Backfill File.srcGrayscale for content-module PDFs uploaded before variants
 * existed. Downloads each PDF, converts it once through the grayscale API,
 * uploads the result to object storage, and stores the variant src. Generation then
 * fetches the stored variant instead of converting on every book.
 *
 * Only DEFAULT/PLANNER modules benefit (covers are re-filled per book), and
 * files above the API's 20 MiB limit are skipped.
 *
 * Usage (from apps/genbooks, needs DATABASE_URL, GHOST_GRAYSCALE_API_KEY,
 * S3_BUCKET, S3_ENDPOINT, AWS_REGION and S3 credentials in the environment):
 *   bun scripts/backfill-grayscale-variants.ts           # dry run
 *   bun scripts/backfill-grayscale-variants.ts --apply   # convert + write
 */
import { PrismaClient } from "db";

const GRAYSCALE_ENDPOINT =
  "https://api.ghost.miomideal.com/api/process/grayscale";
const GRAYSCALE_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

const ghostApiKey = process.env.GHOST_GRAYSCALE_API_KEY;


function toAbsoluteUrl(src: string): string {
  return /^https?:\/\//i.test(src) ? src : src;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetchCdnAsset(url);
  if (!response.ok) throw new Error(`download failed: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

async function convertToGrayscale(bytes: Uint8Array): Promise<Uint8Array> {
  const formData = new FormData();
  formData.append(
    "file",
    new Blob([bytes.slice().buffer], { type: "application/pdf" }),
    "document.pdf",
  );
  const response = await fetch(GRAYSCALE_ENDPOINT, {
    method: "POST",
    headers: { "X-API-Key": ghostApiKey! },
    body: formData,
  });
  if (!response.ok) {
    throw new Error(`grayscale conversion failed: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

async function uploadVariant(bytes: Uint8Array, name: string): Promise<string> {
  const [uploaded] = await uploadStorageFiles([{ data: bytes, name }]);
  if (!uploaded) throw new Error("Missing uploaded grayscale variant");
  return uploaded.src;
}

async function main() {
  if (apply && (!ghostApiKey || !process.env.S3_BUCKET || !process.env.S3_ENDPOINT || !process.env.AWS_REGION)) {
    throw new Error(
      "GHOST_GRAYSCALE_API_KEY, S3_BUCKET, S3_ENDPOINT, AWS_REGION and S3 credentials are required with --apply",
    );
  }

  const files = await prisma.file.findMany({
    where: {
      type: "PDF",
      srcGrayscale: null,
      modules: { some: { part: { in: ["DEFAULT", "PLANNER"] } } },
    },
    select: { id: true, name: true, src: true },
  });

  console.log(
    `${files.length} content-module PDFs without a grayscale variant${apply ? "" : " (dry run, pass --apply to convert)"}`,
  );

  let done = 0;
  let failed = 0;

  for (const file of files) {
    const url = toAbsoluteUrl(file.src);
    try {
      if (!apply) {
        console.log(`would convert ${file.id} (${file.name ?? file.src})`);
        done += 1;
        continue;
      }

      const original = await download(url);
      if (original.byteLength > GRAYSCALE_UPLOAD_LIMIT_BYTES) {
        console.warn(`skipped ${file.id}: above 20 MiB API limit`);
        failed += 1;
        continue;
      }

      const grayscale = await convertToGrayscale(original);
      const variantSrc = await uploadVariant(
        grayscale,
        `gray_${file.name ?? file.id}.pdf`,
      );
      await prisma.file.update({
        where: { id: file.id },
        data: { srcGrayscale: variantSrc },
      });
      done += 1;
      console.log(`converted ${file.id} -> ${variantSrc}`);
    } catch (error) {
      failed += 1;
      console.warn(
        `skipped ${file.id} (${url}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  console.log(`finished: ${done} ok, ${failed} skipped`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
