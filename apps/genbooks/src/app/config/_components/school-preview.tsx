"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";

export function SchoolPreview({
  bookId,
  format,
}: {
  bookId: string;
  format: string;
}) {
  const [preview, setPreview] = useState<{
    url: string;
    token: string;
    pages: number;
    maxPages: number | null;
  }>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview.url);
    };
  }, [preview]);

  async function generate() {
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch(
        `/config/schule/vorschau?bookId=${encodeURIComponent(bookId)}`,
        { method: "POST", headers: { "X-Pirrot-Planner": "1" } },
      );
      if (!response.ok) throw new Error(await response.text());
      const token = response.headers.get("X-Planner-Preview");
      if (!token)
        throw new Error("Die Vorschau konnte nicht bestätigt werden.");
      const pageLimit = response.headers.get("X-Planner-Page-Limit");
      setPreview({
        token,
        url: URL.createObjectURL(await response.blob()),
        pages: Number(response.headers.get("X-Planner-Pages")),
        maxPages: pageLimit ? Number(pageLimit) : null,
      });
    } catch (problem) {
      setPreview(undefined);
      setError(
        problem instanceof Error
          ? problem.message
          : "Die Vorschau konnte nicht erstellt werden.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <p role="alert" className="font-semibold text-pirrot-red-600">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => void generate()}
          disabled={pending}
          className="btn-soft px-4 py-2.5 disabled:opacity-60"
        >
          <FileText size={18} />{" "}
          {pending
            ? "Vorschau wird erstellt …"
            : preview
              ? "Vorschau aktualisieren"
              : "Vorschau erstellen"}
        </button>
        {preview && (
          <a
            className="btn-soft px-4 py-2.5"
            href={preview.url}
            target="_blank"
            rel="noreferrer"
          >
            PDF öffnen
          </a>
        )}
      </div>
      {preview && (
        <>
          <iframe
            className="h-[65vh] w-full rounded-xl border border-pirrot-blue-200"
            title="Vorschau Ihres Schulplaners"
            src={preview.url}
          />
          <p className="text-sm font-semibold text-info-700">
            {preview.pages} Seiten · {format}
          </p>
          {preview.maxPages !== null && preview.pages > preview.maxPages && (
            <p
              role="status"
              className="rounded-xl bg-amber-50 p-3 text-amber-950"
            >
              Für die gewählte Bindung sind bis zu {preview.maxPages} Seiten
              möglich. Passen Sie die Bindung oder den Inhalt im Konfigurator
              an.
            </p>
          )}
          {!pending &&
            (preview.maxPages === null ||
              preview.pages <= preview.maxPages) && (
              <Link
                className="btn-solid inline-flex w-fit gap-2 px-5 py-2.5"
                href={`/config/bestellen?bookId=${encodeURIComponent(bookId)}&preview=${encodeURIComponent(preview.token)}`}
              >
                Weiter zur Bestellung <ArrowRight size={18} />
              </Link>
            )}
        </>
      )}
    </div>
  );
}
