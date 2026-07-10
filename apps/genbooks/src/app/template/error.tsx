"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function TemplateError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("template_route_error", error);
  }, [error]);

  return (
    <main className="from-pirrot-blue-50 to-pirrot-blue-100 text-info-900 flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-b px-4">
      <section className="w-full max-w-2xl rounded border border-red-200 bg-red-50 p-6">
        <h1 className="text-2xl font-black uppercase">
          Partner-Link konnte nicht geladen werden
        </h1>
        <p className="mt-3 text-sm">
          Beim Öffnen des Partner-Links ist ein Fehler aufgetreten. Bitte
          versuchen Sie es erneut.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="btn-solid px-4 py-2"
          >
            Erneut versuchen
          </button>
          <Link href="/template" className="btn-soft px-4 py-2">
            Zur Partner-Seite
          </Link>
        </div>
      </section>
    </main>
  );
}
