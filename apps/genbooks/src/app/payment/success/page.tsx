import { HydrateClient } from "@/trpc/server";
import Navigation from "@/app/_components/navigation";
import CheckoutSuccess from "./_components/checkout-success";

export default async function Success({
  searchParams,
}: {
  searchParams: Promise<{
    session_id?: string;
    order_ref?: string;
    flow?: string;
  }>;
}) {
  const { session_id, order_ref, flow } = await searchParams;
  return (
    <HydrateClient>
      <main className="flex min-h-screen flex-col items-center gap-12 bg-gradient-to-b from-pirrot-blue-50 to-pirrot-blue-200 text-info-900">
        <Navigation />
        <div className="flex w-full justify-center px-4 pt-12">
          <CheckoutSuccess
            sessionId={session_id}
            orderRef={order_ref}
            flow={flow}
          />
        </div>
      </main>
    </HydrateClient>
  );
}
