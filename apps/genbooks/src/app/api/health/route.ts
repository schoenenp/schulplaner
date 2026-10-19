export const dynamic = "force-dynamic";

// Liveness only: maintenance must not invoke auth or touch the database.
export function GET() {
  return Response.json({ status: "ok", maintenance: process.env.DATABASE_MAINTENANCE_MODE === "true" }, {
    headers: { "Cache-Control": "no-store" },
  });
}
