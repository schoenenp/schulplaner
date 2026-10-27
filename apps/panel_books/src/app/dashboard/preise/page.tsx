import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import LoginPage from "@/app/_components/login-page";
import DashboardShell from "../_components/dashboard-shell";
import PriceEditor from "./_components/price-editor";

export default async function PricesPage() {
  const session = await auth();

  if (!session) {
    return <LoginPage />;
  }

  if (session.user.role !== "ADMIN") {
    return (
      <DashboardShell title="Preise" eyebrow="Nur für Admins">
        <p className="glass-card-soft p-5 text-sm text-pirrot-blue-100/80">
          Die Preise können nur Admins einsehen und ändern.
        </p>
      </DashboardShell>
    );
  }

  void api.pricing.get.prefetch();

  return (
    <HydrateClient>
      <DashboardShell
        title="Preise"
        eyebrow="Nur für Admins"
        description="Druck-, Bindungs- und Versandpreise für den Planer-Shop. Jede Änderung wird als neue Version gespeichert und lässt sich wiederherstellen."
      >
        <PriceEditor />
      </DashboardShell>
    </HydrateClient>
  );
}
