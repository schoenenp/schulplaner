import { auth } from "@/server/auth";
import { getSchoolPlanner } from "@/server/school-planner";
import {
  getSchoolPlannerPageLimit,
  renderSchoolPlannerPreview,
  schoolPlannerRevision,
} from "@/server/school-planner-pdf";
import { makeRateLimitKey, takeRateLimitToken } from "@/util/rate-limit";
import { logger } from "@/util/logger";

export async function POST(request: Request) {
  const user = (await auth())?.user;
  if (!user)
    return new Response("Bitte melden Sie sich erneut an.", { status: 401 });
  if (request.headers.get("X-Pirrot-Planner") !== "1") {
    return new Response("Ungültige Anfrage.", { status: 400 });
  }
  const limit = takeRateLimitToken(
    makeRateLimitKey(
      { headers: request.headers, session: { user } },
      "school-preview",
    ),
    10,
    5 * 60_000,
  );
  if (!limit.allowed) {
    return new Response(
      "Bitte warten Sie kurz, bevor Sie eine weitere Vorschau erstellen.",
      { status: 429 },
    );
  }
  const bookId = new URL(request.url).searchParams.get("bookId");
  const book = bookId ? await getSchoolPlanner(user.id, bookId) : null;
  if (!book)
    return new Response("Der Planer ist nicht verfügbar.", { status: 404 });

  try {
    const maxPages = getSchoolPlannerPageLimit(book);
    const { pdf, pageCount } = await renderSchoolPlannerPreview(book);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="pirrot-planer-vorschau.pdf"',
        "Cache-Control": "private, no-store",
        "X-Planner-Preview": schoolPlannerRevision(book),
        "X-Planner-Pages": String(pageCount),
        ...(maxPages !== null
          ? { "X-Planner-Page-Limit": String(maxPages) }
          : {}),
      },
    });
  } catch (error) {
    logger.error("school_planner_preview_failed", { bookId: book.id, error });
    return new Response(
      "Die Vorschau konnte nicht erstellt werden. Bitte versuchen Sie es erneut.",
      { status: 500 },
    );
  }
}
