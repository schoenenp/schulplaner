"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { brand } from "@/brand";
import { requireStaff } from "@/server/access";
import { db } from "@/server/db";
import { getShopSettings, getTemplate } from "@/server/settings";

export type PanelFormState = { error?: string; ok?: string } | undefined;

/**
 * The standard planner is a template Book. Its cover sits at idx 0, content
 * modules follow from idx 1 in print order. School planners pick up content
 * changes on their next preview or order; placed orders are frozen.
 */

function refresh() {
  revalidatePath("/panel/planer");
  revalidatePath("/panel/module");
  revalidatePath("/panel");
}

async function requireTemplate() {
  const template = await getTemplate();
  if (!template) throw new Error("Kein Standardplaner angelegt.");
  return template;
}

export async function createTemplate() {
  await requireStaff();
  const settings = await getShopSettings();
  if (settings.templateBookId) return;
  const template = await db.book.create({
    data: { name: "Standardplaner", bookTitle: "Mein Schuljahr", isTemplate: true, format: brand.format },
  });
  await db.shopSettings.update({ where: { id: "default" }, data: { templateBookId: template.id } });
  refresh();
}

const InfoSchema = z.object({
  bookTitle: z.string().trim().min(1, "Bitte einen Titel eingeben.").max(60),
  format: z.enum(["A5", "A4"]),
});

export async function saveTemplateInfo(_state: PanelFormState, formData: FormData): Promise<PanelFormState> {
  await requireStaff();
  const template = await requireTemplate();
  const parsed = InfoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  await db.book.update({ where: { id: template.id }, data: parsed.data });
  refresh();
  return { ok: "Gespeichert." };
}

export async function setTemplateCover(_state: PanelFormState, formData: FormData): Promise<PanelFormState> {
  await requireStaff();
  const template = await requireTemplate();
  const moduleId = String(formData.get("moduleId") ?? "");
  const cover = await db.module.findFirst({ where: { id: moduleId, part: "COVER", deletedAt: null } });
  if (!cover) return { error: "Bitte einen Umschlag wählen." };
  await db.$transaction([
    db.bookModule.deleteMany({ where: { bookId: template.id, module: { part: "COVER" } } }),
    db.bookModule.create({ data: { bookId: template.id, moduleId, idx: 0, colorCode: "COLOR" } }),
  ]);
  refresh();
  return { ok: `Standardumschlag: ${cover.name}` };
}

async function renumberContent(orderedIds: string[]) {
  await db.$transaction(
    orderedIds.map((id, index) => db.bookModule.update({ where: { id }, data: { idx: index + 1 } })),
  );
}

export async function addTemplateModule(_state: PanelFormState, formData: FormData): Promise<PanelFormState> {
  await requireStaff();
  const template = await requireTemplate();
  const moduleId = String(formData.get("moduleId") ?? "");
  const module = await db.module.findFirst({
    where: { id: moduleId, part: { not: "COVER" }, deletedAt: null },
  });
  if (!module) return { error: "Bitte ein Modul wählen." };
  if (template.modules.some((entry) => entry.moduleId === moduleId)) {
    return { error: "Dieses Modul ist schon enthalten." };
  }
  const lastIdx = Math.max(0, ...template.modules.map((entry) => entry.idx));
  await db.bookModule.create({
    data: { bookId: template.id, moduleId, idx: lastIdx + 1, colorCode: "COLOR" },
  });
  refresh();
  return { ok: `„${module.name}“ hinzugefügt.` };
}

export async function removeTemplateModule(bookModuleId: string) {
  await requireStaff();
  const template = await requireTemplate();
  await db.bookModule.deleteMany({
    where: { id: bookModuleId, bookId: template.id, module: { part: { not: "COVER" } } },
  });
  const remaining = template.modules
    .filter((entry) => entry.module.part !== "COVER" && entry.id !== bookModuleId)
    .map((entry) => entry.id);
  await renumberContent(remaining);
  refresh();
}

export async function moveTemplateModule(bookModuleId: string, direction: -1 | 1) {
  await requireStaff();
  const template = await requireTemplate();
  const content = template.modules
    .filter((entry) => entry.module.part !== "COVER")
    .sort((a, b) => a.idx - b.idx)
    .map((entry) => entry.id);
  const index = content.indexOf(bookModuleId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= content.length) return;
  [content[index], content[target]] = [content[target]!, content[index]!];
  await renumberContent(content);
  refresh();
}
