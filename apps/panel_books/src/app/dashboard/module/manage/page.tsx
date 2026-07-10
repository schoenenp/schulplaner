import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import Link from "next/link";
import { ArrowLeftIcon } from "@heroicons/react/16/solid";
import DashboardShell from "../../_components/dashboard-shell";
import ModuleForm from "./_components/module-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function ModuleManage(props: {
  searchParams: SearchParams;
  params: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();

  const { searchParams } = props;
  const paramsId = (await searchParams).moduleId as string | undefined;

  void api.module.initPage.prefetch();
  if (!session) {
    return <LoginPage />;
  }

  return (
    <HydrateClient>
      <DashboardShell
        title={paramsId ? "Modul bearbeiten" : "Neues Modul"}
        eyebrow="Module workspace"
        description="Pflegen Sie Dateiupload, Vorschau, Sichtbarkeit und Feld-Mapping in einer zusammenhängenden Bearbeitungsansicht."
        actions={
          <Link href="/dashboard/module" className="btn-secondary gap-2">
            <ArrowLeftIcon className="size-4" />
            Zur Modulübersicht
          </Link>
        }
      >
        <ModuleForm moduleId={paramsId} />
      </DashboardShell>
    </HydrateClient>
  );
}
