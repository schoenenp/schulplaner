"use client";
import { ArrowRight, FolderUp, HelpCircle } from "lucide-react";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/trpc/react";
import { getRegionsByCountry, COUNTRIES } from "@/util/book/regions";
import {
  getDefaultRegionForCountry,
  sanitizeCountryRegionPrefill,
} from "@/util/geo-prefill";
import DatePicker from "react-datepicker";
import { de } from "date-fns/locale";
import { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";

registerLocale("de", de);

const currentDate = new Date();
const nextYearDate = new Date(currentDate);
nextYearDate.setFullYear(currentDate.getFullYear() + 1);

interface PlannerFormProps {
  initialCountry?: string;
  initialRegion?: string;
  onFormChange?: (data: {
    name: string;
    sub: string;
    period: { start: string; end: string };
  }) => void;
  onValidationChange?: (isValid: boolean) => void;
}

export default function PlannerForm({
  initialCountry,
  initialRegion,
  onFormChange,
  onValidationChange,
}: PlannerFormProps) {
  const initialLocation = sanitizeCountryRegionPrefill(
    initialCountry,
    initialRegion,
  );
  const router = useRouter();
  const [name, setName] = useState<string>("Schulplaner");
  const [sub, setSub] = useState<string>("Meine Schule");
  const [country, setCountry] = useState<string>(initialLocation.country);
  const [region, setRegion] = useState<string>(initialLocation.region);

  const makeConfig = api.book.init.useMutation({
    onSuccess: async (data) => {
      router.push(`/config?bookId=${data.id}`);
    },
  });

  const [period, setPeriod] = useState({
    start: currentDate,
    end: nextYearDate,
  });

  // Notify parent component of form changes for preview
  useEffect(() => {
    onFormChange?.({
      name,
      sub,
      period: {
        start: period.start.toISOString().slice(0, 16),
        end: period.end.toISOString().slice(0, 16),
      },
    });
  }, [name, sub, period, onFormChange]);

  // Add validation logic
  useEffect(() => {
    const isFutureEnd = period.start < period.end;
    const isValid =
      name.trim() !== "" &&
      sub.trim() !== "" &&
      period.start &&
      period.end &&
      isFutureEnd;
    onValidationChange?.(isValid);
  }, [name, sub, period, onValidationChange]);

  async function handleNewConfig(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    await makeConfig.mutateAsync({
      name,
      sub,
      country,
      region,
      planStart: period.start.toISOString(),
      planEnd: period.end.toISOString(),
    });
  }

  return (
    <form className="z-[1] flex flex-col items-center justify-center gap-6 rounded-2xl p-4 pb-6 pt-5 text-xl lg:p-7">
      <h2 className="text-pirrot-red-500 w-full text-start text-4xl font-black lg:text-5xl">
        Infos zum Planer
      </h2>
      <p className="w-full max-w-4xl pl-1 text-start text-lg text-info-800 lg:text-xl">
        Füllen Sie mindestens die erforderlichen Felder aus. Die angegeben Daten
        können immer noch im Nachgang geändert werden. Durch einen einfachen
        Klick auf den Weiter Button leiten wir Sie Schritt-für-Schritt und
        problemlos durch den gesamten Prozess.
      </p>

      <div className="text-info-950 flex w-full flex-col gap-2">
        <div className="flex items-center gap-2">
          <label className="font-bold" htmlFor="title">
            Titel
          </label>
          <button
            type="button"
            className="text-info-400 hover:text-info-600"
            title="Der Titel erscheint auf dem Cover Ihres Planers"
          >
            <HelpCircle size={16} />
          </button>
        </div>
        <input
          id="title"
          className="field-shell w-full px-3 py-2.5"
          onChange={(e) => setName(e.target.value)}
          value={name}
          placeholder="z.B. Schulplaner, Hausaufgaben, etc."
        />
      </div>

      <div className="flex w-full flex-col gap-8 md:flex-row">
        <div className="text-info-950 flex w-full flex-1 flex-col gap-2">
          <label className="font-bold" htmlFor="sub">
            Schulart / Untertitel
          </label>
          <input
            id="sub"
            className="field-shell w-full px-3 py-2.5"
            list="schoolsList"
            onChange={(e) => setSub(e.target.value)}
            value={sub}
          />
          <datalist id="schoolsList">
            {[
              "Grundschule",
              "Erweiterte Realschule",
              "Gesamtschule",
              "Gymnasium",
            ].map((item, index) => (
              <option key={index} value={item} />
            ))}
          </datalist>
        </div>

        <div className="w-full flex-1">
          <label className="font-bold" htmlFor="country">
            Land
          </label>
          <select
            id="country"
            value={country}
            onChange={(e) => {
              const nextCountry = e.target.value;
              setCountry(nextCountry);
              setRegion(getDefaultRegionForCountry(nextCountry));
            }}
            className="field-shell w-full px-3 py-2.5"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="w-full flex-1">
          <label className="font-bold" htmlFor="region">
            Bundesland
          </label>
          <select
            id="region"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            className="field-shell w-full px-3 py-2.5"
          >
            <option value="">-- Bitte wählen --</option>
            {getRegionsByCountry(country).map((r) => (
              <option key={r.code} value={r.code}>
                {r.land}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="text-info-950 flex w-full flex-col justify-between gap-6 lg:flex-row">
        <div className="flex flex-1 flex-col gap-2">
          <label className="font-bold" htmlFor="start">
            Planer Start
          </label>
          <DatePicker
            selected={period.start}
            onChange={(date: Date | null) => {
              if (date) setPeriod({ ...period, start: date });
            }}
            dateFormat="dd.MM.yyyy"
            locale="de"
            placeholderText="DD.MM.YYYY"
            className="field-shell w-full px-3 py-2.5"
          />
        </div>

        <div className="flex flex-1 flex-col gap-2">
          <label className="font-bold" htmlFor="end">
            Planer Ende
          </label>
          <DatePicker
            selected={period.end}
            onChange={(date: Date | null) => {
              if (date) setPeriod({ ...period, end: date });
            }}
            dateFormat="dd.MM.yyyy"
            locale="de"
            placeholderText="DD.MM.YYYY"
            className="field-shell w-full px-3 py-2.5"
          />
        </div>
      </div>

      <div className="flex w-full flex-col gap-4 pt-2 sm:flex-row sm:gap-6">
        <Link
          href="dashboard?view=planer"
          className="btn-soft relative flex flex-1 cursor-pointer items-center justify-center gap-2 px-4 py-2.5"
        >
          Planer Laden <FolderUp />
        </Link>
        <button
          onClick={handleNewConfig}
          disabled={makeConfig.isPending}
          className="btn-solid relative flex flex-1 cursor-pointer items-center justify-center gap-2 px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {makeConfig.isPending ? "Wird erstellt..." : "Weiter"} <ArrowRight />
        </button>
      </div>
    </form>
  );
}
