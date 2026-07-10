"use client";

import { signOut } from "next-auth/react";

export default function SignoutClient({
  callbackUrl,
}: {
  callbackUrl?: string;
}) {
  return (
    <button
      onClick={() => signOut({ callbackUrl: callbackUrl ?? "/" })}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-3 font-medium text-white transition-colors hover:bg-red-600"
    >
      Ja, abmelden
    </button>
  );
}
