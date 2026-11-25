import { readStorageAsset } from "books-storage";
import { isStaffRole } from "@/server/access";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { orderNumber } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!isStaffRole(session?.user.role)) return new Response("Not found", { status: 404 });
  const { id } = await params;
  const order = await db.order.findUnique({
    where: { id: Number(id) || 0 },
    select: { id: true, printFileSrc: true, schoolName: true },
  });
  if (!order?.printFileSrc) return new Response("Not found", { status: 404 });
  const file = await readStorageAsset(order.printFileSrc, { signal: AbortSignal.timeout(120_000) });
  if (!file.ok) return new Response("Not found", { status: 404 });
  const name = `${orderNumber(order.id)}-${order.schoolName}`.replace(/[^\w.-]+/g, "_");
  return new Response(file.body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}.pdf"`,
      "Cache-Control": "private, no-store",
      ...(file.headers.get("Content-Length") ? { "Content-Length": file.headers.get("Content-Length")! } : {}),
    },
  });
}
