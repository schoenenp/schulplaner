import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import { LogOut, ArrowLeft } from "lucide-react";
import Link from "next/link";
import SignoutClient from "./signout-client";

export default async function SignOutPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const { callbackUrl } = await searchParams;

  if (!session) {
    redirect(callbackUrl ?? "/");
  }

  return (
    <div className="from-pirrot-blue-50 to-pirrot-blue-100/20 flex min-h-screen items-center justify-center bg-gradient-to-b p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <LogOut className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="mb-2 text-2xl font-bold text-gray-900">Abmelden</h1>
          <p className="text-gray-600">
            Sind Sie sicher, dass Sie sich abmelden möchten?
          </p>
        </div>

        {session.user?.email && (
          <p className="mb-6 text-center text-sm text-gray-500">
            Angemeldet als:{" "}
            <span className="font-medium">{session.user.email}</span>
          </p>
        )}

        <SignoutClient callbackUrl={callbackUrl} />

        <Link
          href={callbackUrl ?? "/dashboard"}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gray-100 px-4 py-3 font-medium text-gray-700 transition-colors hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5" />
          Abbrechen
        </Link>
      </div>
    </div>
  );
}
