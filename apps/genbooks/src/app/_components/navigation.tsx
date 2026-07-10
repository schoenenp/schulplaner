import {
  FileText,
  HomeIcon,
  InfoIcon,
  LogInIcon,
  LogOutIcon,
  LayoutDashboard,
} from "lucide-react";

import Link from "next/link";
import { auth } from "@/server/auth";

export default async function Navigation() {
  const session = await auth();

  return (
    <header
      id="navigation"
      className="sticky top-0 z-[101] mt-4 w-full px-3 sm:px-5"
    >
      <div className="content-card relative mx-auto flex w-full max-w-screen-xl items-center justify-between px-3 py-2 text-info-900">
        <Link
          className="text-pirrot-blue-950 z-[60] flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold hover:bg-pirrot-blue-100/50"
          href="/"
        >
          <HomeIcon />
          <span className="hidden sm:inline">
            Startseite
          </span>
        </Link>
        <div className="flex gap-2">
          <Link
            href="/module-docs"
            className="btn-soft flex items-center gap-2 px-3 py-2 text-sm"
          >
            <FileText size={18} />
            <span className="hidden sm:inline">Modul-Doku</span>
          </Link>
          <Link
            href="/partner-info"
            className="btn-soft flex items-center gap-2 px-3 py-2 text-sm"
          >
            <InfoIcon size={18} />
            <span className="hidden sm:inline">Partner-Programm Info</span>
          </Link>
          {session?.user && (
            <Link
              href="/dashboard"
              className="btn-soft flex items-center gap-2 px-3 py-2 text-sm"
            >
              <LayoutDashboard size={18} />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
          {session?.user ? (
            <Link
              href="/auth/signout"
              className="btn-soft flex items-center gap-2 px-3 py-2 text-sm"
            >
              <LogOutIcon />
              <span className="hidden sm:inline">Abmelden</span>
            </Link>
          ) : (
            <Link
              href="/auth/signin"
              className="btn-solid flex items-center gap-2 px-3 py-2 text-sm"
            >
              <LogInIcon />
              <span className="hidden sm:inline">Anmelden</span>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
