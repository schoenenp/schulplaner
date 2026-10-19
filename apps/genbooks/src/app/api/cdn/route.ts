import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { readStorageAsset } from "books-storage";
import { storagePath } from "books-storage/references";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const path = new URL(request.url).searchParams.get("src");
  if (!path || storagePath(path) !== path) {
    return new Response("Not found", { status: 404 });
  }
  const session = await auth();

  const file = await db.file.findFirst({
    where: {
      OR: [
        { src: path },
        { srcGrayscale: path },
        { src: `https://cdn.pirrot.de${path}` },
        { srcGrayscale: `https://cdn.pirrot.de${path}` },
      ],
      modules: {
        some: {
          deletedAt: null,
          OR: [
            { visible: { in: ["PUBLIC", "SHARED"] } },
            { books: { some: { book: { isPublic: true, deletedAt: null } } } },
            ...(session?.user
              ? [
                  { createdById: session.user.id },
                  {
                    books: {
                      some: {
                        book: {
                          deletedAt: null,
                          OR: [
                            { createdById: session.user.id },
                            {
                              sourceType: "PARTNER_TEMPLATE" as const,
                              createdById: null,
                              partnerClaim: { userId: session.user.id },
                            },
                            {
                              partnerOrder: { partnerUserId: session.user.id },
                            },
                          ],
                        },
                      },
                    },
                  },
                ]
              : []),
          ],
        },
      },
    },
    select: { id: true },
  });
  if (!file && path !== "/storage/notizen.pdf")
    return new Response("Not found", { status: 404 });
  try {
    const headers = new Headers();
    for (const name of ["Range", "If-None-Match", "If-Modified-Since"]) {
      // S3 has no If-Range parameter. Serve the complete representation
      // rather than combine a changed object with a previously cached range.
      if (name === "Range" && request.headers.has("If-Range")) continue;
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    const response = await readStorageAsset(path, {
      headers,
      signal: AbortSignal.timeout(120_000),
    });
    const outgoing = new Headers({
      // Retain bytes in the browser, but authorize every reuse of them.
      "Cache-Control": "private, no-cache, must-revalidate",
      Vary: "Cookie",
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["ETag", "Last-Modified"]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    // A validator match is only returned after the access checks above.
    if (response.status === 304)
      return new Response(null, { status: 304, headers: outgoing });
    if (!response.ok)
      return new Response("File unavailable", {
        status: [404, 416].includes(response.status) ? response.status : 502,
      });
    for (const name of [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Accept-Ranges",
      "Content-Disposition",
    ]) {
      const value = response.headers.get(name);
      if (value) outgoing.set(name, value);
    }
    return new Response(response.body, {
      status: response.status,
      headers: outgoing,
    });
  } catch {
    return new Response("Storage unavailable", { status: 503 });
  }
}
