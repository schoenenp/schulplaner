import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import PlannerTable from "./_components/planner-table";

export default async function PlannerOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Planer"
        eyebrow="Templates and books"
        description="Alle Planer und Vorlagen der Plattform moderieren: Vorlagen kuratieren, Featured-Status pflegen und verwaiste Planer aufräumen."
      >
        <PlannerTable />
      </DashboardShell>
    </HydrateClient>
  );
}
