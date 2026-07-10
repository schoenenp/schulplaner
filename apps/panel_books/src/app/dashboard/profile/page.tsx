import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import { redirect } from "next/navigation";
import DashboardShell from "../_components/dashboard-shell";

export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    redirect("/");
  }

  return (
    <HydrateClient>
      <DashboardShell
        title="Profil"
        eyebrow="Account"
        description="Kontoinformationen für den aktuellen Panel-Zugang. Die Ansicht bleibt bewusst schlank und lesbar auf kleinen sowie großen Displays."
      >
        <div className="dashboard-card-grid grid gap-5">
          <div className="glass-card-soft p-5 sm:p-6">
            <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
              E-Mail
            </p>
            <p className="mt-3 break-all text-xl font-black text-white sm:text-2xl">
              {session.user?.email ?? "Nicht gesetzt"}
            </p>
          </div>
          <div className="glass-card-soft p-5 sm:p-6">
            <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
              Rolle
            </p>
            <p className="mt-3 break-words text-xl font-black text-white sm:text-2xl">
              {session.user?.role ?? "Unbekannt"}
            </p>
          </div>
        </div>
      </DashboardShell>
    </HydrateClient>
  );
}
