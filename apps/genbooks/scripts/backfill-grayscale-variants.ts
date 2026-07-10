/**
 * Backfill File.srcGrayscale for content-module PDFs uploaded before variants
 * existed. Downloads each PDF, converts it once through the grayscale API,
 * uploads the result to the CDN, and stores the variant src. Generation then
 * fetches the stored variant instead of converting on every book.
 *
 * Only DEFAULT/PLANNER modules benefit (covers are re-filled per book), and
 * files above the API's 20 MiB limit are skipped.
 *
 * Usage (from apps/genbooks, needs DATABASE_URL, GHOST_GRAYSCALE_API_KEY,
 * UPLOAD_URL_LINK and UPLOAD_API_KEY in the environment):
 *   bun scripts/backfill-grayscale-variants.ts           # dry run
 *   bun scripts/backfill-grayscale-variants.ts --apply   # convert + write
 */
import { PrismaClient } from "@prisma/client";

const CDN_BASE = "https://cdn.pirrot.de";
const GRAYSCALE_ENDPOINT =
  "https://api.ghost.miomideal.com/api/process/grayscale";
const GRAYSCALE_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;

const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

const ghostApiKey = process.env.GHOST_GRAYSCALE_API_KEY;
const uploadUrl = process.env.UPLOAD_URL_LINK;
const uploadApiKey = process.env.UPLOAD_API_KEY;

function toAbsoluteUrl(src: string): string {
  return /^https?:\/\//i.test(src) ? src : `${CDN_BASE}${src}`;
}

async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
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

async function uploadVariant(
  bytes: Uint8Array,
  name: string,
): Promise<string> {
  const formData = new FormData();
  formData.append(
    "file",
    new File([bytes.slice().buffer], name, { type: "application/pdf" }),
    name,
  );
  const response = await fetch(`${uploadUrl}single`, {
    method: "post",
    headers: { "X-API-Key": uploadApiKey! },
    body: formData,
  });
  if (!response.ok) throw new Error(`upload failed: ${response.status}`);
  const payload = (await response.json()) as {
    files: { url: string } | Array<{ url: string }>;
  };
  const uploaded = Array.isArray(payload.files)
    ? payload.files[0]
    : payload.files;
  if (!uploaded?.url) throw new Error("upload response missing url");
  return uploaded.url;
}

async function main() {
  if (apply && (!ghostApiKey || !uploadUrl || !uploadApiKey)) {
    throw new Error(
      "GHOST_GRAYSCALE_API_KEY, UPLOAD_URL_LINK and UPLOAD_API_KEY are required with --apply",
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
