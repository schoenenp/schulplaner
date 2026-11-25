import { notFound } from "next/navigation";
import { brand } from "@/brand";
import { parseAddress } from "@/lib/address";
import { germanDate } from "@/lib/format";
import { requireUser } from "@/server/access";
import { db } from "@/server/db";
import { findOwnPlanner, resolvePlannerCover } from "@/server/planner";
import { getPriceList, getTemplate } from "@/server/settings";
import { OrderForm } from "../../_components/order-form";

export const metadata = { title: "Bestellen" };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/planer/${id}/bestellen`);
  const [planner, prices, profile, template] = await Promise.all([
    findOwnPlanner(user.id, id),
    getPriceList(),
    db.user.findUnique({
      where: { id: user.id },
      select: { email: true, schoolName: true, phone: true, billingAddress: true, shipAddress: true },
    }),
    getTemplate(),
  ]);
  if (!planner) notFound();
  const templateCover = template?.modules.find((entry) => entry.module.part === "COVER");
  const cover = resolvePlannerCover(planner, templateCover)?.module;
  const billing = parseAddress(profile?.billingAddress);
  const shipping = parseAddress(profile?.shipAddress);

  return (
      <OrderForm
        plannerSummary={`${planner.bookTitle} · ${cover?.name ?? "Standardumschlag"} · ${germanDate(planner.planStart)} – ${germanDate(planner.planEnd)}`}
        bookId={planner.id}
        prices={prices}
        legal={brand.legal.map(([label, href]) => ({ label, href }))}
        defaults={{
          email: profile?.email ?? "",
          schoolName: profile?.schoolName ?? planner.subTitle ?? "",
          phone: profile?.phone ?? "",
          billing,
          shipping,
          separateShipping:
            Boolean(billing && shipping) && JSON.stringify(billing) !== JSON.stringify(shipping),
        }}
      />
  );
}
