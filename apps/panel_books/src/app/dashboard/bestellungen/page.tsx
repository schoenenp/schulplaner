import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import OrdersTable from "./_components/orders-table";

export default async function OrdersOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Bestellungen"
        eyebrow="Shop fulfillment"
        description="Alle Shop-Bestellungen mit Zahlungs- und Versandstatus im Blick behalten, durchsuchen und direkt im Panel abwickeln."
      >
        <OrdersTable />
      </DashboardShell>
    </HydrateClient>
  );
}
