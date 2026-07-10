import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/16/solid";
import DashboardShell from "../_components/dashboard-shell";
import TypeGrid from "./_components/type-grid";

export default async function TypesOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Typen"
        eyebrow="Page rules and formats"
        description="Pflegen Sie Seitenspannen, Formatlogik und den strukturellen Rahmen für die Modulkategorien in einer übersichtlichen Arbeitsansicht."
        actions={
          <Link href="/dashboard/types/manage" className="btn-primary gap-2">
            <PlusIcon className="size-4" />
            Typ anlegen
          </Link>
        }
      >
        <TypeGrid />
      </DashboardShell>
    </HydrateClient>
  );
}
