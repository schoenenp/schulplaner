'use client'

import TooltipFader from "@/app/_components/tooltip-fader";
import Link from "next/link";
import { AlertTriangle, CircleQuestionMark, UploadCloud, XIcon } from "lucide-react";
import FileUpload from "../file-upload";
import { api } from "@/trpc/react";
import { useState } from "react";
import { validatePDFUpload } from "@/util/pdf/functions";
import { uploadModuleFiles } from "@/util/upload/client";
import type { BookPart } from "@prisma/client";
import { getPageRules } from "@/util/book/functions";
import LoadingSpinner from "@/app/_components/loading-spinner";

export default function UserModules({
  bookId,
  existingTips,
  onCreated,
}: {
  bookId: string;
  existingTips: string[];
  onCreated?: () => void;
}) {
  const [moduleFormError, setModuleFormError] = useState<string | undefined>();
  const [isUploading, setIsUploading] = useState(false);

  const [moduleFormState, setModuleFormState] = useState({
    name: "",
    type: "sonstige",
    moduleFile: null as File | null,
  });

  const { data: customTypeItems } = api.type.getCustomTypes.useQuery();

  const utils = api.useUtils();
  const { mutate: createModule, isPending } = api.module.create.useMutation({
    onSuccess: async () => {
      await utils.module.getUserModules.invalidate();
      await utils.config.init.invalidate({ bookId });
      setModuleFormError(undefined);
      setModuleFormState({
        name: "",
        type: "sonstige",
        moduleFile: null,
      });
      onCreated?.();
    },
  });

  function handleCloseError() {
    setModuleFormError(undefined);
    setModuleFormState((prev) => ({
      ...prev,
      moduleFile: null,
    }));
  }

  async function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    event.stopPropagation();

    if (!moduleFormState.moduleFile || isUploading) {
      return;
    }

    const isImageBasedCover =
      moduleFormState.type.toLocaleLowerCase() === "umschlag" &&
      moduleFormState.moduleFile.type.startsWith("image/");

    if (!isImageBasedCover) {
      const { valid, message } = await validatePDFUpload(
        await moduleFormState.moduleFile.arrayBuffer(),
        moduleFormState.type.toLocaleUpperCase() as BookPart,
      );

      if (!valid) {
        setModuleFormError(message);
        return;
      }
    }

    setIsUploading(true);
    try {
      const { file: uploadedFile, thumbnail: uploadedThumbnail } =
        await uploadModuleFiles({
          type: moduleFormState.type,
          file: moduleFormState.moduleFile,
        });

      if (!uploadedFile) {
        setModuleFormError("Upload fehlgeschlagen");
        return;
      }

      createModule({
        name: moduleFormState.name,
        type: moduleFormState.type,
        uploadedFile,
        uploadedThumbnail,
      });
    } catch (error) {
      setModuleFormError(
        error instanceof Error ? error.message : "Upload fehlgeschlagen",
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <section className="content-card p-4 lg:p-5">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <p className="text-info-800 text-sm uppercase tracking-[0.18em]">
            Eigene Inhalte
          </p>
          <h3 className="text-3xl font-bold text-pirrot-blue-900">
            Eigene Module und Cover hochladen
          </h3>
          <p className="text-info-800 max-w-3xl">
            Laden Sie eigene Inhalte hoch und ordnen Sie diese direkt dem
            passenden Buchteil zu. Fuer `Umschlag` reicht auch ein einzelnes
            Bild, das automatisch in die Cover-Vorlage eingesetzt wird.
          </p>
        </div>

        {moduleFormError || isPending || isUploading ? (
          <div
            onClick={handleCloseError}
            className="content-card relative flex aspect-video w-full flex-col items-center justify-center gap-3 p-4 text-center lg:py-16"
          >
            {moduleFormError ? (
              <button
                onClick={handleCloseError}
                type="button"
                className="btn-soft absolute top-3 right-3 p-2"
              >
                <XIcon className="size-5" />
              </button>
            ) : null}
            {moduleFormError ? <p className="max-w-xl">{moduleFormError}</p> : null}
            {isPending || isUploading ? <LoadingSpinner /> : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="content-card flex flex-col gap-4 p-4">
              <div className="flex flex-col gap-2">
                <h4 className="text-2xl font-bold">Neues Modul erstellen</h4>
                <p className="text-info-800 text-sm">
                  Hängen Sie eine PDF-Datei an oder laden Sie fuer einen
                  benutzerdefinierten Umschlag nur ein Bild hoch.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="field-shell p-3">
                  <FileUpload
                    fieldName="custom-upload"
                    accept={
                      moduleFormState.type.toLocaleLowerCase() === "umschlag"
                        ? [
                            "application/pdf",
                            "image/png",
                            "image/jpeg",
                            "image/webp",
                          ]
                        : ["application/pdf"]
                    }
                    resetFile={() =>
                      setModuleFormState((prev) => ({
                        ...prev,
                        moduleFile: null,
                      }))
                    }
                    onPickedFile={(file) =>
                      setModuleFormState((prev) => ({
                        ...prev,
                        moduleFile: file,
                      }))
                    }
                  />
                </div>

                <form
                  onSubmit={handleFormSubmit}
                  className="field-shell flex flex-col gap-4 p-4"
                >
                  <div className="flex flex-col gap-1">
                    <label className="form-label">Modulname</label>
                    <input
                      placeholder="Beispiel Titel"
                      className="field-shell w-full px-3 py-2.5"
                      value={moduleFormState.name}
                      onChange={(event) =>
                        setModuleFormState((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="form-label">Teil des Buches</label>
                    <select
                      className="field-shell w-full px-3 py-2.5"
                      value={moduleFormState.type}
                      onChange={(event) =>
                        setModuleFormState((prev) => ({
                          ...prev,
                          type: event.target.value,
                        }))
                      }
                    >
                      {customTypeItems?.map((typeItem) => (
                        <option
                          id={typeItem.name}
                          key={typeItem.id}
                          value={typeItem.name}
                        >
                          {typeItem.name} |{" "}
                          {getPageRules({
                            min: typeItem.min,
                            max: typeItem.max,
                          })}{" "}
                          Seiten
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    disabled={isPending || isUploading}
                    type="submit"
                    className="btn-solid mt-auto px-4 py-2 disabled:opacity-30"
                  >
                    Modul speichern
                  </button>
                </form>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="field-shell flex flex-col gap-3 p-4">
                <div className="rounded-full bg-pirrot-red-100 p-2 text-pirrot-red-500 w-fit">
                  <UploadCloud className="size-5" />
                </div>
                <h4 className="text-lg font-bold">Nach dem Speichern</h4>
                <p className="text-info-800 text-sm">
                  Das Modul taucht direkt in der normalen Modulauswahl auf,
                  passend zum gewählten Buchteil. Bearbeitung und Freigabe
                  finden Sie weiterhin im{" "}
                  <Link
                    href="/dashboard?view=module"
                    className="font-medium text-pirrot-red-500"
                  >
                    Dashboard
                  </Link>
                  .
                </p>
              </div>

              <div className="field-shell flex flex-col gap-3 p-4">
                <h4 className="flex items-center gap-2 text-lg font-bold">
                  <AlertTriangle className="size-5 text-pirrot-red-500" />
                  Hinweis
                </h4>
                <p className="text-info-800 text-sm">
                  Erstellte Module sind zunächst privat und nur für Sie sichtbar.
                  Im Nutzerbereich können Sie diese später öffentlich machen,
                  falls das gewünscht ist.
                </p>
              </div>

              <div className="field-shell flex flex-col gap-3 p-4">
                <h4 className="flex items-center gap-2 text-lg font-bold">
                  <CircleQuestionMark className="size-5 text-pirrot-blue-600" />
                  Tooltips
                </h4>
                <p className="text-info-800 text-sm">
                  Schnelle Hinweise für PDF-Aufbereitung und Druckdaten. Mehr
                  Details finden Sie in der{" "}
                  <Link
                    href="/module-docs#tooltips"
                    className="font-medium text-pirrot-red-500"
                  >
                    Dokumentation
                  </Link>
                  .
                </p>
                <TooltipFader tooltips={existingTips} />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
