import Link from "next/link";
import { brand } from "@/brand";
import { isStaffRole } from "@/server/access";
import { auth, signOut } from "@/server/auth";

export async function SiteHeader() {
  const session = await auth();
  const user = session?.user;
  return (
    <header className="border-b border-line bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" className="h-8 w-8" />
          <span>{brand.name}</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {user ? (
            <>
              <Link className="rounded-lg px-3 py-2 hover:bg-paper" href="/planer">
                Mein Planer
              </Link>
              <Link className="rounded-lg px-3 py-2 hover:bg-paper" href="/bestellungen">
                Bestellungen
              </Link>
              {isStaffRole(user.role) && (
                <Link className="rounded-lg px-3 py-2 font-medium text-brand hover:bg-brand-soft" href="/panel">
                  Panel
                </Link>
              )}
              <form
                action={async () => {
                  "use server";
                  await signOut({ redirectTo: "/" });
                }}
              >
                <button className="rounded-lg px-3 py-2 text-muted hover:bg-paper" type="submit">
                  Abmelden
                </button>
              </form>
            </>
          ) : (
            <Link className="btn-primary" href="/anmelden">
              Anmelden
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
