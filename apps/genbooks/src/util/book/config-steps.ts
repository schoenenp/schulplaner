import type { ConfigStepId } from "@/util/book/configurator";

export const configSteps: Array<{
  id: ConfigStepId;
  title: string;
  desc: string;
  hint: string;
}> = [
  {
    id: "COVER",
    title: "Umschlag",
    desc: "Wählen Sie zuerst den Umschlag Ihres Planers aus.",
    hint: "Wischen Sie links/rechts durch die Umschläge und tippen Sie auf Auswählen.",
  },
  {
    id: "PRE",
    title: "Vorderer Teil",
    desc: "Ergänzen Sie optionale Module vor dem Wochenplaner.",
    hint: "Scrollen Sie für weitere Module. Dieser Schritt ist optional und kann mit Weiter übersprungen werden.",
  },
  {
    id: "PLANNER",
    title: "Wochenplaner",
    desc: "Wählen Sie den verpflichtenden Hauptteil Ihres Planers.",
    hint: "Wischen Sie links/rechts durch die Wochenplaner und wählen Sie einen Planer aus.",
  },
  {
    id: "POST",
    title: "Hinterer Teil",
    desc: "Ergänzen Sie optionale Module nach dem Wochenplaner.",
    hint: "Scrollen Sie für weitere Module hinter dem Planer. Mit Weiter geht es zur Bindung.",
  },
  {
    id: "BINDING",
    title: "Bindung",
    desc: "Wählen Sie die passende Bindung für Ihre Seitenzahl.",
    hint: "Wählen Sie eine Bindung aus. Nicht passende Bindungen sind automatisch gesperrt.",
  },
  {
    id: "CHECKOUT",
    title: "Checkout",
    desc: "Prüfen Sie Ihre Konfiguration und schließen Sie die Bestellung ab.",
    hint: "Prüfen Sie Vorschau, Preis und Rechtliches, dann schließen Sie die Bestellung ab.",
  },
];
