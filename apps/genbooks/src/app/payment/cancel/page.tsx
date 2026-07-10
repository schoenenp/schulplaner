
import { HydrateClient } from "@/trpc/server";
import Navigation from "@/app/_components/navigation";
import CancelOrder from "./_components/cancel-order";

export default async function Cancel({
    searchParams,
  }: {
    searchParams: Promise<{ q: string }>
  }) {

    const {q} = await searchParams
    

    // const {mutate: cancelOrder} = api.order.cancel.useMutation()
    // cancelOrder({orderId})
  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center bg-gradient-to-b gap-12 from-pirrot-blue-50 to-pirrot-blue-200 text-info-900">
        <Navigation />
        <CancelOrder payload={q} />
        

      </main>
    </HydrateClient>
  );
}
