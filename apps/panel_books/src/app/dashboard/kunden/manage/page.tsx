import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/16/solid";

import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../../_components/dashboard-shell";
import CustomerDetail from "./_components/customer-detail";

export default async function CustomerManage({
  searchParams,
}: {
  searchParams: Promise<{ userId?: string }>;
}) {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  const { userId } = await searchParams;

  return (
    <HydrateClient>
      <DashboardShell
        title="Kundenprofil"
        eyebrow="Accounts and roles"
        description="Konto, Rolle, Bestellungen und Planer dieses Nutzers einsehen und verwalten."
        actions={
          <Link href="/dashboard/kunden" className="btn-secondary gap-2">
            <ArrowLeftIcon className="size-4" />
            Zur Übersicht
          </Link>
        }
      >
        {userId ? (
          <CustomerDetail userId={userId} />
        ) : (
          <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
            Keine Nutzer-ID übergeben.
          </p>
        )}
      </DashboardShell>
    </HydrateClient>
  );
}
