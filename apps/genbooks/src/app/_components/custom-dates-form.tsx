"use client";
import { api } from "@/trpc/react";
import { X, Plus } from "lucide-react";
import { useState, useEffect } from "react";
import DatePicker from "react-datepicker";
import { de } from "date-fns/locale";
import { registerLocale } from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
  formatDateKeyLocal,
  formatDisplayDate,
  parseDate,
  utcDateToLocalDate,
} from "@/util/date";

registerLocale("de", de);

export default function CustomDatesForm(props: { bookId: string }) {
  const { bookId } = props;

  const utils = api.useUtils();
  const { data: book, isLoading } = api.book.getById.useQuery({ id: bookId });

  const saveDates = api.book.saveCustomDates.useMutation({
    onSuccess: async () => {
      await utils.book.getById.invalidate({ id: bookId });
      await utils.config.init.invalidate({ bookId });
    },
    onError: () => undefined,
  });

  const [dates, setDates] = useState<{ date: Date; name: string }[]>([]);

  const [newDate, setNewDate] = useState<Date | null>(null);
  const [newDateInput, setNewDateInput] = useState("");
  const [newName, setNewName] = useState("");
  const [dateError, setDateError] = useState("");

  const formatPickerDate = (date: Date) => formatDisplayDate(date).replaceAll("-", ".");

  useEffect(() => {
    if (!book) return;
    const initial =
      book.customDates?.map((d) => ({
        // Persisted custom dates are UTC datetimes; convert to local calendar date
        date: utcDateToLocalDate(new Date(d.date)),
        name: d.name,
      })) ?? [];
    setDates(initial);
  }, [book]);

  const toPayload = (items: { date: Date; name: string }[]) =>
    items.map((d) => ({
      date: formatDateKeyLocal(d.date),
      name: d.name,
    }));

  // Parse date input and update newDate
  useEffect(() => {
    if (typeof newDateInput !== "string") {
      setNewDate(null);
      setDateError("");
      return;
    }
    if (newDateInput.trim() === "") {
      setNewDate(null);
      setDateError("");
      return;
    }
    const parsed = parseDate(newDateInput);
    if (parsed) {
      setNewDate(parsed);
      setDateError("");
    } else {
      setNewDate(null);
      setDateError(
        "Ungültiges Datum. Bitte verwenden Sie DD.MM.YYYY oder DD-MM-YYYY.",
      );
    }
  }, [newDateInput]);

  function addDate() {
    if (!newDate || !newName) {
      if (!newDate && newDateInput.trim() !== "") {
        setDateError("Bitte geben Sie ein gültiges Datum ein.");
      }
      return;
    }
    const updated = [...dates, { date: newDate, name: newName }];
    setDates(updated);
    saveDates.mutate({
      bookId,
      dates: toPayload(updated),
    });
    setNewDate(null);
    setNewDateInput("");
    setNewName("");
    setDateError("");
  }

  function removeDate(index: number) {
    const updated = dates.filter((_, i) => i !== index);
    setDates(updated);
    saveDates.mutate({
      bookId,
      dates: toPayload(updated),
    });
  }

  if (isLoading) return <div className="content-card p-4">Termine werden geladen...</div>;
  if (!book) return null;

  return (
    <div className="content-card flex flex-col gap-4 p-4">
      <h3 className="text-lg font-bold">Terminübersicht</h3>

      <div className="flex flex-col gap-2">
        {dates.map((d, i) => (
          <div
            key={`${formatDateKeyLocal(d.date)}-${d.name}-${i}`}
            className="field-shell flex items-center justify-between p-2"
          >
            <div>
              <span className="mr-2 font-bold">
                {formatDisplayDate(d.date)}:
              </span>
              <span>{d.name}</span>
            </div>
            <button
              type="button"
              onClick={() => removeDate(i)}
              className="text-pirrot-red-400 hover:text-pirrot-red-600"
            >
              <X size={16} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <DatePicker
          selected={newDate}
          onChange={(date: Date | null) => {
            setNewDate(date);
            setNewDateInput(date ? formatPickerDate(date) : "");
            setDateError("");
          }}
          onChangeRaw={(e) => {
            if (e) setNewDateInput((e.target as HTMLInputElement).value);
          }}
          value={newDateInput}
          dateFormat="dd.MM.yyyy"
          locale="de"
          className={`field-shell px-3 py-2.5 text-sm ${dateError ? "border-red-500" : "border-gray-300"
            }`}
        />
        <input
          type="text"
          placeholder="Name (z.B. Wandertag)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          className="field-shell flex-1 px-3 py-2.5 text-sm"
        />
        <button
          type="button"
          onClick={addDate}
          className="btn-solid px-3 py-2.5 disabled:opacity-50"
          disabled={!newDate || !newName || saveDates.isPending}
        >
          <Plus size={20} />
        </button>
      </div>
      {dateError && <p className="mt-1 text-sm text-red-500">{dateError}</p>}
    </div>
  );
}
