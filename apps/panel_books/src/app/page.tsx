import Link from "next/link";

import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";

export default async function Home() {
  const session = await auth();

  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-pirrot-blue-800 to-pirrot-blue-950 text-pirrot-blue-50">
        <div className="container flex flex-col items-center justify-center gap-12 px-4 py-16">
          <h1 className="font-mono text-5xl tracking-tight sm:text-[5rem]">
            bpanel login
          </h1>

          <div className="flex flex-col w-full max-w-lg items-center justify-center gap-4 md:flex-row">
            {session?.user && (
              <Link
                href={"/dashboard"}
                className="flex-1 rounded-full text-center bg-pirrot-blue-50/10 px-10 py-3 font-semibold no-underline transition hover:bg-pirrot-blue-50/20"
              >
                Dashboard
              </Link>
            )}

            <Link
              href={session?.user ? "/api/auth/signout" : "/api/auth/signin"}
              className="flex-1 rounded-full text-center bg-pirrot-blue-50/10 px-10 py-3 font-semibold no-underline transition hover:bg-pirrot-blue-50/20"
            >
              {session?.user ? "Sign out" : "Sign in"}
            </Link>
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}
