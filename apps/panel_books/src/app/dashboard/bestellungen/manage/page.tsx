import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/16/solid";

import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../../_components/dashboard-shell";
import OrderDetail from "./_components/order-detail";

export default async function OrderManage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string }>;
}) {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  const { orderId } = await searchParams;
  const parsedOrderId = Number(orderId);

  return (
    <HydrateClient>
      <DashboardShell
        title="Bestellung verwalten"
        eyebrow="Shop fulfillment"
        description="Status, Zahlung und Versand dieser Bestellung prüfen und aktualisieren."
        actions={
          <Link href="/dashboard/bestellungen" className="btn-secondary gap-2">
            <ArrowLeftIcon className="size-4" />
            Zur Übersicht
          </Link>
        }
      >
        {Number.isInteger(parsedOrderId) && parsedOrderId > 0 ? (
          <OrderDetail orderId={parsedOrderId} />
        ) : (
          <p className="py-16 text-center text-sm text-pirrot-blue-100/70">
            Keine gültige Bestell-ID übergeben.
          </p>
        )}
      </DashboardShell>
    </HydrateClient>
  );
}
