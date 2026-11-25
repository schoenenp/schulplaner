"use client";

import { useEffect, useRef, useState } from "react";

type PreviewState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; url: string; pages: string | null }
  | { kind: "error"; message: string };

export function PreviewPanel({ url, fullUrl }: { url: string; fullUrl?: string }) {
  const [state, setState] = useState<PreviewState>({ kind: "idle" });
  const request = useRef(0);

  useEffect(() => {
    if (state.kind !== "ready") return;
    const url = state.url;
    return () => URL.revokeObjectURL(url);
  }, [state]);
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );

  async function load() {
    const current = ++request.current;
    setState({ kind: "loading" });
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? "Die Vorschau konnte nicht erstellt werden.");
      }
      const blob = await response.blob();
      if (current !== request.current) return;
      setState({
        kind: "ready",
        url: URL.createObjectURL(blob),
        pages: response.headers.get("X-Print-Page-Count"),
      });
    } catch (error) {
      if (current !== request.current) return;
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-secondary" onClick={load} disabled={state.kind === "loading"}>
          {state.kind === "loading"
            ? "Vorschau wird erstellt …"
            : state.kind === "ready"
              ? "Vorschau aktualisieren"
              : "Vorschau erstellen"}
        </button>
        {state.kind === "ready" && (
          <a href={state.url} target="_blank" rel="noreferrer" className="text-sm text-brand underline">
            In neuem Tab öffnen
          </a>
        )}
        {fullUrl && (
          <a href={fullUrl} target="_blank" rel="noreferrer" className="text-sm text-brand underline">
            Kompletten Testdruck öffnen
          </a>
        )}
        {state.kind === "ready" && state.pages && (
          <span className="text-sm text-muted">Fertiger Planer: {state.pages} Seiten</span>
        )}
      </div>
      {state.kind === "loading" && (
        <p className="text-sm text-muted">Das dauert meist 5–20 Sekunden.</p>
      )}
      {state.kind === "error" && (
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
          {state.message}
        </p>
      )}
      {state.kind === "ready" && (
        <iframe title="Planer-Vorschau" src={state.url} className="h-[75vh] w-full rounded-lg border border-line bg-paper" />
      )}
    </div>
  );
}
