import Navigation from "@/app/_components/navigation";
import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import TemplateShareEntry from "./template-share-entry";

export default async function TemplateSharePage({
  searchParams,
}: {
  searchParams: Promise<{ claim?: string; error?: string }>;
}) {
  const { claim, error } = await searchParams;
  const session = await auth();

  return (
    <HydrateClient>
      <main className="from-pirrot-blue-50 to-pirrot-blue-100 text-info-900 flex min-h-screen flex-col items-center gap-10 bg-gradient-to-b">
        <Navigation />
        <div className="flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-10">
          <TemplateShareEntry
            token={claim}
            errorCode={error}
            isLoggedIn={Boolean(session?.user)}
            sessionEmail={session?.user?.email}
          />
        </div>
      </main>
    </HydrateClient>
  );
}
