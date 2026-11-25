import { dateInputValue } from "@/lib/format";
import { parsePriceTiers } from "@/lib/pricing";
import { ConfirmSubmit } from "@/components/confirm-submit";
import { requireAdmin } from "@/server/access";
import { db } from "@/server/db";
import { getShopSettings } from "@/server/settings";
import { removeTeamMember } from "./actions";
import { PriceForm, TeamForm } from "./_components/settings-forms";

export const metadata = { title: "Einstellungen" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const admin = await requireAdmin();
  const [settings, team] = await Promise.all([
    getShopSettings(),
    db.user.findMany({ where: { role: { in: ["ADMIN", "STAFF"] } }, orderBy: { email: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl">Einstellungen</h1>
      <section className="card flex flex-col gap-4">
        <h2 className="text-lg">Preise und Schuljahr</h2>
        <PriceForm
          initial={{
            tiers: parsePriceTiers(settings.priceTiers),
            shippingAmount: settings.shippingAmount,
            freeShippingAt: settings.freeShippingAt,
            minQuantity: settings.minQuantity,
            vatBasisPoints: settings.vatBasisPoints,
            defaultPlanStart: dateInputValue(settings.defaultPlanStart),
            defaultPlanEnd: dateInputValue(settings.defaultPlanEnd),
          }}
        />
      </section>
      <section className="card flex flex-col gap-4">
        <h2 className="text-lg">Team</h2>
        <ul className="flex flex-col gap-1 text-sm">
          {team.map((member) => (
            <li key={member.id} className="flex items-center justify-between gap-3 border-b border-line py-1">
              <span>
                {member.email} <span className="text-muted">· {member.role === "ADMIN" ? "Admin" : "Mitarbeiter"}</span>
              </span>
              {member.id !== admin.id && (
                <form action={removeTeamMember.bind(null, member.id)}>
                  <ConfirmSubmit question={`Panel-Zugriff für ${member.email} entfernen?`} className="text-xs text-muted hover:text-red-700">
                    Zugriff entfernen
                  </ConfirmSubmit>
                </form>
              )}
            </li>
          ))}
        </ul>
        <TeamForm />
      </section>
    </div>
  );
}
