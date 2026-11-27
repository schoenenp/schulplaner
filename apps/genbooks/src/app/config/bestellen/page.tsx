import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import Navigation from "@/app/_components/navigation";
import { auth } from "@/server/auth";
import { getSchoolPlanner } from "@/server/school-planner";
import {
  schoolPlannerSpec,
  verifySchoolPlannerPreview,
} from "@/server/school-planner-pdf";
import { SchoolPreview } from "../_components/school-preview";
import SchoolOrderForm from "./school-order-form";

export const metadata = { title: "Schulplaner bestellen | Pirrot" };

export default async function SchoolOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ bookId?: string; preview?: string }>;
}) {
  const [{ bookId, preview }, session] = await Promise.all([
    searchParams,
    auth(),
  ]);
  if (typeof bookId !== "string" || !bookId) notFound();
  const plannerPath = `/config?bookId=${encodeURIComponent(bookId)}&step=bestellen`;
  if (!session?.user) {
    const callbackUrl = `/config/bestellen?bookId=${encodeURIComponent(bookId)}&preview=${encodeURIComponent(preview ?? "")}`;
    redirect(`/auth/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const planner = await getSchoolPlanner(session.user.id, bookId);
  if (!planner) notFound();
  const canOrder =
    typeof preview === "string" &&
    planner.bookTitle &&
    planner.planEnd &&
    verifySchoolPlannerPreview(planner, preview);
  const { format, binding } = schoolPlannerSpec(planner);
  const cover = planner.modules.find(({ module }) => module.part === "COVER")
    ?.module.name;
  const date = new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeZone: "UTC",
  });

  return (
    <main className="bg-pirrot-blue-50 text-info-950 min-h-screen">
      <Navigation />
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-12">
        <Link
          className="text-pirrot-blue-800 w-fit text-sm font-bold underline"
          href={plannerPath}
        >
          Zurück zum Planer
        </Link>
        <header>
          <h1 className="text-3xl font-black sm:text-4xl">
            Schulplaner bestellen
          </h1>
          <p className="text-info-700 mt-2">
            Bestellen Sie direkt bei Digitaldruck Pirrot auf Rechnung.
          </p>
        </header>
        {canOrder && planner.planEnd ? (
          <SchoolOrderForm
            bookId={planner.id}
            preview={preview}
            initialQuantity={planner.quantity}
            schoolName={planner.subTitle ?? ""}
            contactName={session.user.name ?? ""}
            email={session.user.email ?? ""}
            country={planner.country === "AT" ? "AT" : "DE"}
            plannerSummary={{
              title: planner.bookTitle ?? "Schulplaner",
              cover: cover ?? "",
              format,
              binding: binding?.name ?? "",
              period: `${date.format(planner.planStart)} – ${date.format(planner.planEnd)}`,
            }}
          />
        ) : (
          <section className="content-card space-y-4 p-5">
            <p>
              Bitte prüfen Sie die Druckvorschau vor der Rechnungsbestellung.
            </p>
            <SchoolPreview bookId={planner.id} format={format} />
          </section>
        )}
      </div>
    </main>
  );
}
