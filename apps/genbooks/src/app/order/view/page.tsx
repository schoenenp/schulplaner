import { HydrateClient } from "@/trpc/server";
import Navigation from "@/app/_components/navigation";
import Overview from "@/app/dashboard/orders/_components/overview";
// import ModuleForm from "./_components/module-form";

type SearchParams = Promise<Record<string, string | string[] | undefined>>

export default async function OrderManage(props: {
  searchParams: SearchParams,
  params: Promise<Record<string, string | string[] | undefined>>
}) {

    const {searchParams} = props
    const payload = (await searchParams).pl as string

return (
    <HydrateClient>
    <main className="flex min-h-screen flex-col bg-gradient-to-b from-pirrot-blue-100 to-pirrot-blue-50 text-pirrot-blue-50">
       <Navigation />
       <div className="p-4 flex h-full flex-col gap-4 overflow-y-auto">
        <Overview orderId={payload} />
       </div>
    </main>
    </HydrateClient>
  );
}
