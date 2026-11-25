import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { processPdfModules, setHolidayProvider, type PDFModule, type DateItem } from "../packages/pdf-pipeline/src/index";

const root = resolve(import.meta.dir, "../modules/gold");
const output = resolve(import.meta.dir, "../output/gold");
await mkdir(output, { recursive: true });
// Same OpenHolidays source and boundary markers used by the app. This sample
// explicitly uses NRW; customer planners use the school's selected region.
setHolidayProvider(async query => {
  const params = new URLSearchParams({ countryIsoCode: query.country!, subdivisionCode: query.code!, validFrom: query.start.toISOString().slice(0, 10), validTo: query.end.toISOString().slice(0, 10), languageIsoCode: "DE" });
  const lists = await Promise.all(["PublicHolidays", "SchoolHolidays"].map(async kind => {
    const response = await fetch(`https://openholidaysapi.org/${kind}?${params}`, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Holiday lookup failed: ${response.status}`);
    return await response.json() as Array<{ id: string; startDate: string; endDate: string; name: Array<{ language: string; text: string }> }>;
  }));
  await writeFile(resolve(output, "holiday-source.json"), JSON.stringify({ region: query.code, source: "https://openholidaysapi.org", fetchedAt: new Date().toISOString(), publicHolidays: lists[0], schoolHolidays: lists[1] }, null, 2));
  const entries: DateItem[] = [];
  for (const day of lists[0]!) entries.push({ id: day.id, date: day.startDate, name: day.name.find(n => n.language === "DE")!.text });
  for (const day of lists[1]!) {
    const name = day.name.find(n => n.language === "DE")!.text;
    entries.push({ id: day.id, date: day.startDate, name: `${name} Start` }, { id: day.id, date: day.endDate, name: `${name} Ende` });
  }
  return entries;
});
const specs = [
  ["umschlag", "umschlag.pdf"],
  ["inhalt", "stundenplan.pdf"],
  ["inhalt", "meine-leistungen.pdf"],
  ["wochenplaner", "wochenplan.pdf"],
] as const;
const modules: PDFModule[] = await Promise.all(specs.map(async ([type, file], idx) => ({
  id: file, name: file, type, idx,
  pdfUrl: `data:application/pdf;base64,${(await readFile(resolve(root, file))).toString("base64")}`,
})));
const details = {
  title: "Mein Schulplaner", subtitle: "Nicht auf dem schlichten Umschlag",
  addHolidays: true, country: "DE", code: "DE-NW",
  period: { start: new Date(2026, 7, 24), end: new Date(2027, 6, 9) },
  customDates: [
    { date: "2026-08-24", name: "Schulstart" },
    { date: "2026-08-27", name: "Elternabend der Klassen 5 bis 8 um 18 Uhr in der Aula" },
    { date: "2027-01-05", name: "Projektwoche" },
  ],
};
const result = await processPdfModules(details, modules, { format: "DIN A5", addPageNumbers: true });
await mkdir(output, { recursive: true });
await writeFile(resolve(output, "schulplaner-beige-gold-2026-2027.pdf"), result.pdfFile);
await writeFile(resolve(output, "generation.json"), JSON.stringify(result.details, null, 2));
console.log(JSON.stringify(result.details));
