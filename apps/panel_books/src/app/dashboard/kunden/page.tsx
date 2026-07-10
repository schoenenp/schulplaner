import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import CustomersTable from "./_components/customers-table";

export default async function CustomersOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Kunden"
        eyebrow="Accounts and roles"
        description="Alle Nutzerkonten durchsuchen, Rollen als Staff-Team verwalten und direkt in Bestellungen und Planer eines Kontos springen."
      >
        <CustomersTable />
      </DashboardShell>
    </HydrateClient>
  );
}
