import Link from "next/link";
import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";

const flowSteps = [
  {
    title: "Partner-Onboarding",
    text: "Abo aktivieren, Stripe Connect verbinden und Vorlage bereitstellen.",
  },
  {
    title: "Schule verifiziert",
    text: "Promo-Code eingeben und Verifizierungslink bestätigen.",
  },
  {
    title: "Konfiguration",
    text: "Direkt auf Partner-Vorlage konfigurieren, Module ergänzen.",
  },
  {
    title: "Partner-Prüfung",
    text: "Bestellung erscheint zur fachlichen Prüfung.",
  },
  {
    title: "Partner bestätigt",
    text: "Bestätigte Bestellungen werden weitergeleitet.",
  },
  {
    title: "Produktion & Versand",
    text: "Nach Freigabe: Produktion startet.",
  },
] as const;

const partnerBenefits = [
  "Volle Steuerung: Keine Produktionsauslösung ohne Partner-Freigabe",
  "Revisionssicher: Alle Statuswechsel werden nachvollziehbar protokolliert",
  "Skalierbar: Viele Schulbestellungen können strukturiert geprüft werden",
  "Vertriebsstark: Schulen erhalten einen klaren, geführten Bestellprozess",
] as const;

const faqItems = [
  {
    q: "Wer bekommt welche Rechnung?",
    a: "Die Schule erhält die Rechnung im Partner-Kontext. Produktion und Fulfillment laufen über die Plattform. Partner-Abrechnungen zur Plattform können gesammelt erfolgen.",
  },
  {
    q: "Kann die Schule später weiterkonfigurieren?",
    a: "Ja. Partner-Vorlagen können im Planer-Bereich fortgesetzt werden, solange die Kampagne aktiv ist und noch keine Bestellung eingereicht wurde.",
  },
  {
    q: "Wann endet die Partner-Markierung?",
    a: "Wenn die Kampagne abläuft oder sobald die Bestellung eingereicht wurde.",
  },
  {
    q: "Für welche Länder ist Stripe Connect aktuell aktiv?",
    a: "Aktuell für Österreich (AT) und Deutschland (DE).",
  },
] as const;

const uiGuideItems = [
  {
    area: "Für Partner",
    title: "Informationen nachlesen",
    description:
      "Unter Für Partner finden Sie den Ablauf, die Rollen und Antworten auf häufige Fragen jederzeit wieder.",
  },
  {
    area: "Partner",
    title: "Bestellungen und Archiv steuern",
    description:
      "Im Partner-Bereich werden eingehende Bestellungen geprüft, bestätigt oder abgelehnt. Abgeschlossene Vorgänge landen im Archiv.",
  },
  {
    area: "Planer",
    title: "Partner-Vorlagen fortsetzen",
    description:
      "Schulen können konfigurierte Partner-Vorlagen später wieder öffnen und weiter bearbeiten.",
  },
  {
    area: "Freigabe",
    title: "Produktion aktiv freigeben",
    description:
      "Nach Bestätigung kann der Partner den Auftrag explizit an die Produktion senden.",
  },
] as const;

const roles = [
  {
    title: "Schule",
    description:
      "Konfiguriert den Planer auf Basis der Partner-Vorlage in einem klar geführten Ablauf.",
  },
  {
    title: "Partner",
    description:
      "Prüft eingehende Bestellungen, bestätigt oder lehnt ab und gibt nur freigegebene Aufträge für Produktion frei.",
  },
  {
    title: "Plattform",
    description:
      "Übernimmt Produktion, Fulfillment und technische Abwicklung. Statusübergänge und Audit-Daten bleiben vollständig nachvollziehbar.",
  },
  {
    title: "Rechnungskontext",
    description:
      "Der Schulauftrag wird im Partner-Kontext geführt. Damit ist der Außenauftritt konsistent und die Verantwortlichkeit klar geregelt.",
  },
] as const;

export default async function PartnerInfoPage() {
  const session = await auth();
  if (!session) return <LoginPage />;

  return (
    <HydrateClient>
      <DashboardShell
        title="Für Partner"
        eyebrow="Partner-Informationen"
        description="Ablauf, Zuständigkeiten und häufige Fragen zum Partner-Programm – jederzeit zum Nachlesen."
        actions={
          <Link href="/dashboard/fulfillment" className="btn-primary">
            Druckaufträge öffnen
          </Link>
        }
      >
        <div className="space-y-8 text-white">
          <section aria-labelledby="partner-guide">
            <h3 id="partner-guide" className="mb-4 text-xl font-bold">
              Wo erledige ich was?
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {uiGuideItems.map((item) => (
                <article
                  key={item.title}
                  className="glass-card-soft space-y-2 p-5"
                >
                  <p className="text-xs font-semibold uppercase text-white/60">
                    {item.area}
                  </p>
                  <h4 className="font-bold">{item.title}</h4>
                  <p className="text-sm leading-6 text-white/80">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </section>
          <section aria-labelledby="partner-flow">
            <h3 id="partner-flow" className="mb-4 text-xl font-bold">
              Ablauf in 6 Schritten
            </h3>
            <ol className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {flowSteps.map((step, index) => (
                <li key={step.title} className="glass-card-soft space-y-2 p-5">
                  <h4 className="font-bold">
                    {index + 1}. {step.title}
                  </h4>
                  <p className="text-sm leading-6 text-white/80">{step.text}</p>
                </li>
              ))}
            </ol>
          </section>
          <section aria-labelledby="partner-roles">
            <h3 id="partner-roles" className="mb-4 text-xl font-bold">
              Wer zahlt was?
            </h3>
            <div className="grid gap-4 md:grid-cols-2">
              {roles.map((role) => (
                <article
                  key={role.title}
                  className="glass-card-soft space-y-2 p-5"
                >
                  <h4 className="font-bold">{role.title}</h4>
                  <p className="text-sm leading-6 text-white/80">
                    {role.description}
                  </p>
                </article>
              ))}
            </div>
          </section>
          <section
            aria-labelledby="partner-benefits"
            className="glass-card-soft p-5"
          >
            <h3 id="partner-benefits" className="mb-4 text-xl font-bold">
              Vorteile für Partner
            </h3>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-white/80">
              {partnerBenefits.map((benefit) => (
                <li key={benefit}>{benefit}</li>
              ))}
            </ul>
          </section>
          <section aria-labelledby="partner-faq">
            <h3 id="partner-faq" className="mb-4 text-xl font-bold">
              Häufige Fragen
            </h3>
            <div className="space-y-3">
              {faqItems.map((item) => (
                <details key={item.q} className="glass-card-soft p-5">
                  <summary className="cursor-pointer font-bold">
                    {item.q}
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-white/80">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </section>
        </div>
      </DashboardShell>
    </HydrateClient>
  );
}
