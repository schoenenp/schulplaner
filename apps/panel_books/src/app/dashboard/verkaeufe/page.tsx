import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import SalesOverview from "./_components/sales-overview";

export default async function SalesPage() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Verkäufe"
        eyebrow="Settlement cycles"
        description="Partnerumsätze pro Abrechnungszyklus auswerten: Bestellvolumen, Statusverteilung und die aktivsten Partner auf einen Blick."
      >
        <SalesOverview />
      </DashboardShell>
    </HydrateClient>
  );
}
