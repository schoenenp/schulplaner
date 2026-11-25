"use server";

import { revalidatePath } from "next/cache";
import { uploadStorageFiles } from "books-storage";
import { z } from "zod";
import { requireStaff } from "@/server/access";
import { db } from "@/server/db";
import {
  MAX_MODULE_BYTES,
  MODULE_KINDS,
  inspectModulePdf,
  renderThumbnail,
  type ModuleKind,
} from "@/server/modules";
import { getShopSettings } from "@/server/settings";

export type PanelFormState = { error?: string; ok?: string } | undefined;

const UploadSchema = z.object({
  name: z.string().trim().min(1, "Bitte einen Namen eingeben.").max(120),
  description: z
    .string()
    .trim()
    .max(300)
    .transform((value) => value || null),
  kind: z.enum(["umschlag", "wochenplaner", "inhalt"]),
});

function refresh() {
  revalidatePath("/panel/module");
  revalidatePath("/panel/planer");
  revalidatePath("/panel");
}

export async function uploadModule(_state: PanelFormState, formData: FormData): Promise<PanelFormState> {
  const staff = await requireStaff();
  const parsed = UploadSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    kind: formData.get("kind"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Bitte eine PDF-Datei auswählen." };
  if (file.size > MAX_MODULE_BYTES) return { error: "Die Datei ist größer als 50 MB." };

  const kind: ModuleKind = parsed.data.kind;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspection = await inspectModulePdf(bytes, kind);
  if (!inspection.ok) return { error: inspection.error };

  const type = await db.moduleType.findUnique({ where: { name: kind } });
  if (!type) return { error: "Modultypen fehlen. Bitte `bun run db:seed` ausführen." };

  const thumbnail = await renderThumbnail(bytes);
  const [stored, storedThumbnail] = await uploadStorageFiles([
    { data: bytes, name: file.name },
    ...(thumbnail ? [{ data: thumbnail, name: "thumbnail.jpg" }] : []),
  ]);
  if (!stored) return { error: "Upload fehlgeschlagen." };

  const offer = kind === "umschlag" && formData.get("offer") === "on";
  const lastCover = await db.module.findFirst({
    where: { part: "COVER" },
    orderBy: { sortIdx: "desc" },
    select: { sortIdx: true },
  });
  await db.module.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      typeId: type.id,
      part: MODULE_KINDS[kind].part,
      visible: offer ? "PUBLIC" : "PRIVATE",
      sortIdx: (lastCover?.sortIdx ?? 0) + 1,
      thumbnailSrc: storedThumbnail?.src ?? null,
      createdById: staff.id,
      files: {
        create: {
          name: file.name,
          src: stored.src,
          size: stored.size,
          type: "PDF",
          pageCount: inspection.pageCount,
        },
      },
    },
  });
  refresh();
  return {
    ok: [`„${parsed.data.name}“ hochgeladen (${inspection.pageCount} Seiten).`, ...inspection.notes].join(" "),
  };
}

export async function setCoverOffered(moduleId: string, offered: boolean) {
  await requireStaff();
  await db.module.updateMany({
    where: { id: moduleId, part: "COVER", deletedAt: null },
    data: { visible: offered ? "PUBLIC" : "PRIVATE" },
  });
  refresh();
}

export async function moveCover(moduleId: string, direction: -1 | 1) {
  await requireStaff();
  const covers = await db.module.findMany({
    where: { part: "COVER", deletedAt: null },
    orderBy: [{ sortIdx: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = covers.findIndex((cover) => cover.id === moduleId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= covers.length) return;
  [covers[index], covers[target]] = [covers[target]!, covers[index]!];
  await db.$transaction(
    covers.map((cover, sortIdx) => db.module.update({ where: { id: cover.id }, data: { sortIdx } })),
  );
  refresh();
}

/**
 * Archived modules disappear from every choice. Orders keep printing them,
 * because their frozen planners reference the module rows directly.
 */
export async function archiveModule(moduleId: string): Promise<PanelFormState> {
  await requireStaff();
  const settings = await getShopSettings();
  if (settings.templateBookId) {
    const used = await db.bookModule.findFirst({
      where: { bookId: settings.templateBookId, moduleId },
      select: { id: true },
    });
    if (used) return { error: "Das Modul ist Teil des Standardplaners. Bitte zuerst dort entfernen." };
  }
  await db.module.update({
    where: { id: moduleId },
    data: { deletedAt: new Date(), visible: "PRIVATE" },
  });
  refresh();
  return { ok: "Archiviert." };
}
