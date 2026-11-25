import Link from "next/link";
import { germanDate } from "@/lib/format";
import { regionName } from "@/lib/regions";
import { StatusBadge } from "@/components/status-badge";
import { requireUser } from "@/server/access";
import { db } from "@/server/db";
import { getTemplate } from "@/server/settings";
import { CreatePlannerButton } from "./_components/create-planner-button";

export const metadata = { title: "Mein Planer" };

export default async function PlannerListPage() {
  const user = await requireUser("/planer");
  const [planners, template] = await Promise.all([
    db.book.findMany({
      where: { createdById: user.id, isTemplate: false, frozenAt: null, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        orders: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, status: true } },
        _count: { select: { customDates: true } },
      },
    }),
    getTemplate(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Mein Planer</h1>
          <p className="mt-1 text-muted">
            Ein Planer pro Schuljahr. Inhalt und Aufbau sind fest – Sie bestimmen Titel,
            Termine und Umschlag.
          </p>
        </div>
        {template && planners.length > 0 && <CreatePlannerButton label="Weiteren Planer anlegen" secondary />}
      </div>

      {!template && (
        <p className="card text-muted">
          Der Standardplaner wird gerade vorbereitet. Bitte schauen Sie später noch einmal vorbei.
        </p>
      )}

      {template && planners.length === 0 && (
        <div className="card flex flex-col items-start gap-3">
          <h2 className="text-xl">Los geht&apos;s</h2>
          <p className="text-muted">
            Legen Sie Ihren Planer an. Sie können alles in Ruhe ausfüllen, eine Vorschau ansehen und
            erst dann bestellen.
          </p>
          <CreatePlannerButton label="Planer anlegen" />
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {planners.map((planner) => {
          const lastOrder = planner.orders[0];
          return (
            <Link
              key={planner.id}
              href={`/planer/${planner.id}`}
              className="card flex flex-col gap-2 transition hover:border-brand"
            >
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg">{planner.bookTitle ?? "Schulplaner"}</h2>
                {lastOrder && <StatusBadge status={lastOrder.status} />}
              </div>
              {planner.subTitle && <p className="text-sm">{planner.subTitle}</p>}
              <p className="text-sm text-muted">
                {germanDate(planner.planStart)} – {germanDate(planner.planEnd)} ·{" "}
                {regionName(planner.region)} · {planner._count.customDates} eigene Termine
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
