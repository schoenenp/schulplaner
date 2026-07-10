import Link from "next/link";

import { auth } from "@/server/auth";
import { api, HydrateClient } from "@/trpc/server";

import ProfileSection from "./_components/profile";
import { redirect } from "next/navigation";
import {
  BookCopy,
  Component,
  Handshake,
  ReceiptEuro,
  UserIcon,
} from "lucide-react";
import ModulesSection from "./_components/modules";
import Navigation from "../_components/navigation";
import PlanerSection from "./_components/planers";
import OrdersSection from "./_components/orders";
import PartnerSection from "./_components/partner";

export default async function Dashboard({
    searchParams,
  }: {
    searchParams: Promise<{ view?: string }>
  }) {

  const session = await auth()
  const { view } = await searchParams

  void api.module.getUserModules.prefetch()
  void api.book.getUserBooks.prefetch()
  void api.order.initSection.prefetch()
  void api.partner.getStatus.prefetch()

  if(!session?.user) redirect("/")
  
    function renderView(){
      switch (view) {
          case "profil":
              return <ProfileSection {...session?.user} />
          case "planer":
              return <PlanerSection />
          case "module":
              return <ModulesSection />
          case "orders":
              return <OrdersSection />
          case "partner":
              return <PartnerSection />
          default:
              return <ProfileSection {...session?.user} />
      }
    }

  return (
    <HydrateClient>
     <main className="relative flex min-h-screen flex-col items-center overflow-hidden text-info-900">
      <div className="subtle-grid pointer-events-none absolute inset-0 opacity-35" />
      <div id="modal-hook"></div>
      <Navigation />
        <div className="section-shell relative flex w-full flex-col gap-6 py-16">
          <h2 className="text-3xl font-black uppercase lg:text-4xl">Dashboard</h2>
          <div className="flex w-full flex-col gap-4">
            <aside className="content-card h-fit p-3">
              <nav className="flex flex-col gap-2 lg:flex-row">
                {DASHBOARD_LINKS.map((dl) => (
                  <Link
                    key={dl.name}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold uppercase lg:flex-1 lg:justify-center ${
                      view === dl.name || view === undefined
                        ? "bg-pirrot-blue-100 text-pirrot-blue-900"
                        : "text-info-800 hover:bg-pirrot-blue-100/40"
                    }`}
                    href={`?view=${dl.name}`}
                  >
                    {dl.icon} {dl.name}
                  </Link>
                ))}
              </nav>
            </aside>
            <div className="min-w-0">{renderView()}</div>
          </div>
        </div>
      </main>
    </HydrateClient>
  );
}

type DashLink = {
    name: string;
    icon: React.ReactNode;
}


const DASHBOARD_LINKS:DashLink[] = [
  {
    name:"profil",
    icon: <UserIcon />,
  },
  {
    name:"planer",
    icon: <BookCopy />,
  },
  {
    name:"module",
    icon: <Component />,
  },
  {
    name:"orders",
    icon: <ReceiptEuro />,
  },
  {
    name:"partner",
    icon: <Handshake />,
  },
]
