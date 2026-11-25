import { brand } from "@/brand";
import { SiteHeader } from "@/components/site-header";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="school-site flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4 text-xs text-muted">
          <span>
            {brand.company} · {brand.address.join(", ")} · {brand.email}
          </span>
          <span className="flex gap-3">
            {brand.legal.map(([label, href]) => (
              <a key={href} href={href} className="hover:text-ink" target="_blank" rel="noreferrer">
                {label}
              </a>
            ))}
          </span>
        </div>
      </footer>
    </div>
  );
}
