import { notFound, redirect } from "next/navigation";
import BookConfig from "../_components/book-config";
import Navigation from "../_components/navigation";
import { api, HydrateClient } from "@/trpc/server";
import { auth } from "@/server/auth";
import { db } from "@/server/db";
import { SCHOOL_ORDER_CLIENT } from "@/util/school-planner-input";

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ bookId?: string }>;
}) {
  const { bookId } = await searchParams;
  if (bookId === undefined) redirect("/#planer-erstellen");
  if (typeof bookId !== "string" || !bookId) notFound();
  const [session, book] = await Promise.all([
    auth(),
    db.book.findFirst({
      where: { id: bookId, deletedAt: null },
      select: { clientRef: true, sourceType: true },
    }),
  ]);
  if (
    !book ||
    book.clientRef === SCHOOL_ORDER_CLIENT ||
    book.sourceType === "PARTNER_TEMPLATE"
  )
    notFound();
  void api.config.init.prefetch({ bookId });
  return (
    <HydrateClient>
      <main className="text-info-900 relative flex h-dvh w-full flex-col overflow-hidden bg-gradient-to-b from-pirrot-blue-50 to-pirrot-blue-100/20">
        <Navigation compact />
        <BookConfig key={bookId} bookId={bookId} isLoggedIn={!!session?.user} />
      </main>
    </HydrateClient>
  );
}
