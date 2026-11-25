import Link from "next/link";
import { brand } from "@/brand";
import { requireStaff } from "@/server/access";
import { signOut } from "@/server/auth";
import { PanelNav } from "./_components/panel-nav";

export const metadata = { title: { default: "Panel", template: `%s · Panel · ${brand.name}` } };

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside className="flex shrink-0 flex-col gap-4 border-b border-line bg-white p-4 md:w-60 md:border-r md:border-b-0">
        <Link href="/panel" className="flex items-center gap-2 font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logo} alt="" className="h-8 w-8" />
          <span>Panel</span>
        </Link>
        <PanelNav isAdmin={user.role === "ADMIN"} />
        <div className="mt-auto flex flex-col gap-1 text-xs text-muted">
          <span className="truncate">{user.email}</span>
          <Link href="/" className="hover:text-ink">
            Zur Website
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button type="submit" className="hover:text-ink">
              Abmelden
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
