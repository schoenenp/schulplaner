import { HydrateClient } from "@/trpc/server";
import { headers } from "next/headers";
import { detectCountryRegionFromHeaders } from "@/util/geo-prefill";
import StartConfig from "./_components/start-config";
import Navigation from "./_components/navigation";

export default async function Home() {
  const requestHeaders = await headers();
  const locationPrefill = detectCountryRegionFromHeaders(requestHeaders);

  return (
    <HydrateClient>
      <main className="relative flex min-h-screen flex-col items-center gap-12 overflow-hidden text-info-900">
        <div className="subtle-grid pointer-events-none absolute inset-0 opacity-40" />
        <Navigation />
        <StartConfig
          initialCountry={locationPrefill.country}
          initialRegion={locationPrefill.region}
        />
      </main>
    </HydrateClient>
  );
}
