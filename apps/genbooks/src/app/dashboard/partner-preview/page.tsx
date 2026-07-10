import Login from "@/app/config/_components/_user/login-form";
import Navigation from "@/app/_components/navigation";
import { auth } from "@/server/auth";
import { HydrateClient } from "@/trpc/server";
import PartnerPlannerPreview from "./_components/partner-planner-preview";

export default async function PartnerPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ partnerOrderId?: string }>;
}) {
  const session = await auth();
  if (!session) {
    return <Login />;
  }

  const { partnerOrderId } = await searchParams;

  return (
    <HydrateClient>
      <main className="relative flex min-h-screen flex-col items-center overflow-hidden text-info-900">
        <div className="subtle-grid pointer-events-none absolute inset-0 opacity-35" />
        <Navigation />
        <div className="section-shell z-10 w-full py-10">
          <PartnerPlannerPreview partnerOrderId={partnerOrderId ?? ""} />
        </div>
      </main>
    </HydrateClient>
  );
}
