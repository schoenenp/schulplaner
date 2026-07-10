"use client";

import {
  ArrowRightEndOnRectangleIcon,
  Bars3BottomLeftIcon,
  BookOpenIcon,
  ChartBarIcon,
  DocumentTextIcon,
  ListBulletIcon,
  QuestionMarkCircleIcon,
  ShoppingCartIcon,
  Squares2X2Icon,
  TagIcon,
  TicketIcon,
  TruckIcon,
  UserCircleIcon,
  UsersIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
  matches: string[];
};

type NavGroup = {
  label: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Übersicht",
    items: [
      {
        href: "/dashboard",
        label: "Dashboard",
        icon: Squares2X2Icon,
        matches: ["/dashboard"],
      },
    ],
  },
  {
    label: "Shop",
    items: [
      {
        href: "/dashboard/bestellungen",
        label: "Bestellungen",
        icon: ShoppingCartIcon,
        matches: ["/dashboard/bestellungen", "/dashboard/bestellungen/manage"],
      },
      {
        href: "/dashboard/kunden",
        label: "Kunden",
        icon: UsersIcon,
        matches: ["/dashboard/kunden", "/dashboard/kunden/manage"],
      },
      {
        href: "/dashboard/gutscheine",
        label: "Gutscheine",
        icon: TicketIcon,
        matches: ["/dashboard/gutscheine"],
      },
    ],
  },
  {
    label: "Partner",
    items: [
      {
        href: "/dashboard/fulfillment",
        label: "Fulfillment",
        icon: TruckIcon,
        matches: ["/dashboard/fulfillment"],
      },
      {
        href: "/dashboard/verkaeufe",
        label: "Verkäufe",
        icon: ChartBarIcon,
        matches: ["/dashboard/verkaeufe"],
      },
    ],
  },
  {
    label: "Katalog",
    items: [
      {
        href: "/dashboard/planer",
        label: "Planer",
        icon: BookOpenIcon,
        matches: ["/dashboard/planer"],
      },
      {
        href: "/dashboard/module",
        label: "Module",
        icon: DocumentTextIcon,
        matches: ["/dashboard/module", "/dashboard/module/manage"],
      },
      {
        href: "/dashboard/types",
        label: "Typen",
        icon: TagIcon,
        matches: ["/dashboard/types", "/dashboard/types/manage"],
      },
      {
        href: "/dashboard/variablen",
        label: "Variablen",
        icon: ListBulletIcon,
        matches: ["/dashboard/variablen"],
      },
      {
        href: "/dashboard/tips",
        label: "Tooltips",
        icon: QuestionMarkCircleIcon,
        matches: ["/dashboard/tips", "/dashboard/tips/manage"],
      },
    ],
  },
];

export default function Navigation() {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  function handleNavigate() {
    setIsOpen(false);
  }

  return (
    <aside className="glass-card relative z-10 h-fit w-full shrink-0 overflow-hidden lg:sticky lg:top-6 lg:w-72 xl:w-80">
      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-25" />
      <div className="relative z-10 flex items-center justify-between gap-3 border-b border-pirrot-blue-200/10 px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="compact-label truncate text-xs font-semibold uppercase text-pirrot-blue-200/75">
            Panel Books
          </p>
          <h1 className="truncate text-xl font-bold text-white sm:text-2xl">
            Staff Panel
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setIsOpen((current) => !current)}
          className="btn-secondary shrink-0 p-2 lg:hidden"
          aria-label={isOpen ? "Navigation schließen" : "Navigation öffnen"}
        >
          {isOpen ? (
            <XMarkIcon className="size-5" />
          ) : (
            <Bars3BottomLeftIcon className="size-5" />
          )}
        </button>
      </div>

      <div
        className={`${isOpen ? "flex" : "hidden"} relative z-10 flex-col gap-5 p-3 sm:p-4 lg:flex`}
      >
        <nav className="flex flex-col gap-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-1.5">
              <p className="compact-label px-3 text-[11px] font-semibold uppercase text-pirrot-blue-200/55">
                {group.label}
              </p>
              {group.items.map((item) => {
                const isActive = item.matches.some(
                  (match) => pathname === match,
                );
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={handleNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={[
                      "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition",
                      isActive
                        ? "bg-pirrot-blue-500 text-white shadow-lg shadow-pirrot-blue-950/35"
                        : "text-pirrot-blue-100/85 hover:bg-pirrot-blue-950/80 hover:text-white",
                    ].join(" ")}
                  >
                    <Icon
                      className={[
                        "size-5 shrink-0 transition",
                        isActive
                          ? "text-white"
                          : "text-pirrot-blue-200/80 group-hover:text-white",
                      ].join(" ")}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="glass-card-soft flex flex-col gap-3 p-4">
          <div className="badge-shell w-fit">Workspace</div>
          <p className="text-sm text-pirrot-blue-100/80">
            Bestellungen, Kunden, Partner-Fulfillment und der komplette
            Modulkatalog – die zentrale Arbeitsoberfläche für das Staff-Team.
          </p>
        </div>

        <div className="mt-auto flex flex-col gap-2 border-t border-pirrot-blue-200/10 pt-4 text-sm text-pirrot-blue-100/75">
          <Link
            href="/dashboard/profile"
            onClick={handleNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-pirrot-blue-950/75 hover:text-white"
          >
            <UserCircleIcon className="size-5 shrink-0" />
            <span className="truncate">Profil</span>
          </Link>
          <Link
            href="/api/auth/signout"
            onClick={handleNavigate}
            className="flex items-center gap-3 rounded-lg px-3 py-2 transition hover:bg-pirrot-blue-950/75 hover:text-white"
          >
            <ArrowRightEndOnRectangleIcon className="size-5 shrink-0" />
            <span className="truncate">Logout</span>
          </Link>
          <span className="compact-label px-3 pt-2 text-xs uppercase text-pirrot-blue-200/60">
            Digitaldruck Pirrot GmbH
          </span>
        </div>
      </div>
    </aside>
  );
}
