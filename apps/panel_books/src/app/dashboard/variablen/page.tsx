import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import VarsTable from "./_components/variables-table";

export default async function Variablen() {
  const variables = await api.tag.getAll({ includeDeleted: true });
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Variablen"
        eyebrow="Dynamic content tags"
        description="Verwalten Sie Formular-Tags, Ausgabewerte und Freigabestatus in einer responsiven Bibliothek, die auf Desktop und Mobil gleich lesbar bleibt."
      >
        <VarsTable items={variables} />
      </DashboardShell>
    </HydrateClient>
  );
}
