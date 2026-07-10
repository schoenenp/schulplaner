export const GERMAN_STATES = [
  { land: "Baden-Württemberg", code: "DE-BW" },
  { land: "Bayern", code: "DE-BY" },
  { land: "Berlin", code: "DE-BE" },
  { land: "Brandenburg", code: "DE-BB" },
  { land: "Bremen", code: "DE-HB" },
  { land: "Hamburg", code: "DE-HH" },
  { land: "Hessen", code: "DE-HE" },
  { land: "Mecklenburg-Vorpommern", code: "DE-MV" },
  { land: "Niedersachsen", code: "DE-NI" },
  { land: "Nordrhein-Westfalen", code: "DE-NW" },
  { land: "Rheinland-Pfalz", code: "DE-RP" },
  { land: "Saarland", code: "DE-SL" },
  { land: "Sachsen", code: "DE-SN" },
  { land: "Sachsen-Anhalt", code: "DE-ST" },
  { land: "Schleswig-Holstein", code: "DE-SH" },
  { land: "Thüringen", code: "DE-TH" },
];

export const AUSTRIAN_STATES = [
  { land: "Burgenland", code: "AT-1" },
  { land: "Kärnten", code: "AT-2" },
  { land: "Niederösterreich", code: "AT-3" },
  { land: "Oberösterreich", code: "AT-4" },
  { land: "Salzburg", code: "AT-5" },
  { land: "Steiermark", code: "AT-6" },
  { land: "Tirol", code: "AT-7" },
  { land: "Vorarlberg", code: "AT-8" },
  { land: "Wien", code: "AT-9" },
];

export const Regions = [...GERMAN_STATES, ...AUSTRIAN_STATES];

export function getRegionsByCountry(country: string) {
  return Regions.filter((r) => r.code.startsWith(country)).sort((a, b) =>
    a.land.localeCompare(b.land),
  );
}

export const COUNTRIES = [
  { name: "Deutschland", code: "DE" },
  { name: "Österreich", code: "AT" },
];
