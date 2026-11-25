"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ORDER_FIELD_LABELS, OrderFormSchema } from "@/lib/address";
import {
  CustomDateSchema,
  PlannerInfoSchema,
  customDateProblem,
  firstIssue,
} from "@/lib/planner-input";
import { requireUser } from "@/server/access";
import { db } from "@/server/db";
import { OrderRejectedError, placeOrder } from "@/server/orders";
import {
  PlannerUnavailableError,
  createPlannerFromTemplate,
  findOwnPlanner,
  setPlannerCover,
} from "@/server/planner";

export type FormState = { error?: string; ok?: string } | undefined;

async function ownPlannerOrThrow(bookId: string) {
  const user = await requireUser(`/planer/${bookId}`);
  const planner = await findOwnPlanner(user.id, bookId);
  if (!planner) throw new Error("Planer nicht gefunden.");
  return { user, planner };
}

export async function createPlanner(_state?: FormState): Promise<FormState> {
  const user = await requireUser("/planer");
  let id: string;
  try {
    ({ id } = await createPlannerFromTemplate(user.id));
  } catch (error) {
    if (error instanceof PlannerUnavailableError) return { error: error.message };
    throw error;
  }
  redirect(`/planer/${id}`);
}

export async function savePlannerInfo(
  bookId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { planner } = await ownPlannerOrThrow(bookId);
  const parsed = PlannerInfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const { bookTitle, subTitle, region, country, planStart, planEnd } = parsed.data;
  await db.book.update({
    where: { id: planner.id },
    data: { bookTitle, subTitle, region, country, planStart, planEnd, name: bookTitle },
  });
  revalidatePath(`/planer/${bookId}`);
  return { ok: "Planerinfo gespeichert." };
}

export async function addCustomDate(
  bookId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const { planner } = await ownPlannerOrThrow(bookId);
  const parsed = CustomDateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error) };
  const problem = customDateProblem(
    parsed.data.date,
    planner,
    planner.customDates.map((entry) => entry.date),
  );
  if (problem) return { error: problem };
  await db.$transaction([
    db.customDate.create({ data: { ...parsed.data, bookId: planner.id } }),
    db.book.update({ where: { id: planner.id }, data: { updatedAt: new Date() } }),
  ]);
  revalidatePath(`/planer/${bookId}`);
  return { ok: "Termin hinzugefügt." };
}

export async function removeCustomDate(bookId: string, dateId: string) {
  const { planner } = await ownPlannerOrThrow(bookId);
  await db.customDate.deleteMany({ where: { id: dateId, bookId: planner.id } });
  revalidatePath(`/planer/${bookId}`);
}

export async function chooseCover(bookId: string, coverModuleId: string | null) {
  const { planner } = await ownPlannerOrThrow(bookId);
  await setPlannerCover(planner.id, coverModuleId);
  revalidatePath(`/planer/${bookId}`);
}

export async function deletePlanner(bookId: string) {
  const { planner } = await ownPlannerOrThrow(bookId);
  await db.book.update({ where: { id: planner.id }, data: { deletedAt: new Date() } });
  revalidatePath("/planer");
  redirect("/planer");
}

/** Nested address fields arrive as billing.street, shipping.city, … */
function orderFormValues(formData: FormData) {
  const values: Record<string, unknown> = {};
  const billing: Record<string, unknown> = {};
  const shipping: Record<string, unknown> = {};
  for (const [key, value] of formData) {
    if (key.startsWith("billing.")) billing[key.slice(8)] = value;
    else if (key.startsWith("shipping.")) shipping[key.slice(9)] = value;
    else values[key] = value;
  }
  values.billing = billing;
  values.shipping = formData.get("separateShipping") === "on" ? shipping : billing;
  return values;
}

export async function submitOrder(
  bookId: string,
  _state: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requireUser(`/planer/${bookId}/bestellen`);
  const parsed = OrderFormSchema.safeParse(orderFormValues(formData));
  if (!parsed.success) return { error: firstIssue(parsed.error, ORDER_FIELD_LABELS) };
  let orderId: number;
  try {
    orderId = await placeOrder(user.id, bookId, parsed.data);
  } catch (error) {
    if (error instanceof OrderRejectedError || error instanceof PlannerUnavailableError) {
      return { error: error.message };
    }
    throw error;
  }
  revalidatePath("/bestellungen");
  redirect(`/bestellungen/${orderId}?neu=1`);
}

export async function uploadOwnCover(bookId: string, _state: FormState, data: FormData): Promise<FormState> {
  const { user, planner } = await ownPlannerOrThrow(bookId);
  const file = data.get("file");
  if (!(file instanceof File) || !file.size) return { error: "Bitte eine Datei auswählen." };
  if (file.size > 20 * 1024 * 1024) return { error: "Deine Datei darf maximal 20 MB groß sein." };
  const { buildCustomCover } = await import("@/lib/custom-cover");
  const { renderThumbnail } = await import("@/server/modules");
  const { uploadStorageFiles, readStorageAsset } = await import("books-storage");
  const { PDFDocument } = await import("pdf-lib");
  const { getTemplate } = await import("@/server/settings");
  const template = await getTemplate();
  const base = template?.modules.find(e => e.module.part === "COVER")?.module.files[0];
  if (!base) return { error: "Der Standardumschlag fehlt noch." };
  const response = await readStorageAsset(base.src);
  if (!response.ok) return { error: "Der Standardumschlag konnte nicht geladen werden." };
  const doc = await PDFDocument.load(await response.arrayBuffer());
  const {width,height} = doc.getPage(0).getSize();
  let bytes: Uint8Array;
  try { bytes = await buildCustomCover(new Uint8Array(await file.arrayBuffer()),file.type,width,height); }
  catch(error) { return { error: error instanceof Error && /PDF braucht|PDF-Seiten|Bitte ein/.test(error.message) ? error.message : "Die Datei ist nicht lesbar. Bitte ein gültiges JPG, PNG oder PDF verwenden." }; }
  const thumbnail = await renderThumbnail(bytes);
  if (!thumbnail) return { error: "Die Vorschau konnte nicht erstellt werden. Bitte die Datei prüfen." };
  const type = await db.moduleType.findUniqueOrThrow({where:{name:"umschlag"}});
  const [stored, thumb] = await uploadStorageFiles([{data:bytes,name:"eigener-umschlag.pdf"},{data:thumbnail,name:"umschlag.jpg"}]);
  if (!stored || !thumb) return { error: "Der Upload ist fehlgeschlagen. Bitte erneut versuchen." };
  await db.$transaction(async tx => {
    const module = await tx.module.create({data:{name:`Eigener Umschlag · ${file.name.slice(0,90)}`,typeId:type.id,part:"COVER",visible:"PRIVATE",createdById:user.id,thumbnailSrc:thumb.src,files:{create:{name:file.name,src:stored.src,size:stored.size,type:"PDF",pageCount:4}}}});
    await tx.bookModule.deleteMany({where:{bookId:planner.id,module:{part:"COVER"}}});
    await tx.bookModule.create({data:{bookId:planner.id,moduleId:module.id,idx:0,colorCode:"COLOR"}});
    await tx.book.update({where:{id:planner.id},data:{updatedAt:new Date()}});
  });
  revalidatePath(`/planer/${bookId}`);
  return { ok: "Dein eigener Umschlag ist ausgewählt. Prüfe ihn gleich in der Vorschau." };
}
