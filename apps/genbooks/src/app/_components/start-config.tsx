"use client";

import { EyeIcon, AlertCircle } from "lucide-react";
import { useState } from "react";
import BookPreview from "./book-preview";
import About from "./about";
import PlannerForm from "./planner-form";
import HowItWorks from "./how-it-works";
import TemplateGallery from "./template-gallery";
import Footer from "./footer";
// import FAQ from "./faq"

const currentDate = new Date();
const nextYearDate = new Date(currentDate);
nextYearDate.setFullYear(currentDate.getFullYear() + 1);

type StartConfigProps = {
  initialCountry?: string;
  initialRegion?: string;
};

export default function StartConfig({
  initialCountry = "DE",
  initialRegion = "DE-SL",
}: StartConfigProps) {
  const [previewData, setPreviewData] = useState({
    name: "Schulplaner",
    sub: "Meine Schule",
    period: {
      start: currentDate.toISOString().slice(0, 16),
      end: nextYearDate.toISOString().slice(0, 16),
    },
  });

  const [isFormValid, setIsFormValid] = useState(false);

  return (
    <div className="rise-in relative z-10 flex w-full flex-col items-center justify-center gap-16 pb-12">
      <section className="section-shell flex flex-col items-center gap-6 pt-8 text-center">
        <span className="btn-soft inline-flex px-4 py-2 text-sm uppercase tracking-wider">
          Digitaldruck Pirrot
        </span>
        <h1 className="hero-title text-pirrot-red-500 flex items-center justify-center gap-4 text-5xl font-black uppercase lg:text-7xl">
          Schulplaner Generator
        </h1>
        <p className="mx-auto max-w-3xl text-lg text-info-800 lg:text-2xl">
          Gestalten Sie individuelle Schulplaner mit Hausaufgabenübersicht,
          Stundenplan, Kalender und allen wichtigen Funktionen für den
          Schulalltag.
        </p>
      </section>
      <HowItWorks />

      <TemplateGallery />

      <section className="section-shell w-full py-2">
        <div className="content-card grid min-h-[640px] w-full grid-cols-1 items-center justify-center gap-8 p-3 py-8 lg:grid-cols-3 lg:p-6">
          <div className="order-2 col-span-1 flex w-full flex-col items-center justify-center gap-4 px-3 py-10 lg:order-1 lg:py-20">
            <BookPreview
              name={previewData.name}
              period={previewData.period}
              sub={previewData.sub}
            />
            <span className="text-info-950 flex items-center justify-center gap-2 text-center text-sm font-semibold uppercase tracking-wide">
              <EyeIcon strokeWidth={3} size={20} /> Vorschau
            </span>

            {!isFormValid && (
              <div className="text-pirrot-red-500 mt-2 flex items-center gap-2 rounded-full border border-pirrot-red-200 bg-white/70 px-4 py-2 text-sm">
                <AlertCircle size={16} />
                <span>Bitte füllen Sie alle Pflichtfelder aus</span>
              </div>
            )}
          </div>

          <div className="relative order-1 col-span-1 flex flex-col justify-center gap-8 lg:order-2 lg:col-span-2">
            <div className="bg-pirrot-blue-100/35 absolute z-0 size-full rounded-3xl blur-2xl" />
            <PlannerForm
              initialCountry={initialCountry}
              initialRegion={initialRegion}
              onFormChange={setPreviewData}
              onValidationChange={setIsFormValid}
            />
          </div>
        </div>
      </section>

      <About />

      <Footer />
    </div>
  );
}
