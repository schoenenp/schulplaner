import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import DashboardShell from "../../_components/dashboard-shell";
import TipsForm from "./_components/tips-form";

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
        title={paramsId ? "Tooltip bearbeiten" : "Neuer Tooltip"}
        eyebrow="Tooltip workspace"
        description="Pflegen Sie Hilfetexte in einer kompakten, responsiven Formansicht, damit redaktionelle Anpassungen im Panel schnell erledigt sind."
        actions={
          <Link href="/dashboard/tips" className="btn-secondary gap-2">
            <ArrowLeftIcon className="size-4" />
            Zur Tooltipübersicht
          </Link>
        }
      >
        <TipsForm tipId={paramsId} />
      </DashboardShell>
    </HydrateClient>
  );
}
