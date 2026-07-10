import BookConfig from "../_components/book-config";
import { api, HydrateClient } from "@/trpc/server";
import { auth } from "@/server/auth";

export default async function ConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ bookId: string; pt?: string; st?: string }>;
}) {
  const { bookId, pt, st } = await searchParams;
  const session = await auth();
  const isLoggedIn = !!session?.user;

  if (bookId) {
    void api.config.init.prefetch({ bookId });
  }

  return (
    <HydrateClient>
      <main className="from-pirrot-blue-50 to-pirrot-blue-100/20 text-info-900 relative min-h-screen w-full overflow-hidden bg-gradient-to-b">
        <div className="subtle-grid pointer-events-none absolute inset-0 opacity-30" />
        <BookConfig
          bookId={bookId}
          isLoggedIn={isLoggedIn}
          partnerToken={pt ?? st}
        />
      </main>
    </HydrateClient>
  );
}
