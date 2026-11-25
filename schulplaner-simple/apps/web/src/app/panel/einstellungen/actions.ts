"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDateInput } from "@/lib/format";
import { PriceTiersSchema } from "@/lib/pricing";
import { requireAdmin } from "@/server/access";
import { db } from "@/server/db";

export type PanelFormState = { error?: string; ok?: string } | undefined;

/** "8,90" or "8.90" → 890 cents; null for anything else. */
function euroToCents(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim().replace(/\s|€/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  return Math.round(Number(text) * 100);
}

function intOrNull(value: FormDataEntryValue | null): number | null {
  const text = String(value ?? "").trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

export async function savePrices(_state: PanelFormState, formData: FormData): Promise<PanelFormState> {
  await requireAdmin();
  const mins = formData.getAll("tierMin");
  const amounts = formData.getAll("tierPrice");
  const tiers = [];
  for (let index = 0; index < mins.length; index++) {
    const min = intOrNull(mins[index] ?? null);
    const price = euroToCents(amounts[index] ?? null);
    if (min === null && !String(amounts[index] ?? "").trim()) continue;
    if (min === null || min < 1 || price === null) {
      return { error: `Staffel ${index + 1}: Bitte Menge (ab 1) und Preis (z. B. 8,90) angeben.` };
    }
    tiers.push({ minQuantity: min, unitAmount: price });
  }
  const parsedTiers = PriceTiersSchema.safeParse(tiers);
  if (!parsedTiers.success) {
    return { error: parsedTiers.error.issues[0]?.message ?? "Mindestens eine Preisstaffel angeben." };
  }

  const shippingAmount = euroToCents(formData.get("shipping"));
  const minQuantity = intOrNull(formData.get("minQuantity"));
  const freeShippingRaw = String(formData.get("freeShippingAt") ?? "").trim();
  const freeShippingAt = freeShippingRaw ? intOrNull(freeShippingRaw) : null;
  const vat = z.coerce.number().min(0).max(30).safeParse(String(formData.get("vat") ?? "").replace(",", "."));
  if (shippingAmount === null) return { error: "Versand: Bitte einen Betrag angeben (z. B. 14,90)." };
  if (!minQuantity || minQuantity < 1) return { error: "Mindestmenge: Bitte eine Zahl ab 1 angeben." };
  if (freeShippingRaw && !freeShippingAt) return { error: "Versandkostenfrei ab: Bitte eine Zahl angeben oder leer lassen." };
  if (!vat.success) return { error: "MwSt.: Bitte einen Prozentsatz zwischen 0 und 30 angeben." };
  if (parsedTiers.data[0]!.minQuantity > minQuantity) {
    return { error: "Die erste Preisstaffel muss bei der Mindestmenge oder darunter beginnen." };
  }

  const defaultPlanStart = parseDateInput(String(formData.get("defaultPlanStart") ?? ""));
  const defaultPlanEnd = parseDateInput(String(formData.get("defaultPlanEnd") ?? ""));

  await db.shopSettings.update({
    where: { id: "default" },
    data: {
      priceTiers: parsedTiers.data,
      shippingAmount,
      freeShippingAt,
      minQuantity,
      vatBasisPoints: Math.round(vat.data * 100),
      defaultPlanStart,
      defaultPlanEnd,
    },
  });
  revalidatePath("/panel/einstellungen");
  revalidatePath("/");
  return { ok: "Einstellungen gespeichert. Sie gelten für neue Bestellungen." };
}

export async function addTeamMember(_state: PanelFormState, formData: FormData): Promise<PanelFormState> {
  await requireAdmin();
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  const role = z.enum(["STAFF", "ADMIN"]).safeParse(formData.get("role"));
  if (!email.success) return { error: "Bitte eine gültige E-Mail-Adresse angeben." };
  if (!role.success) return { error: "Bitte eine Rolle wählen." };
  await db.user.upsert({
    where: { email: email.data },
    create: { email: email.data, role: role.data },
    update: { role: role.data },
  });
  revalidatePath("/panel/einstellungen");
  return { ok: `${email.data} hat jetzt Zugriff auf das Panel. Anmeldung per E-Mail-Link.` };
}

export async function removeTeamMember(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return;
  await db.user.update({ where: { id: userId }, data: { role: "USER" } });
  revalidatePath("/panel/einstellungen");
}
