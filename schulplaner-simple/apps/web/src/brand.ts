/**
 * Client identity. Everything customer-facing that names the provider reads
 * from here, so a new client only needs this file, the logo in
 * public/brand/ and the colors in src/app/globals.css.
 */
export const brand = {
  name: "Schulplaner",
  company: "Musterdruck GmbH",
  email: "kontakt@example.de",
  phone: "+49 000 000000",
  address: ["Musterstraße 1", "12345 Musterstadt"],
  website: "https://example.de",
  logo: "/brand/logo.svg",
  headline: "Der Schulplaner für Ihre Schule.",
  intro:
    "Ein fertiger Planer, mit Ihren Ferien und Terminen. Titel eintragen, Termine ergänzen, Umschlag wählen, bestellen.",
  legal: [
    ["Impressum", "https://example.de/impressum"],
    ["Datenschutz", "https://example.de/datenschutz"],
    ["AGB", "https://example.de/agb"],
  ],
  /** Planner defaults for new schools. */
  country: "DE",
  region: "DE-NW",
  format: "A5",
  binding: "Klammerheftung",
} as const;
