import Navigation from "./navigation";

type DashboardShellProps = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
};

export default function DashboardShell({
  title,
  eyebrow = "Panel Books",
  description,
  actions,
  children,
}: DashboardShellProps) {
  return (
    <main className="relative min-h-screen px-3 py-3 sm:px-4 sm:py-4">
      <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-35" />
      <div className="relative z-10 mx-auto flex max-w-[1920px] flex-col gap-4 lg:flex-row lg:items-start">
        <Navigation />
        <section className="glass-card relative min-h-[calc(100vh-1.5rem)] w-full min-w-0 flex-1 overflow-clip sm:min-h-[calc(100vh-2rem)]">
          <div className="dashboard-grid pointer-events-none absolute inset-0 opacity-20" />
          <div className="relative flex h-full flex-col">
            <header className="border-b border-pirrot-blue-200/10 px-4 py-4 sm:px-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                    {eyebrow}
                  </p>
                  <h2 className="mt-2 text-2xl font-black tracking-normal text-white sm:text-3xl">
                    {title}
                  </h2>
                  {description ? (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-pirrot-blue-100/75 lg:text-base">
                      {description}
                    </p>
                  ) : null}
                </div>
                {actions ? (
                  <div className="flex w-full shrink-0 flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    {actions}
                  </div>
                ) : null}
              </div>
            </header>
            <div className="relative min-w-0 flex-1 p-4 2xl:p-5">
              {children}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
