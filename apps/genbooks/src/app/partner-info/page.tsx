import Footer from "@/app/_components/footer";
import Navigation from "@/app/_components/navigation";
import PartnerInfoContent from "./_components/partner-info-content";

export default async function PartnerInfoPage({
  searchParams,
}: {
  searchParams?: Promise<{ demo?: string }>;
}) {
  const { demo } = (await searchParams) ?? {};
  const isDemoView = demo === "1";

  if (!isDemoView) {
    return (
      <main className="relative flex min-h-screen flex-col items-center overflow-hidden text-info-900">
        <div className="subtle-grid pointer-events-none absolute inset-0 opacity-30" />
        <Navigation />
        <PartnerInfoContent isDemoView={false} />
        <Footer />
      </main>
    );
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden text-info-900">
      <div className="subtle-grid pointer-events-none absolute inset-0 opacity-30" />
      <Navigation />
      <PartnerInfoContent isDemoView={true} />
      <Footer />
    </main>
  );
}
