import { auth } from "@/server/auth";
import { logger } from "@/lib/logger";
import { withGenerationLock } from "@/server/generation-lock";
import { HOLIDAY_FAILURE_MESSAGE, isHolidayFailure } from "@/server/holidays";
import { pdfResponse, renderPreview } from "@/server/pdf";
import { PlannerUnavailableError, findOwnPlanner, syncPlannerContent } from "@/server/planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user) return jsonError("Bitte melden Sie sich an.", 401);
  const planner = await findOwnPlanner(session.user.id, id);
  if (!planner) return jsonError("Planer nicht gefunden.", 404);

  try {
    const result = await withGenerationLock(`preview:${session.user.id}`, async () => {
      const book = await syncPlannerContent(planner);
      return renderPreview(book);
    });
    if (result.busy) return jsonError("Es wird bereits eine Vorschau erstellt. Bitte einen Moment warten.", 429);
    const response = pdfResponse(result.value.pdf, "planer-vorschau.pdf");
    if (result.value.fullPageCount) {
      response.headers.set("X-Print-Page-Count", String(result.value.fullPageCount));
    }
    return response;
  } catch (error) {
    logger.error("planner_preview_failed", { bookId: id, error });
    const message =
      error instanceof PlannerUnavailableError
        ? error.message
        : isHolidayFailure(error)
          ? HOLIDAY_FAILURE_MESSAGE
          : "Die Vorschau konnte nicht erstellt werden. Bitte versuchen Sie es erneut.";
    return jsonError(message, 500);
  }
}
