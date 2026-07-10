"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FileType, Visibility } from "@prisma/client";
import {
  CheckCircleIcon,
  ClipboardDocumentIcon,
  DocumentTextIcon,
  EyeIcon,
  SwatchIcon,
} from "@heroicons/react/16/solid";

import FileUpload from "@/app/_components/file-upload";
import PreviewImage from "./image-preview";
import { api } from "@/trpc/react";
import {
  extractTextFields,
  getPageRules,
  urlToFile,
} from "@/server/util/pdf/functions";
import { pickModulePdfFile } from "@/util/module-files";
import {
  MAX_UPLOAD_FILE_BYTES,
  uploadLimitMessage,
} from "@/util/upload-limits";

type FileState = {
  data?: File;
  hasChanged: boolean;
  src?: string;
  modifiedPdf?: Uint8Array;
};

export type TagItem = {
  id: number;
  name: string;
  output: string | null;
};

type TagProps = TagItem & {
  onClick?: (tag: TagItem) => void;
  variant?: "selected" | "available";
};

type ModuleData = {
  id: string;
  type: { name: string };
  theme: string | null;
  name: string | null;
  visible: Visibility;
  files: {
    id: string;
    name: string | null;
    type: FileType;
    size: number;
    src: string;
  }[];
};

type PageData = {
  modules: ModuleData[];
  types: { id: string; name: string; minPages: number; maxPages: number }[];
  tags: { id: number; name: string; output: string | null }[];
};

type UploadedModuleFile = {
  name?: string | null;
  src: string;
  type: "PDF" | "IMAGE_PNG" | "IMAGE_JPEG";
  size: number;
};

async function uploadChangedModuleFiles(input: {
  type: string;
  file?: File;
  thumbnail?: File;
}): Promise<{
  file?: UploadedModuleFile;
  thumbnail?: UploadedModuleFile;
}> {
  if (!input.file && !input.thumbnail) return {};

  for (const file of [input.file, input.thumbnail]) {
    if (file && file.size > MAX_UPLOAD_FILE_BYTES) {
      throw new Error(uploadLimitMessage(file.name));
    }
  }

  const formData = new FormData();
  formData.set("type", input.type);

  if (input.file) {
    formData.set("file", input.file);
  }

  if (input.thumbnail) {
    formData.set("thumbnail", input.thumbnail);
  }

  const response = await fetch("/api/module-files", {
    method: "POST",
    body: formData,
  });

  const responseData = (await response.json()) as {
    message?: string;
    file?: UploadedModuleFile;
    thumbnail?: UploadedModuleFile;
  };

  if (!response.ok) {
    throw new Error(responseData.message ?? "File upload failed");
  }

  return responseData;
}

function Tag({ id, name, output, onClick, variant = "available" }: TagProps) {
  const isSelected = variant === "selected";

  return (
    <button
      type="button"
      onClick={() => onClick?.({ id, name, output })}
      className={[
        "rounded-lg border px-3 py-2 text-left text-sm transition",
        isSelected
          ? "border-pirrot-blue-300/25 bg-pirrot-blue-100 text-pirrot-blue-900 hover:border-pirrot-red-300/40 hover:bg-pirrot-red-100"
          : "border-pirrot-blue-200/12 bg-pirrot-blue-950/70 text-pirrot-blue-100 hover:border-pirrot-blue-300/30 hover:bg-pirrot-blue-900/75",
      ].join(" ")}
    >
      <span className="block font-semibold">{name}</span>
      <span className="mt-1 block font-mono text-[11px] opacity-75">
        {output ? `//${output}` : "//no output"}
      </span>
    </button>
  );
}

async function processPdfFile(file: File, availableTags: TagItem[]) {
  if (file.type !== "application/pdf") {
    return { file, fields: [], modifiedPdf: undefined };
  }

  try {
    const { fields, modifiedPdf } = await extractTextFields(
      file,
      availableTags,
    );
    return { file, fields, modifiedPdf };
  } catch {
    return { file, fields: [], modifiedPdf: undefined };
  }
}

function extractTagsFromFields(
  fieldNames: TagItem[],
  availableTags: TagItem[],
): TagItem[] {
  const foundTags = fieldNames
    .map((fieldItem) =>
      availableTags.find((tag) => tag.name === fieldItem.name),
    )
    .filter((tag): tag is TagItem => tag !== undefined);

  return foundTags.filter(
    (tag, index, array) =>
      array.findIndex((entry) => entry.id === tag.id) === index,
  );
}

function useModuleFormState(moduleId: string | undefined, pageData: PageData) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [theme, setTheme] = useState("");
  const [visible, setVisible] = useState<Visibility>("SHARED");
  const [file, setFile] = useState<FileState>({ hasChanged: false });
  const [thumbnail, setThumbnail] = useState<FileState>({ hasChanged: false });
  const [allowedTags, setAllowedTags] = useState<TagItem[]>([]);

  useEffect(() => {
    if (!moduleId) return;

    let isMounted = true;

    async function initialize() {
      const moduleItem = pageData.modules.find(
        (moduleEntry) => moduleEntry.id === moduleId,
      );
      if (!moduleItem) return;

      setName(moduleItem.name ?? "module");
      setType(moduleItem.type.name);
      setTheme(moduleItem.theme ?? "");
      setVisible(moduleItem.visible);

      const thumbData = moduleItem.files.find((fileEntry) =>
        fileEntry.name?.startsWith("thumb_"),
      );

      if (thumbData) {
        const thumbFile = await urlToFile(thumbData.src, thumbData.name ?? "");
        if (isMounted) {
          setThumbnail({
            data: thumbFile ?? undefined,
            src: thumbData.src,
            hasChanged: false,
          });
        }
      }

      const fileData = pickModulePdfFile(moduleItem.files);
      if (fileData) {
        const originalFile = await urlToFile(fileData.src, fileData.name ?? "");
        if (!originalFile || !isMounted) return;

        const {
          file: processedFile,
          fields,
          modifiedPdf,
        } = await processPdfFile(originalFile, pageData.tags);

        const extractedTags = fields
          .map((fieldItem) =>
            pageData.tags.find((tag) => tag.name === fieldItem.name),
          )
          .filter((tag): tag is TagItem => tag !== undefined);

        if (!isMounted) return;

        setAllowedTags(extractedTags);
        setFile({
          data: processedFile,
          src: fileData.src,
          hasChanged: false,
          modifiedPdf,
        });
      }
    }

    void initialize();

    return () => {
      isMounted = false;
    };
  }, [moduleId, pageData.modules, pageData.tags]);

  return {
    name,
    setName,
    type,
    setType,
    theme,
    setTheme,
    visible,
    setVisible,
    file,
    setFile,
    thumbnail,
    setThumbnail,
    allowedTags,
    setAllowedTags,
  };
}

export default function ModuleForm({ moduleId }: { moduleId?: string }) {
  const router = useRouter();
  const utils = api.useUtils();
  const [pageData] = api.module.initPage.useSuspenseQuery();

  const {
    name,
    setName,
    type,
    setType,
    theme,
    setTheme,
    visible,
    setVisible,
    file,
    setFile,
    thumbnail,
    setThumbnail,
    allowedTags,
    setAllowedTags,
  } = useModuleFormState(moduleId, pageData);

  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [showAvailableTags, setShowAvailableTags] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();

  const createModule = api.module.create.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.module.invalidate(),
        utils.type.getAll.invalidate(),
      ]);
      router.push("/dashboard/module");
    },
    onError: (error) => setSubmitError(error.message),
  });

  const updateModule = api.module.update.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.module.invalidate(),
        utils.type.getAll.invalidate(),
      ]);
      router.push("/dashboard/module");
    },
    onError: (error) => setSubmitError(error.message),
  });

  const selectedType = useMemo(() => {
    const normalizedType = type.trim().toLowerCase();
    return pageData.types.find((typeItem) => typeItem.name === normalizedType);
  }, [pageData.types, type]);

  const availableTags = useMemo(() => pageData.tags, [pageData.tags]);

  const handleTagToggle = useCallback(
    async (tag: TagItem, isRemoving: boolean) => {
      if (!file.data) return;

      const nextAllowedTags = isRemoving
        ? allowedTags.filter((entry) => entry.id !== tag.id)
        : [...allowedTags, tag];

      const { modifiedPdf } = await processPdfFile(file.data, nextAllowedTags);
      setAllowedTags(nextAllowedTags);
      setFile((current) => ({ ...current, modifiedPdf }));
    },
    [allowedTags, file.data, setAllowedTags, setFile],
  );

  const handlePickedFile = useCallback(
    async (pickedFile: File) => {
      setSubmitError(undefined);

      const {
        file: processedFile,
        fields,
        modifiedPdf,
      } = await processPdfFile(pickedFile, availableTags);

      setFile({
        data: processedFile,
        hasChanged: true,
        modifiedPdf,
      });

      setAllowedTags(extractTagsFromFields(fields, availableTags));
    },
    [availableTags, setAllowedTags, setFile],
  );

  const handlePickedThumb = useCallback(
    (thumbFile: File) => {
      setSubmitError(undefined);
      setThumbnail({ data: thumbFile, hasChanged: true });
    },
    [setThumbnail],
  );

  const handleResetFile = useCallback(() => {
    setAllowedTags([]);
    setFile({ data: undefined, hasChanged: false });
  }, [setAllowedTags, setFile]);

  const handleResetThumb = useCallback(() => {
    setThumbnail({ data: undefined, hasChanged: false });
  }, [setThumbnail]);

  const pdfFileUrl = useMemo(() => {
    if (file.modifiedPdf) {
      const blob = new Blob([file.modifiedPdf as BlobPart], {
        type: "application/pdf",
      });
      return URL.createObjectURL(blob);
    }

    if (file.data instanceof File) {
      return URL.createObjectURL(file.data);
    }

    return file.src;
  }, [file.data, file.modifiedPdf, file.src]);

  useEffect(() => {
    return () => {
      if (pdfFileUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(pdfFileUrl);
      }
    };
  }, [pdfFileUrl]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(undefined);

    try {
      const uploadedFiles = await uploadChangedModuleFiles({
        type,
        file: file.data && file.hasChanged ? file.data : undefined,
        thumbnail:
          thumbnail.data && thumbnail.hasChanged ? thumbnail.data : undefined,
      });

      if (moduleId) {
        await updateModule.mutateAsync({
          id: moduleId,
          name,
          type,
          theme: theme.trim() || undefined,
          visible,
          uploadedFile: uploadedFiles.file,
          uploadedThumbnail: uploadedFiles.thumbnail,
          tagIds: allowedTags.map((tag) => tag.id),
        });
        return;
      }

      await createModule.mutateAsync({
        name,
        type,
        theme: theme.trim() || undefined,
        visible,
        uploadedFile: uploadedFiles.file,
        uploadedThumbnail: uploadedFiles.thumbnail,
        tagIds: allowedTags.map((tag) => tag.id),
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "File upload failed",
      );
    }
  }

  const selectableTags = availableTags.filter(
    (tag) => !allowedTags.some((allowedTag) => allowedTag.id === tag.id),
  );

  const mutationPending = createModule.isPending || updateModule.isPending;

  const visibilityOptions = [
    { label: "Öffentlich", value: "PUBLIC" as Visibility },
    { label: "Geteilt", value: "SHARED" as Visibility },
    { label: "Privat", value: "PRIVATE" as Visibility },
  ];

  return (
    <div className="grid min-h-0 gap-5 xl:grid-cols-[minmax(20rem,28rem)_minmax(0,1fr)]">
      <div className="glass-card-soft min-h-0 overflow-hidden">
        <div className="flex h-full flex-col p-5 lg:p-6">
          <div className="border-b border-pirrot-blue-200/10 pb-5">
            <div className="badge-shell w-fit">Module workspace</div>
            <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">
              {moduleId ? "Bestehendes Modul pflegen" : "Neues Modul anlegen"}
            </h3>
            <p className="text-pirrot-blue-100/72 mt-3 text-sm leading-6">
              Formulardaten, Dateiupload und Vorschau sind in einer Ansicht
              gebündelt. PDF-Felder werden beim Hochladen direkt mit vorhandenen
              Variablen abgeglichen.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            className="mt-6 flex min-h-0 flex-1 flex-col gap-6"
          >
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-semibold text-pirrot-blue-100">
                  Modulname
                </label>
                <input
                  className="soft-input"
                  onChange={(event) => setName(event.target.value)}
                  value={name}
                  placeholder="z. B. Wochenplaner 01"
                />
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-semibold text-pirrot-blue-100">
                    Typ
                  </label>
                  <div className="relative">
                    <input
                      id="types"
                      autoComplete="off"
                      className="soft-input"
                      onBlur={() =>
                        setTimeout(() => setIsTypePickerOpen(false), 160)
                      }
                      onFocus={() => setIsTypePickerOpen(true)}
                      onChange={(event) => setType(event.target.value)}
                      value={type}
                      placeholder="wochenplaner"
                    />
                    {isTypePickerOpen ? (
                      <div className="glass-card absolute left-0 top-[calc(100%+0.5rem)] z-40 flex max-h-56 w-full flex-col gap-1 overflow-y-auto p-2">
                        {pageData.types
                          .filter((typeItem) =>
                            typeItem.name
                              .toLowerCase()
                              .includes(type.toLowerCase()),
                          )
                          .map((typeItem) => (
                            <button
                              key={typeItem.id}
                              type="button"
                              onClick={() => {
                                setType(typeItem.name);
                                setIsTypePickerOpen(false);
                              }}
                              className="field-shell flex items-start justify-between gap-3 p-3 text-left transition hover:border-pirrot-blue-300/30 hover:bg-pirrot-blue-900/75"
                            >
                              <span className="min-w-0 break-words font-semibold text-white">
                                {typeItem.name}
                              </span>
                              <span className="flex shrink-0 items-center gap-2 text-xs uppercase tracking-[0.08em] text-pirrot-blue-100/70">
                                <ClipboardDocumentIcon className="size-4 shrink-0" />
                                {getPageRules({
                                  min: typeItem.minPages,
                                  max: typeItem.maxPages,
                                })}
                              </span>
                            </button>
                          ))}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-semibold text-pirrot-blue-100">
                    Thema
                  </label>
                  <input
                    className="soft-input"
                    onChange={(event) => setTheme(event.target.value)}
                    value={theme}
                    placeholder="z. B. Schule, Ferien, Minimal"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-pirrot-blue-100">
                  Sichtbarkeit
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {visibilityOptions.map((option) => {
                    const isActive = visible === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => setVisible(option.value)}
                        className={[
                          "rounded-lg px-3 py-3 text-sm font-semibold transition",
                          isActive
                            ? "bg-pirrot-blue-500 text-white shadow-lg shadow-pirrot-blue-950/30"
                            : "field-shell text-pirrot-blue-100 hover:border-pirrot-blue-300/30 hover:bg-pirrot-blue-900/75",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {selectedType ? (
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="field-shell p-4">
                  <div className="flex items-center gap-2 text-pirrot-blue-100/75">
                    <DocumentTextIcon className="size-4" />
                    <span className="compact-label text-xs uppercase">
                      Seitenregel
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-white">
                    {getPageRules({
                      min: selectedType.minPages,
                      max: selectedType.maxPages,
                    })}
                  </p>
                </div>
                <div className="field-shell p-4">
                  <div className="flex items-center gap-2 text-pirrot-blue-100/75">
                    <SwatchIcon className="size-4" />
                    <span className="compact-label text-xs uppercase">
                      Thema
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-white">
                    {theme.trim() || "noch offen"}
                  </p>
                </div>
                <div className="field-shell p-4">
                  <div className="flex items-center gap-2 text-pirrot-blue-100/75">
                    <EyeIcon className="size-4" />
                    <span className="compact-label text-xs uppercase">
                      Tags
                    </span>
                  </div>
                  <p className="mt-3 text-lg font-bold text-white">
                    {allowedTags.length}
                  </p>
                </div>
              </div>
            ) : null}

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="field-shell min-h-52 p-1">
                {file.data ? (
                  <div
                    className="group relative flex size-full cursor-pointer flex-col items-center justify-center rounded-lg border border-pirrot-blue-200/10 bg-pirrot-blue-950/55 px-4 text-center text-pirrot-blue-100 transition hover:border-pirrot-blue-300/30 hover:bg-pirrot-blue-900/70"
                    onClick={handleResetFile}
                  >
                    <span className="compact-label absolute right-3 top-3 hidden text-xs uppercase text-pirrot-red-200 group-hover:block">
                      Reset
                    </span>
                    <CheckCircleIcon className="size-10 text-success-300" />
                    <p className="mt-3 max-w-full break-words font-semibold">
                      {file.data.name}
                    </p>
                    <p className="mt-2 text-sm text-pirrot-blue-100/65">
                      Klick zum Entfernen
                    </p>
                  </div>
                ) : (
                  <FileUpload
                    fieldName="Moduldatei"
                    accept={["application/pdf", "image/png", "image/jpeg"]}
                    onPickedFile={handlePickedFile}
                    resetFile={handleResetFile}
                  />
                )}
              </div>

              <div className="field-shell min-h-52 p-1">
                {thumbnail.data ? (
                  <div
                    className="group relative flex size-full cursor-pointer flex-col overflow-hidden rounded-lg border border-pirrot-blue-200/10 bg-pirrot-blue-950/55"
                    onClick={handleResetThumb}
                  >
                    <span className="compact-label absolute right-3 top-3 z-10 hidden text-xs uppercase text-pirrot-red-200 group-hover:block">
                      Reset
                    </span>
                    <div className="flex-1 overflow-hidden">
                      <PreviewImage file={thumbnail.src ?? thumbnail.data} />
                    </div>
                    <div className="break-words border-t border-pirrot-blue-200/10 px-4 py-3 text-sm text-pirrot-blue-100">
                      {thumbnail.data.name}
                    </div>
                  </div>
                ) : (
                  <FileUpload
                    fieldName="Vorschau"
                    accept={["image/png", "image/jpeg"]}
                    onPickedFile={handlePickedThumb}
                    resetFile={handleResetThumb}
                  />
                )}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="field-shell p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                      Erkannte Tags
                    </p>
                    <h4 className="mt-2 text-xl font-bold text-white">
                      Formular-Mapping
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAvailableTags((current) => !current)}
                    className="btn-secondary shrink-0 px-3 py-2 text-xs"
                  >
                    {showAvailableTags ? "Liste schließen" : "Tags auswählen"}
                  </button>
                </div>

                <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                  {allowedTags.length === 0 ? (
                    <p className="text-sm text-pirrot-blue-100/65">
                      Noch keine Tags erkannt oder zugeordnet.
                    </p>
                  ) : (
                    allowedTags.map((tag) => (
                      <Tag
                        key={tag.id}
                        {...tag}
                        variant="selected"
                        onClick={(removedTag) =>
                          handleTagToggle(removedTag, true)
                        }
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="field-shell p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                      Verfügbar
                    </p>
                    <h4 className="mt-2 text-xl font-bold text-white">
                      Weitere Variablen
                    </h4>
                  </div>
                  <span className="badge-shell">
                    {selectableTags.length} offen
                  </span>
                </div>

                {showAvailableTags ? (
                  <div className="mt-4 flex max-h-64 flex-wrap gap-2 overflow-y-auto">
                    {selectableTags.length === 0 ? (
                      <p className="text-sm text-pirrot-blue-100/65">
                        Alle freigegebenen Tags sind bereits zugeordnet.
                      </p>
                    ) : (
                      selectableTags.map((tag) => (
                        <Tag
                          key={tag.id}
                          {...tag}
                          variant="available"
                          onClick={(selectedTag) =>
                            handleTagToggle(selectedTag, false)
                          }
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-pirrot-blue-100/65">
                    Öffnen Sie die Liste, um zusätzliche Variablen manuell dem
                    Modul zuzuweisen.
                  </p>
                )}
              </div>
            </div>

            {submitError ? (
              <div className="rounded-lg border border-pirrot-red-300/30 bg-pirrot-red-950/35 px-4 py-3 text-sm text-pirrot-red-100">
                {submitError}
              </div>
            ) : null}

            <div className="mt-auto flex flex-col gap-3 sm:flex-row">
              <Link href="/dashboard/module" className="btn-secondary flex-1">
                Abbrechen
              </Link>
              <button
                disabled={mutationPending}
                type="submit"
                className="btn-primary flex-1 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {mutationPending
                  ? "Speichert..."
                  : moduleId
                    ? "Modul aktualisieren"
                    : "Modul speichern"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="glass-card-soft min-h-[60vh] overflow-hidden">
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-pirrot-blue-200/10 px-5 py-4">
            <div>
              <p className="compact-label text-xs font-semibold uppercase text-pirrot-blue-200/70">
                Live Preview
              </p>
              <h3 className="mt-2 text-xl font-black text-white sm:text-2xl">
                Dokumentansicht
              </h3>
            </div>
            {pdfFileUrl ? <span className="badge-shell">bereit</span> : null}
          </div>

          <div className="flex flex-1 items-center justify-center p-4">
            {pdfFileUrl ? (
              <iframe
                src={pdfFileUrl}
                className="h-[72vh] w-full rounded-lg border border-pirrot-blue-200/10 bg-white"
              />
            ) : (
              <div className="field-shell flex h-full min-h-[24rem] w-full flex-col items-center justify-center gap-4 px-6 text-center">
                <div className="bg-pirrot-blue-500/12 flex size-16 items-center justify-center rounded-full text-pirrot-blue-100/70">
                  <DocumentTextIcon className="size-8" />
                </div>
                <div>
                  <h4 className="text-xl font-bold text-white">
                    Noch keine Vorschau verfügbar
                  </h4>
                  <p className="mt-2 max-w-md text-sm text-pirrot-blue-100/65">
                    Laden Sie eine PDF hoch, um erkannte Felder und die aktuelle
                    Dokumentvorschau direkt hier zu kontrollieren.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
