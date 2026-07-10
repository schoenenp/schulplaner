import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";
import Login from "@/app/config/_components/_user/login-form";
import Navigation from "@/app/_components/navigation";
import ModuleGrid from "./_components/module-grid";

export default async function ModuleOverview() {
  const session = await auth();

  if(!session){
    return <Login />
  }  
  
  void api.module.getUserModules.prefetch()

  
return (
    <HydrateClient>
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden text-info-900">
       <div className="subtle-grid pointer-events-none absolute inset-0 opacity-35" />
       <Navigation />
       <div className="section-shell z-10 flex flex-1 flex-col gap-4 py-10">
        <div className="w-full">
       <h1 className="text-4xl font-black uppercase">Module</h1>
        </div>
        <ModuleGrid  />
       </div>
    </main>
    </HydrateClient>
  );
}
