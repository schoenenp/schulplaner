import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import DashboardShell from "../../_components/dashboard-shell";
import TypeForm from "./_components/type-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function TypesManage(props: {
  searchParams: SearchParams;
  params: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();

  const { searchParams } = props;
  const paramsId = (await searchParams).typeId as string | undefined;

  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title={paramsId ? "Typ bearbeiten" : "Neuer Typ"}
        eyebrow="Type workspace"
        description="Legen Sie Seitenregeln und Kategoriedefinitionen so an, dass sie auch auf kleineren Displays schnell prüfbar und änderbar bleiben."
        actions={
          <Link href="/dashboard/types" className="btn-secondary gap-2">
            <ArrowLeftIcon className="size-4" />
            Zur Typenübersicht
          </Link>
        }
      >
        <TypeForm typeId={paramsId} />
      </DashboardShell>
    </HydrateClient>
  );
}
