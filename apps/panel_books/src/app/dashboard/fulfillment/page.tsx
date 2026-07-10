import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import FulfillmentBoard from "./_components/fulfillment-board";

export default async function FulfillmentOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Fulfillment"
        eyebrow="Partner orders"
        description="Partner-Bestellungen durch den gesamten Lebenszyklus steuern: Beträge anpassen, als Plattform bestätigen und für die Produktion freigeben."
      >
        <FulfillmentBoard />
      </DashboardShell>
    </HydrateClient>
  );
}
