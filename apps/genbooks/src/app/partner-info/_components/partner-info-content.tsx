'use client';

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  GraduationCap,
  Handshake,
  LayoutDashboard,
  MailCheck,
  MonitorCheck,
  PackageCheck,
  Send,
  Settings2,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const flowSteps = [
  {
    icon: Handshake,
    title: "Partner-Onboarding",
    text: "Abo aktivieren, Stripe Connect verbinden und Vorlage bereitstellen.",
  },
  {
    icon: MailCheck,
    title: "Schule verifiziert",
    text: "Promo-Code eingeben und Verifizierungslink bestätigen.",
  },
  {
    icon: Settings2,
    title: "Konfiguration",
    text: "Direkt auf Partner-Vorlage konfigurieren, Module ergänzen.",
  },
  {
    icon: ClipboardCheck,
    title: "Partner-Prüfung",
    text: "Bestellung erscheint zur fachlichen Prüfung.",
  },
  {
    icon: CheckCircle2,
    title: "Partner bestätigt",
    text: "Bestätigte Bestellungen werden weitergeleitet.",
  },
  {
    icon: Truck,
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
    icon: LayoutDashboard,
    area: "Profil",
    title: "Überblick für Interessenten",
    description:
      "Die Profilansicht erklärt das Partner-Modell, den Leistungsumfang der Plattform und die Voraussetzungen für den Einstieg.",
  },
  {
    icon: Handshake,
    area: "Partner",
    title: "Bestellungen und Archiv steuern",
    description:
      "Im Partner-Bereich werden eingehende Bestellungen geprüft, bestätigt oder abgelehnt. Abgeschlossene Vorgänge landen im Archiv.",
  },
  {
    icon: Settings2,
    area: "Planer",
    title: "Partner-Vorlagen fortsetzen",
    description:
      "Schulen können konfigurierte Partner-Vorlagen später wieder öffnen und weiter bearbeiten.",
  },
  {
    icon: Send,
    area: "Freigabe",
    title: "Produktion aktiv freigeben",
    description:
      "Nach Bestätigung kann der Partner den Auftrag explizit an die Produktion senden.",
  },
] as const;

const roles = [
  {
    title: "Schule",
    description: "Konfiguriert den Planer auf Basis der Partner-Vorlage in einem klar geführten Ablauf.",
    icon: GraduationCap,
    color: "bg-pirrot-blue-100 text-pirrot-blue-700",
  },
  {
    title: "Partner",
    description: "Prüft eingehende Bestellungen, bestätigt oder lehnt ab und gibt nur freigegebene Aufträge für Produktion frei.",
    icon: Handshake,
    color: "bg-pirrot-green-100 text-pirrot-green-700",
  },
  {
    title: "Plattform",
    description: "Übernimmt Produktion, Fulfillment und technische Abwicklung. Statusübergänge und Audit-Daten bleiben vollständig nachvollziehbar.",
    icon: Building2,
    color: "bg-amber-100 text-amber-700",
  },
  {
    title: "Rechnungskontext",
    description: "Der Schulauftrag wird im Partner-Kontext geführt. Damit ist der Außenauftritt konsistent und die Verantwortlichkeit klar geregelt.",
    icon: ShieldCheck,
    color: "bg-pirrot-red-100 text-pirrot-red-700",
  },
] as const;

function AnimatedSectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5 }}
      className="mb-6 flex flex-col gap-2"
    >
      <h2 className="text-3xl font-black uppercase text-info-950 sm:text-4xl">
        {title}
      </h2>
      <p className="max-w-3xl text-info-700">{subtitle}</p>
      <div className="h-1 w-24 rounded-full bg-gradient-to-r from-pirrot-blue-500 to-pirrot-red-300" />
    </motion.div>
  );
}

function FAQItem({ question, answer, isOpen, onToggle }: { question: string; answer: string; isOpen: boolean; onToggle: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="content-card overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 p-4 text-left"
      >
        <h3 className="text-base font-black text-info-950">{question}</h3>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={20} className="text-pirrot-blue-600" />
        </motion.div>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-4 text-sm text-info-700">{answer}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function PartnerInfoContent({ isDemoView }: { isDemoView: boolean }) {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <>
      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="section-shell relative z-10 mt-8 pb-4"
      >
        <div className="content-card grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
          <div className="flex flex-col gap-4">
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xs font-black uppercase tracking-[0.1em] text-pirrot-blue-700"
            >
              Partner-Programm
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-4xl font-black uppercase text-info-950 sm:text-5xl"
            >
              Das Partner-Programm klar erklärt
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="max-w-2xl text-base text-info-700 sm:text-lg"
            >
              Sie stellen Vorlagen bereit, Schulen konfigurieren darauf, und
              Sie entscheiden im Dashboard, welche Bestellungen in die
              Produktion überführt werden.
            </motion.p>
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="flex flex-wrap gap-3"
            >
              <Link
                href="/dashboard?view=partner"
                className="btn-solid inline-flex items-center gap-2 px-4 py-2.5"
              >
                Partner-Bereich öffnen
                <ArrowRight size={16} />
              </Link>
              <Link href="/template?demo=1" className="btn-soft px-4 py-2.5">
                Template-Entry ansehen
              </Link>
              <Link
                href={isDemoView ? "/partner-info" : "/partner-info?demo=1"}
                className="btn-soft inline-flex items-center gap-2 px-4 py-2.5"
              >
                <MonitorCheck size={16} />
                {isDemoView ? "Demo-View ausblenden" : "Demo-View anzeigen"}
              </Link>
            </motion.div>
          </div>

          <motion.aside
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.5 }}
            className="content-card border border-pirrot-blue-200/50 bg-pirrot-blue-50/65 p-4"
          >
            <p className="text-sm font-bold uppercase tracking-[0.08em]">
              Zielgruppe
            </p>
            <ul className="mt-3 flex flex-col gap-2 text-sm text-info-800">
              <li className="field-shell flex items-center gap-2 px-3 py-2">
                <Building2 size={16} /> Partner mit eigenem Schulvertrieb
              </li>
              <li className="field-shell flex items-center gap-2 px-3 py-2">
                <GraduationCap size={16} /> Schulen, die auf Vorlagen bestellen
              </li>
              <li className="field-shell flex items-center gap-2 px-3 py-2">
                <ShieldCheck size={16} /> Organisationen mit klaren Freigabeprozessen
              </li>
            </ul>
          </motion.aside>
        </div>
      </motion.section>

      <section className="section-shell relative z-10 py-6">
        <AnimatedSectionHeader
          title="UI-Leitfaden"
          subtitle="Wo Partner welche Aktion im Produkt ausführen."
        />
        <div className="grid gap-4 lg:grid-cols-2">
          {uiGuideItems.map((item, index) => (
            <motion.article
              key={item.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="content-card flex flex-col gap-3 p-4 transition-shadow hover:shadow-lg"
            >
              <div className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-bold uppercase ${item.icon === LayoutDashboard ? 'bg-pirrot-blue-100 text-pirrot-blue-800' : item.icon === Handshake ? 'bg-pirrot-green-100 text-pirrot-green-800' : item.icon === Settings2 ? 'bg-amber-100 text-amber-800' : 'bg-pirrot-red-100 text-pirrot-red-800'}`}>
                <item.icon size={14} />
                {item.area}
              </div>
              <h3 className="text-base font-black text-info-950">{item.title}</h3>
              <p className="text-sm text-info-700">{item.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      {isDemoView ? (
        <section className="section-shell relative z-10 py-6">
          <AnimatedSectionHeader
            title="Demo-View"
            subtitle="Visuelle Kurzansicht für Präsentationen mit Partnern."
          />
          <div className="grid gap-4 xl:grid-cols-2">
            <motion.article
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="content-card p-5"
            >
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-info-600">
                Partner-Bereich
              </p>
              <h3 className="mt-2 text-lg font-black text-info-950">
                Eingehende Partner-Bestellungen
              </h3>
              <div className="mt-4 space-y-2 text-sm">
                <div className="field-shell flex items-center justify-between px-3 py-2">
                  <span>Schule Mustergymnasium</span>
                  <span className="rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">
                    Eingereicht
                  </span>
                </div>
                <div className="field-shell flex items-center justify-between px-3 py-2">
                  <span>Schule Campus Nord</span>
                  <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    Bestätigt
                  </span>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-xs">
                <span className="rounded bg-pirrot-blue-100 px-2 py-1 font-semibold text-pirrot-blue-800">
                  Partnerschaft bestätigen
                </span>
                <span className="rounded bg-pirrot-blue-100 px-2 py-1 font-semibold text-pirrot-blue-800">
                  Ablehnen
                </span>
                <span className="rounded bg-pirrot-blue-100 px-2 py-1 font-semibold text-pirrot-blue-800">
                  An Produktion senden
                </span>
              </div>
            </motion.article>

            <motion.article
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
              className="content-card p-5"
            >
              <p className="text-xs font-bold uppercase tracking-[0.08em] text-info-600">
                Auftragsfluss
              </p>
              <h3 className="mt-2 text-lg font-black text-info-950">
                Status bis zur Erfüllung
              </h3>
              <ol className="mt-4 space-y-2 text-sm">
                <li className="field-shell flex items-center gap-2 px-3 py-2">
                  <CheckCircle2 size={15} className="text-pirrot-green-600" />
                  Von Schule eingereicht
                </li>
                <li className="field-shell flex items-center gap-2 px-3 py-2">
                  <PackageCheck size={15} className="text-pirrot-blue-700" />
                  Vom Partner bestätigt
                </li>
                <li className="field-shell flex items-center gap-2 px-3 py-2">
                  <Truck size={15} className="text-pirrot-blue-700" />
                  Für Produktion freigegeben
                </li>
              </ol>
              <p className="mt-4 text-sm text-info-700">
                Diese Reihenfolge zeigt Partnern klar, dass Produktion erst
                nach expliziter Freigabe erfolgt.
              </p>
            </motion.article>
          </div>
          <motion.article
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="content-card mt-4 p-5"
          >
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-info-600">
              Profil-Übersicht
            </p>
            <h3 className="mt-2 text-lg font-black text-info-950">
              Klarer Einstieg für interessierte Partner
            </h3>
            <p className="mt-2 text-sm text-info-700">
              Die Profilansicht dient als allgemeiner Überblick: Rolle,
              Partner-Abo, Connect-Status und Nutzen des Service auf einen Blick.
              Operative Bestellungen laufen separat im Partner-Bereich.
            </p>
          </motion.article>
        </section>
      ) : null}

      <section className="section-shell relative z-10 py-6">
        <AnimatedSectionHeader
          title="Ablauf in 6 Schritten"
          subtitle="Der durchgängige Prozess vom Partner-Link bis zur Produktionsfreigabe."
        />
        
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          {flowSteps.map((step, index) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative mb-3">
                <motion.div
                  whileHover={{ scale: 1.05 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-pirrot-blue-600 text-white shadow-lg"
                >
                  <step.icon size={28} />
                </motion.div>
                <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-pirrot-blue-800 text-sm font-bold text-white">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-base font-black text-info-950">
                {step.title}
              </h3>
              <p className="mt-1 text-sm text-info-600">
                {step.text}
              </p>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="section-shell relative z-10 py-6">
        <AnimatedSectionHeader
          title="Wer zahlt was?"
          subtitle="Kompakt und verständlich für Gespräche mit Partnern und Schulen."
        />
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
          {roles.map((role, index) => (
            <motion.article
              key={role.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -4 }}
              className="content-card flex flex-col items-center gap-3 p-5 text-center transition-shadow hover:shadow-lg"
            >
              <div className={`rounded-full p-3 ${role.color}`}>
                <role.icon size={24} />
              </div>
              <h3 className="text-lg font-black text-info-950">{role.title}</h3>
              <p className="text-sm text-info-700">{role.description}</p>
            </motion.article>
          ))}
        </div>
      </section>

      <section className="section-shell relative z-10 py-6">
        <AnimatedSectionHeader
          title="Vorteile für Partner"
          subtitle="Der konkrete Mehrwert im täglichen Betrieb."
        />
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="content-card p-5"
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {partnerBenefits.map((item, index) => (
              <motion.li
                key={item}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="field-shell flex items-start gap-2 px-3 py-2 text-sm"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 + 0.2, type: "spring" }}
                >
                  <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-pirrot-green-600" />
                </motion.div>
                <span>{item}</span>
              </motion.li>
            ))}
          </ul>
        </motion.div>
      </section>

      <section className="section-shell relative z-10 py-6">
        <AnimatedSectionHeader
          title="Häufige Fragen"
          subtitle="Die wichtigsten Punkte für Onboarding und Vertriebsgespräche."
        />
        <div className="grid gap-3">
          {faqItems.map((item, index) => (
            <FAQItem
              key={item.q}
              question={item.q}
              answer={item.a}
              isOpen={openFaq === index}
              onToggle={() => setOpenFaq(openFaq === index ? null : index)}
            />
          ))}
        </div>
      </section>

      <motion.section
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="section-shell relative z-10 py-8"
      >
        <div className="content-card flex flex-col gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-black uppercase text-info-950">
              Nächster Schritt
            </h2>
            <p className="mt-1 text-sm text-info-700">
              Öffnen Sie den Partner-Bereich und erstellen Sie Ihre erste
              Kampagne auf Basis einer Vorlage.
            </p>
          </div>
          <Link
            href="/dashboard?view=partner"
            className="btn-solid inline-flex items-center gap-2 px-4 py-2.5"
          >
            Zum Partner-Dashboard
            <ArrowRight size={16} />
          </Link>
        </div>
      </motion.section>
    </>
  );
}
