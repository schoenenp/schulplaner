import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import CouponsWorkspace from "./_components/coupons-workspace";

export default async function CouponsOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Gutscheine"
        eyebrow="Stripe promotions"
        description="Plattform-Coupons für den Shop erstellen und verwalten sowie Partner-Kampagnencodes aktivieren, deaktivieren und rotieren."
      >
        <CouponsWorkspace />
      </DashboardShell>
    </HydrateClient>
  );
}
