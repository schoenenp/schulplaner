import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  FileType2,
  FileStack,
  Layers3,
  PenTool,
  ScanSearch,
  Sparkles,
  SquarePen,
} from "lucide-react";

import Footer from "@/app/_components/footer";
import Navigation from "@/app/_components/navigation";
import ModuleDocsStepShowcase from "@/app/module-docs/step-showcase";
import { db } from "@/server/db";

export const metadata: Metadata = {
  title: "Modul-Dokumentation",
  description:
    "Anleitung zum Erstellen von PDF-Modulen mit Formularfeldern für den Planer Generator.",
};

export const dynamic = "force-dynamic";

const coreRules = [
  {
    icon: FileType2,
    title: "Nur PDF-Textfelder werden verarbeitet",
    text: "Unsere Verarbeitung liest PDF-Formulare aus und schreibt Werte in Textfelder. Reine Textelemente, Kommentare oder frei platzierte Objekte werden nicht automatisch befüllt.",
  },
  {
    icon: SquarePen,
    title: "Feldnamen müssen sauber benannt sein",
    text: "Die Feldnamen im PDF müssen zu den erwarteten Tags passen. Bereits in der Modulerstellung werden vorhandene Formularfelder erkannt und gegen bekannte Tags abgeglichen.",
  },
  {
    icon: Layers3,
    title: "Das Seitenlayout muss zum Modultyp passen",
    text: "Ein Umschlag braucht genau 4 Seiten, ein Wochenplaner genau 2 Seiten. Statische Module können ohne Formularlogik auskommen, müssen aber als fertiges PDF hochgeladen werden.",
  },
] as const;

const pageRules = [
  "Umschlag: genau 4 Seiten",
  "Wochenplaner: genau 2 Seiten",
  "Planer allgemein: zwischen 2 und 92 Seiten",
  "Sonstige Module: mindestens 1 und höchstens 100 Seiten",
] as const;

const quickRules = [
  "Formularfelder exakt platzieren",
  "Feldnamen sauber benennen",
  "PDF möglichst unter 10 MB halten",
] as const;

const toolCards = [
  {
    title: "Adobe Acrobat Pro",
    text: "Empfohlen, wenn das Layout schon als PDF vorliegt und Formularfelder direkt darauf gesetzt werden sollen.",
  },
  {
    title: "LibreOffice Draw",
    text: "Empfohlene Alternative, wenn Sie Layout und Formularfelder in einem Werkzeug aufbauen möchten.",
  },
] as const;

const fieldExamples = [
  {
    module: "Umschlag",
    fields: ["BOOK_TITLE", "FROM_TO"],
    note: "Wird beim Generieren mit Titel und Zeitraum des Buchs befüllt.",
  },
  {
    module: "Wochenplaner",
    fields: [
      "xA",
      "xB",
      "xC",
      "xD",
      "xE",
      "WEEK_FROMTO",
      "WEEK_NUM",
      "xA_Date",
      "xB_Date",
      "xC_Date",
      "xD_Date",
      "xE_Date",
    ],
    note: "Die Datumsfelder werden pro Woche wiederholt befüllt. `WEEK_FROMTO` liefert den Wochenbereich, `WEEK_NUM` die ISO-Kalenderwoche. Feiertage und Sondertage laufen über die *_Date-Felder.",
  },
] as const;

const moduleSamples = [
  {
    title: "Umschlag",
    badge: "4 Seiten",
    accent: "bg-pirrot-blue-100 text-pirrot-blue-800",
    templateFields: ["BOOK_TITLE", "FROM_TO"],
    processedValues: ["Mein Schulplaner", "2026/2027"],
    note: "Titel und Zeitraum werden automatisch eingesetzt.",
  },
  {
    title: "Wochenplaner",
    badge: "2 Seiten",
    accent: "bg-pirrot-green-100 text-pirrot-green-800",
    templateFields: ["xA", "xB", "WEEK_FROMTO", "WEEK_NUM", "xA_Date"],
    processedValues: ["08.09", "09.09", "08. September bis 12. September 2026", "37", "Schulfest"],
    note: "Die Felder werden für jede Woche neu befüllt.",
  },
] as const;

const compactSteps = [
  {
    title: "Layout als PDF vorbereiten",
    text: "Die gestaltete Vorlage wird als PDF geöffnet, damit die Formulararbeit direkt auf dem finalen Seitenlayout passiert.",
    image: "/assets/screenshots/acrobat_forms_1.png",
    alt: "Adobe Acrobat mit geoeffneter PDF-Vorlage als Ausgangspunkt",
  },
  {
    title: "Textfelder an die Zielstellen setzen",
    text: "Platzieren Sie die Felder genau dort, wo spaeter Titel, Daten oder andere Generatorwerte erscheinen sollen.",
    image: "/assets/screenshots/acrobat_forms_2.png",
    alt: "Adobe Acrobat beim Platzieren von Textfeldern auf der PDF-Seite",
  },
  {
    title: "Felder korrekt benennen",
    text: "Jedes Feld braucht einen eindeutigen und passenden Namen, damit es im Upload den erwarteten Tags zugeordnet werden kann.",
    image: "/assets/screenshots/acrobat_forms_3.png",
    alt: "Feldeigenschaften in Adobe Acrobat mit Fokus auf den Feldnamen",
  },
  {
    title: "Als PDF exportieren und hochladen",
    text: "Speichern Sie die Vorlage mit erhaltenen Formularfeldern und laden Sie genau diese finale PDF in die App hoch.",
    image: "/assets/screenshots/acrobat_forms_4.png",
    alt: "Gespeicherte PDF-Vorlage vor dem Upload in die Anwendung",
  },
  {
    title: "Vorschau und erkannte Tags prüfen",
    text: "Kontrollieren Sie nach dem Upload die Vorschau und die erkannte Tag-Liste, bevor das Modul produktiv genutzt wird.",
    image: "/assets/screenshots/acrobat_form_5.png",
    alt: "Modulansicht mit Vorschau und erkannten Tags nach dem Upload",
  },
] as const;

const acrobatSteps = [
  "Ausgangslayout in InDesign, Illustrator oder einem anderen Satzprogramm gestalten und als PDF exportieren.",
  "PDF in Adobe Acrobat Pro öffnen und im Werkzeugbereich Formular vorbereiten wählen.",
  "Automatisch erkannte Felder prüfen, unnötige Felder löschen und fehlende Textfelder manuell ergänzen.",
  "Jedes Feld eindeutig benennen, exakt an die vorgesehene Position ziehen und auf transparente Darstellung achten.",
  "Bei Bedarf Schrift, Ausrichtung, Schriftgröße und Zeilenumbruch in den Feldeigenschaften definieren.",
  "PDF speichern, in der App hochladen und die erkannte Tag-Liste kontrollieren.",
] as const;

const drawSteps = [
  "Layout in LibreOffice Draw auf der finalen Seitengröße aufbauen oder ein bestehendes PDF in Draw öffnen.",
  "Formular-Steuerelemente einblenden und Textfelder auf den benötigten Positionen platzieren.",
  "Jedem Feld über Eigenschaften einen klaren Namen geben; dieser Name ist für die Verarbeitung entscheidend.",
  "Auf ausreichende Innenabstände, lesbare Schriftgrößen und eine saubere Ausrichtung auf jeder Einzelseite achten.",
  "Als PDF exportieren und dabei Formularfelder erhalten, damit die Textfelder im finalen PDF weiter vorhanden sind.",
  "Das exportierte PDF zur Kontrolle in Acrobat Reader oder im Browser öffnen und prüfen, ob die Felder anklickbar sind.",
] as const;

const checklist = [
  "Nur benötigte Formularfelder anlegen",
  "Keine Platzhaltertexte im finalen Feld stehen lassen, wenn sie später automatisch ersetzt werden sollen",
  "Feldnamen ohne Tippfehler vergeben",
  "Keine Doppelseiten verwenden, Module nur als Einzelseiten anlegen",
  "Modulformat 216 x 303 mm verwenden, also DIN A4 plus 3 mm Anschnitt je Seite",
  "Vor dem Upload testen, ob das PDF wirklich interaktive Formularfelder enthält",
  "PDF-Dateien möglichst unter 10 MB halten, damit der Upload stabil bleibt",
  "Im Dashboard nach dem Upload die erkannten Tags und die PDF-Vorschau prüfen",
] as const;

function MiniTemplatePreview({
  title,
  entries,
}: {
  title: string;
  entries: readonly string[];
}) {
  return (
    <div className="field-shell flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-pirrot-blue-700">
          Vorlage
        </p>
        <span className="rounded-full bg-pirrot-blue-100 px-2 py-1 text-[11px] font-bold text-pirrot-blue-800">
          Formularfelder
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-pirrot-blue-200 bg-white p-4 shadow-sm">
        <div className="absolute right-3 top-3 rounded-full bg-pirrot-red-100 px-2 py-1 text-[10px] font-black text-pirrot-red-600">
          PDF
        </div>
        <div className="mb-4 text-sm font-black uppercase text-info-950">
          {title}
        </div>
        <div className="grid gap-2">
          {entries.map((entry) => (
            <div
              key={entry}
              className="rounded-lg border border-dashed border-pirrot-blue-300 bg-pirrot-blue-50 px-3 py-2 font-mono text-xs text-pirrot-blue-900"
            >
              {entry}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MiniProcessedPreview({
  title,
  entries,
}: {
  title: string;
  entries: readonly string[];
}) {
  return (
    <div className="field-shell flex h-full flex-col gap-3 p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-black uppercase tracking-[0.08em] text-pirrot-green-700">
          Verarbeitung
        </p>
        <span className="rounded-full bg-pirrot-green-100 px-2 py-1 text-[11px] font-bold text-pirrot-green-800">
          Generator
        </span>
      </div>
      <div className="relative overflow-hidden rounded-2xl border border-pirrot-green-200 bg-white p-4 shadow-sm">
        <div className="absolute right-3 top-3 rounded-full bg-pirrot-green-100 px-2 py-1 text-[10px] font-black text-pirrot-green-700">
          Preview
        </div>
        <div className="mb-4 text-sm font-black uppercase text-info-950">
          {title}
        </div>
        <div className="grid gap-2">
          {entries.map((entry) => (
            <div
              key={entry}
              className="rounded-lg border border-pirrot-green-200 bg-pirrot-green-50 px-3 py-2 text-sm font-semibold text-info-900"
            >
              {entry}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default async function ModuleDocsPage() {
  const tooltips = await db.tooltip.findMany({
    where: {
      deletedAt: null,
    },
    orderBy: {
      title: "asc",
    },
  });

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden text-info-900">
      <div className="subtle-grid pointer-events-none absolute inset-0 opacity-30" />
      <Navigation />

      <section className="section-shell relative z-10 mt-8 pb-4">
        <div className="content-card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.35fr_0.95fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-blue-700">
              Modul-Dokumentation
            </p>
            <h1 className="text-4xl font-black uppercase text-info-950 sm:text-5xl">
              PDF-Module mit Formularfeldern richtig aufbauen
            </h1>
            <p className="max-w-2xl text-base text-info-700 sm:text-lg">
              Diese Seite beschreibt, wie Modulvorlagen für den Generator
              vorbereitet werden. Entscheidend ist, dass Formularfelder im PDF
              exakt positioniert und korrekt benannt sind, damit unser
              PDF-Processing sie später sauber befüllen kann.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/dashboard/module/manage"
                className="btn-solid inline-flex items-center gap-2 px-4 py-2.5"
              >
                Modul anlegen
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/dashboard?view=module"
                className="btn-soft px-4 py-2.5"
              >
                Zu meinen Modulen
              </Link>
            </div>
          </div>

          <div className="content-card flex flex-col gap-4 bg-white/50 p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-pirrot-blue-100 p-3 text-pirrot-blue-700">
                <ScanSearch size={24} />
              </div>
              <div>
                <h2 className="text-xl font-black uppercase text-info-950">
                  Kurzfassung
                </h2>
                <p className="text-sm text-info-700">
                  Vorlage gestalten, Textfelder anlegen, Felder sauber benennen,
                  PDF exportieren, Upload prüfen.
                </p>
              </div>
            </div>
            <ul className="grid gap-2 text-sm text-info-800">
              {pageRules.map((rule) => (
                <li key={rule} className="field-shell flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 size={16} className="text-pirrot-green-600" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="grid gap-4 md:grid-cols-3">
          {coreRules.map((item) => {
            const Icon = item.icon;
            return (
              <article key={item.title} className="content-card flex flex-col gap-3 p-5">
                <div className="w-fit rounded-2xl bg-pirrot-blue-100 p-3 text-pirrot-blue-700">
                  <Icon size={22} />
                </div>
                <h2 className="text-xl font-black uppercase text-info-950">
                  {item.title}
                </h2>
                <p className="text-sm text-info-700">{item.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
          <article className="content-card p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-pirrot-blue-100 p-3 text-pirrot-blue-700">
                <Sparkles size={22} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-blue-700">
                  Schnellstart
                </p>
                <h2 className="text-3xl font-black uppercase text-info-950">
                  Drei Merksätze
                </h2>
              </div>
            </div>
            <ul className="grid gap-2">
              {quickRules.map((rule) => (
                <li
                  key={rule}
                  className="field-shell flex items-center gap-2 px-3 py-2 text-sm text-info-800"
                >
                  <CheckCircle2 size={16} className="text-pirrot-green-600" />
                  {rule}
                </li>
              ))}
            </ul>
          </article>

          <div className="grid gap-4 md:grid-cols-2">
            {toolCards.map((card) => (
              <article key={card.title} className="content-card p-5">
                <p className="mb-2 text-xs font-black uppercase tracking-[0.08em] text-pirrot-blue-700">
                  Empfohlenes Werkzeug
                </p>
                <h2 className="text-2xl font-black uppercase text-info-950">
                  {card.title}
                </h2>
                <p className="mt-2 text-sm text-info-700">{card.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-blue-700">
              Referenzboxen
            </p>
            <h2 className="text-3xl font-black uppercase text-info-950">
              Vorlage links, Ergebnis rechts
            </h2>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-white/70 px-3 py-2 text-sm font-semibold text-info-800 md:flex">
            <Eye size={16} />
            So sollte die Verarbeitung gedacht sein
          </div>
        </div>

        <div className="grid gap-6">
          {moduleSamples.map((sample) => (
            <article key={sample.title} className="content-card p-5 sm:p-6">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <h3 className="text-2xl font-black uppercase text-info-950">
                  {sample.title}
                </h3>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-black uppercase ${sample.accent}`}
                >
                  {sample.badge}
                </span>
                <p className="text-sm text-info-700">{sample.note}</p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr] lg:items-stretch">
                <MiniTemplatePreview
                  title={sample.title}
                  entries={sample.templateFields}
                />
                <div className="flex items-center justify-center text-pirrot-blue-700">
                  <div className="rounded-full bg-pirrot-blue-100 p-3">
                    <ArrowRight size={20} />
                  </div>
                </div>
                <MiniProcessedPreview
                  title={sample.title}
                  entries={sample.processedValues}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="content-card p-6 sm:p-8">
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-red-500">
              Tag-Regeln
            </p>
            <h2 className="text-3xl font-black uppercase text-info-950">
              Welche Feldnamen heute verarbeitet werden
            </h2>
            <p className="max-w-3xl text-info-700">
              Aktuell gibt es in der PDF-Verarbeitung spezielle Handler für
              Umschlag und Wochenplaner. Alle anderen Module können als
              statische PDFs verwendet werden, solange kein dynamischer Inhalt
              benötigt wird.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {fieldExamples.map((example) => (
              <article key={example.module} className="field-shell flex flex-col gap-3 p-4">
                <h3 className="text-xl font-black uppercase text-info-950">
                  {example.module}
                </h3>
                <div className="flex flex-wrap gap-2">
                  {example.fields.map((field) => (
                    <span
                      key={field}
                      className="rounded-full bg-pirrot-blue-100 px-3 py-1 text-sm font-bold text-pirrot-blue-800"
                    >
                      {field}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-info-700">{example.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="tooltips" className="section-shell relative z-10 scroll-mt-24 py-4">
        <div className="content-card p-6 sm:p-8">
          <div className="mb-6 flex flex-col gap-2">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-blue-700">
              Tooltip-Referenz
            </p>
            <h2 className="text-3xl font-black uppercase text-info-950">
              Alle Tooltips
            </h2>
            <p className="max-w-3xl text-info-700">
              Diese Liste zeigt die aktuell hinterlegten Tooltips auf einen Blick. Bei weiteren Unklarheiten oder Rückfragen, zögern Sie nicht unseren <Link className="text-pirrot-red-400 hover:underline" href="mailto:info-planer@pirrot.de">Support</Link> zu kontaktieren.
            </p>
          </div>

          {tooltips.length > 0 ? (
            <div className="grid gap-4 lg:grid-cols-2">
              {tooltips.map((tooltip) => (
                <article key={tooltip.id} className="field-shell flex flex-col gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-pirrot-blue-100 px-3 py-1 text-xs font-black uppercase text-pirrot-blue-800">
                      {tooltip.title}
                    </span>
                  </div>
                  <p className="text-sm text-info-800 whitespace-pre-line">
                    {tooltip.tip}
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <div className="field-shell px-4 py-3 text-sm text-info-700">
              Aktuell sind keine Tooltips vorhanden.
            </div>
          )}
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="content-card flex flex-col gap-6 p-6 sm:p-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-red-500">
              Ablauf
            </p>
            <h2 className="text-3xl font-black uppercase text-info-950">
              In 5 Schritten
            </h2>
            <p className="text-info-700">
              Der Kurzablauf für das Grundverständnis, bevor die Details weiter
              unten ins Spiel kommen.
            </p>
          </div>
          <ModuleDocsStepShowcase steps={compactSteps} />
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <article className="content-card p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-pirrot-red-100 p-3 text-pirrot-red-600">
                <PenTool size={22} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-red-500">
                  Workflow
                </p>
                <h2 className="text-3xl font-black uppercase text-info-950">
                  Adobe Acrobat Pro
                </h2>
              </div>
            </div>
            <ol className="grid gap-3">
              {acrobatSteps.map((step, index) => (
                <li key={step} className="field-shell flex gap-3 px-4 py-3 text-sm text-info-800">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pirrot-red-100 font-black text-pirrot-red-600">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </article>

          <article className="content-card p-6 sm:p-8">
            <div className="mb-5 flex items-center gap-3">
              <div className="rounded-2xl bg-pirrot-green-100 p-3 text-pirrot-green-700">
                <SquarePen size={22} />
              </div>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-green-700">
                  Alternative
                </p>
                <h2 className="text-3xl font-black uppercase text-info-950">
                  LibreOffice Draw
                </h2>
              </div>
            </div>
            <ol className="grid gap-3">
              {drawSteps.map((step, index) => (
                <li key={step} className="field-shell flex gap-3 px-4 py-3 text-sm text-info-800">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pirrot-green-100 font-black text-pirrot-green-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="content-card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-blue-700">
              Praktische Hinweise
            </p>
            <h2 className="text-3xl font-black uppercase text-info-950">
              Was im PDF sauber sitzen muss
            </h2>
            <p className="text-info-700">
              Die Formularfelder sollten dort liegen, wo später wirklich Text
              erscheinen soll. Arbeiten Sie mit finalen Satzspiegeln, echten
              Seitenmaßen und möglichst wenig nachträglicher Skalierung. Die
              ideale Modulgröße ist DIN A4 plus 3 mm Anschnitt auf jeder Seite,
              also 216 x 303 mm, auch wenn das Endformat des Buchs später A5
              ist. Module dürfen dabei nicht als Doppelseiten angelegt werden.
              Erlaubt sind nur Einzelseiten, damit Positionen, Seitenlogik und
              Verarbeitung im Generator stabil bleiben.
            </p>
            <p className="text-info-700">
              Wenn ein Modul keine dynamischen Daten braucht, kann es auch als
              normales PDF ohne Formularfelder angelegt werden. Formularfelder
              sind nur dort notwendig, wo Titel, Datumsangaben oder andere
              Generatorwerte automatisch eingesetzt werden sollen.
            </p>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <strong>Hinweis zur Upload-Größe:</strong> Halten Sie Ihre PDFs
              unter 10 MB. Größere Dateien werden beim Upload
              abgelehnt. Reduzieren
              Sie eingebettete Bilder, vermeiden Sie unnötig hohe Auflösungen
              und exportieren Sie nur die tatsächlich benötigten Seiten.
            </div>
          </div>

          <div className="field-shell p-4">
            <h3 className="mb-3 text-xl font-black uppercase text-info-950">
              Check vor dem Upload
            </h3>
            <ul className="grid gap-2 text-sm text-info-800">
              {checklist.map((item) => (
                <li key={item} className="flex items-start gap-2">
                  <CheckCircle2 size={16} className="mt-1 shrink-0 text-pirrot-green-600" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section-shell relative z-10 py-4">
        <div className="content-card grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <div className="field-shell flex items-start gap-3 p-4">
            <div className="rounded-2xl bg-warning-100 p-3 text-warning-700">
              <Layers3 size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase text-info-950">
                Seitenregeln
              </h3>
              <p className="text-sm text-info-700">
                Umschlag: 4 Seiten. Wochenplaner: 2 Seiten. Sonstige Module als
                fertiges PDF anlegen.
              </p>
            </div>
          </div>

          <div className="field-shell flex items-start gap-3 p-4">
            <div className="rounded-2xl bg-pirrot-green-100 p-3 text-pirrot-green-700">
              <FileStack size={20} />
            </div>
            <div>
              <h3 className="text-lg font-black uppercase text-info-950">
                Upload-Hinweis
              </h3>
              <p className="text-sm text-info-700">
                PDF-Dateien möglichst unter 10 MB halten und Bilder sauber
                komprimieren.
              </p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
