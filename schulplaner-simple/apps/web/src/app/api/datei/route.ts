import { readStorageAsset } from "books-storage";
import { storagePath } from "books-storage/references";
import { isStaffRole } from "@/server/access";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { getShopSettings } from "@/server/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Private file reads. Thumbnails of covers schools can see are public;
 * everything else (module PDFs, print files, other thumbnails) is staff-only.
 */
export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("src");
  if (!path || storagePath(path) !== path) {
    return new Response("Not found", { status: 404 });
  }
  const { templateBookId } = await getShopSettings();
  const offeredThumbnail = await db.module.findFirst({
    where: {
      thumbnailSrc: path,
      part: "COVER",
      deletedAt: null,
      OR: [
        { visible: "PUBLIC" },
        // The standard cover is shown to schools even when not offered separately.
        ...(templateBookId ? [{ books: { some: { bookId: templateBookId } } }] : []),
      ],
    },
    select: { id: true },
  });
  if (!offeredThumbnail) {
    const session = await auth();
    const ownThumbnail = session?.user.id ? await db.module.findFirst({
      where: { thumbnailSrc: path, createdById: session.user.id, part: "COVER" }, select: { id: true },
    }) : null;
    if (!ownThumbnail && !isStaffRole(session?.user.role)) {
      return new Response("Not found", { status: 404 });
    }
  }
  const response = await readStorageAsset(path, {
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) return new Response("Not found", { status: 404 });
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, max-age=300");
  return new Response(response.body, { status: 200, headers });
}
