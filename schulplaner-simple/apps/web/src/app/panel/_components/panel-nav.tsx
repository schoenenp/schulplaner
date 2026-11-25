"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Home, Layers, Package, Settings, Users } from "lucide-react";

const ITEMS = [
  { href: "/panel", label: "Übersicht", icon: Home, exact: true },
  { href: "/panel/bestellungen", label: "Bestellungen", icon: Package },
  { href: "/panel/kunden", label: "Kunden", icon: Users },
  { href: "/panel/planer", label: "Standardplaner", icon: BookOpen },
  { href: "/panel/module", label: "Module & Umschläge", icon: Layers },
  { href: "/panel/einstellungen", label: "Einstellungen", icon: Settings, adminOnly: true },
];

export function PanelNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-row flex-wrap gap-1 md:flex-col">
      {ITEMS.filter((item) => isAdmin || !item.adminOnly).map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
              active ? "bg-brand-soft font-medium text-brand" : "text-ink hover:bg-paper"
            }`}
          >
            <Icon className="size-4" /> {label}
          </Link>
        );
      })}
    </nav>
  );
}
