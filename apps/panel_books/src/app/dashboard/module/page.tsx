import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/16/solid";
import DashboardShell from "../_components/dashboard-shell";
import ModuleGrid from "./_components/module-grid";

export default async function ModuleOverview() {
  void api.module.getAll.prefetch({ page: 1, limit: 12 });
  void api.module.getInsights.prefetch();
  void api.type.getAll.prefetch();
  const session = await auth();
  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Module"
        eyebrow="Catalog workspace"
        description="Filtern, prüfen und pflegen Sie den Modulbestand mit Sichtbarkeit, Asset-Status und direktem Zugriff auf Bearbeitungsseiten."
        actions={
          <Link href="/dashboard/module/manage" className="btn-primary gap-2">
            <PlusIcon className="size-4" />
            Neues Modul
          </Link>
        }
      >
        <ModuleGrid />
      </DashboardShell>
    </HydrateClient>
  );
}
