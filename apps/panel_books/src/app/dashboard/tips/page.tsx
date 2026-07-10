import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import Link from "next/link";
import { PlusIcon } from "@heroicons/react/16/solid";
import DashboardShell from "../_components/dashboard-shell";
import TipsGrid from "./_components/tip-grid";

export default async function TipsOverview() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Tooltips"
        eyebrow="Guidance library"
        description="Sammeln Sie Hilfetexte für das Config Panel zentral, damit Eingaben, Felder und Prozesse überall gleich erklärt werden."
        actions={
          <Link href="/dashboard/tips/manage" className="btn-primary gap-2">
            <PlusIcon className="size-4" />
            Tooltip anlegen
          </Link>
        }
      >
        <TipsGrid />
      </DashboardShell>
    </HydrateClient>
  );
}
