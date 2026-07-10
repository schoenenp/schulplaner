"use client";
import type { FormEvent } from "react";
import { useState, useMemo, useEffect, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { FileType } from "@prisma/client";
import { CheckCircleIcon, ClipboardCopyIcon } from "lucide-react";

import FileUpload from "@/app/config/_components/file-upload";
import { api } from "@/trpc/react";
import { getPageRules } from "@/util/book/functions";
import { pickCoverImageFile, pickModulePdfFile } from "@/util/module-files";
import { urlToFile, extractTextFields  } from "@/util/pdf/functions";
import { uploadModuleFiles } from "@/util/upload/client";

type FileState = {
  data?: File;
  hasChanged: boolean;
  src?: string;
  modifiedPdf?: Uint8Array; 
}


// Fixed type definitions
export type TagItem = { 
    id: number;
    name: string; 
    output: string | null; 
  };
  
  type TagProps = TagItem & {
    onClick?: (tag: TagItem) => void; // Pass full tag object instead of just name
    variant?: 'selected' | 'available'; // Visual distinction
  };

type ModuleData = {
  id: string;
  type: { name: string };
  theme: string | null;
  name: string | null;
  files: {
    id: string;
    name: string | null;
    type: FileType;
    size: number;
    src: string;
  }[];
};

type PageData = {
    modules: Promise<ModuleData[]>;
    types: Promise<{ id: string; name: string; minPages: number; maxPages: number }[]>;
    tags: Promise<{ id: number; name: string; output: string | null }[]>
  };

function isPdfLikeFile(file?: FileState["data"], src?: string): boolean {
  if (file?.type === "application/pdf") {
    return true;
  }

  return typeof src === "string" && src.toLowerCase().endsWith(".pdf");
}

// Improved Tag component
function Tag({ id, name, output, onClick, variant = 'available' }: TagProps) {
    const handleItemClick = () => {
      onClick?.({ id, name, output });
    };
  
    const baseClasses = "cursor-pointer flex flex-wrap gap-2 items-center overflow-clip p-2 rounded transition-colors";
    const variantClasses = variant === 'selected' 
      ? "bg-pirrot-blue-100 text-pirrot-blue-700 hover:bg-pirrot-red-100 hover:text-pirrot-red-600" 
      : "bg-pirrot-blue-50 text-pirrot-blue-500 hover:bg-pirrot-blue-100";
  
    return (
      <div
        className={`${baseClasses} ${variantClasses}`}
        onClick={handleItemClick}
      >
        {name}
        <span className="font-mono text-xs opacity-70">
          {output ? `//${output}` : '//no output'}
        </span>
      </div>
    );
  }
  async function processPdfFile(
    file: File,
    availableTags: TagItem[],
  ) {
    if (file.type !== "application/pdf") {
      return { file, fields: [], modifiedPdf: undefined };
    }
    try {
      const { fields, modifiedPdf } = await extractTextFields(
          file,
          availableTags
        );

      return { file, fields, modifiedPdf };
    } catch {
      return { file, fields: [], modifiedPdf: undefined };
    }
  }
  
// --- CUSTOM HOOKS ---

/**
 * Hook to manage form state and initialization from existing module data.
 */
function useModuleFormState(moduleId?: string, pageData?: PageData) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [theme, setTheme] = useState("");
  const [file, setFile] = useState<FileState>({ hasChanged: false });
  const [thumbnail, setThumbnail] = useState<FileState>({ hasChanged: false });
  const [allowedTags, setAllowedTags] = useState<TagItem[]>([]);

  useEffect(() => {
    if (!moduleId || !pageData) return;
  
    const initialize = async () => {
      const [modules, tags] = await Promise.all([
        pageData.modules,
        pageData.tags,
      ]);
      const moduleItem = modules.find((m) => m.id === moduleId);
      if (!moduleItem) return;
  
      setName(moduleItem.name ?? "module");
      setType(moduleItem.type.name);
      setTheme(moduleItem.theme ?? "");
  
      // Initialize Thumbnail
      const thumbData = moduleItem
        .files
        .find((f) => f.name?.startsWith("thumb_"))
  
      if (thumbData) {
        const thumbFile = await urlToFile(thumbData.src, thumbData.name ?? "");
        setThumbnail({ data: thumbFile ?? undefined, src: thumbData.src, hasChanged: false });
      }
  
      // Initialize Main File and process if it's a PDF
      const coverImageData =
        moduleItem.type.name.toLocaleLowerCase() === "umschlag"
          ? pickCoverImageFile(moduleItem.files)
          : undefined;
      const fileData = coverImageData ?? pickModulePdfFile(moduleItem.files);
      if (fileData) {
        const originalFile = await urlToFile(fileData.src, fileData.name ?? "");
        if (originalFile) {
          if (originalFile.type === "application/pdf") {
            const { file: processedFile, fields, modifiedPdf } =
              await processPdfFile(originalFile, tags);

            const extractedTags = fields
              .map(f => tags?.find(tg => tg.name === f.name))
              .filter((tag): tag is TagItem => tag !== undefined);
            setAllowedTags(extractedTags);

            setFile({
              data: processedFile,
              src: fileData.src,
              hasChanged: false,
              modifiedPdf: modifiedPdf
            });
          } else {
            setAllowedTags([]);
            setFile({
              data: originalFile,
              src: fileData.src,
              hasChanged: false,
            });
          }
        }
      }
    };
  
    void initialize();
  }, [moduleId, pageData]);

  return {
    name,
    setName,
    type,
    setType,
    theme,
    setTheme,
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
  const [ pageData ] = api.module.initPage.useSuspenseQuery();

  const {
    name,
    setName,
    type,
    setType,
    file,
    setFile,
    allowedTags,
    setAllowedTags,
} = useModuleFormState(
    moduleId, 
    pageData
);

  const [typesPickable, setTypesPickable] = useState<{ 
    id: string; 
    name: string; 
    minPages: number; 
    maxPages: number 
}[]>([]);

  const [isTypePickerOpen, setIsTypePickerOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | undefined>();
  const [isUploading, setIsUploading] = useState(false);

  
useEffect(() => {
  
  async function setData(){
      const promisedTypes = await pageData.types
      setTypesPickable(promisedTypes)
  }
  
  void setData()
}, [pageData?.types]);

  const mutationOptions = {
    onSuccess: async () => {
      await utils.module.invalidate();
      router.push("/dashboard?view=module");
    },
  };

  const createModule = api.module.create.useMutation(mutationOptions);
  const updateModule = api.module.update.useMutation(mutationOptions);

// Helper function to safely extract and filter tags
function extractTagsFromFields(
    fieldNames: TagItem[], 
    availableTags: TagItem[]
): TagItem[] {
    const foundTags = fieldNames
      .map(fieldName => availableTags.find(tag => tag.name === fieldName.name))
      .filter((tag): tag is TagItem => tag !== undefined);
    
    const uniqueTags = foundTags.filter((tag, index, array) => 
      array.findIndex(t => t.id === tag.id) === index
    );
    
    return uniqueTags;
  }


  const handleTagToggle = useCallback(async (tag: TagItem, isRemoving: boolean) => {
    if (!file.data) return;
  
    let newAllowedTags: TagItem[];
    if (isRemoving) {
      newAllowedTags = allowedTags.filter(t => t.id !== tag.id);
    } else {
      newAllowedTags = [...allowedTags, tag];
    }
  
    // Re-process the PDF with the new tag selection
    const { modifiedPdf } = await processPdfFile(file.data, newAllowedTags);
    
    setAllowedTags(newAllowedTags);
    setFile(prev => ({ ...prev, modifiedPdf }));
  }, [file.data, allowedTags, setAllowedTags, setFile]);
  
  // Updated handlePickedFile function
  const handlePickedFile = useCallback(
    async (pickedFile: File) => {
      const tags = await pageData?.tags;
      if (!tags) return;
      
      const { file: processedFile, fields, modifiedPdf } = await processPdfFile(
        pickedFile,
        tags,
      );
      
      // Store both the original file and the modified PDF
      setFile({ 
        data: processedFile, 
        hasChanged: true,
        modifiedPdf: modifiedPdf 
      });
      
      const extractedTags = extractTagsFromFields(fields, tags);
      setAllowedTags(extractedTags);
    },
    [pageData, setFile, setAllowedTags],
  );
  

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isUploading) return;
    setSubmitError(undefined);

    setIsUploading(true);
    try {
      const uploadedFiles = await uploadModuleFiles({
        type,
        file: file.data && file.hasChanged ? file.data : undefined,
      });

      if (moduleId) {
        await updateModule.mutateAsync({
          id: moduleId,
          name,
          type,
          uploadedFile: uploadedFiles.file,
          uploadedThumbnail: uploadedFiles.thumbnail,
        });
      } else {
        if (!uploadedFiles.file) {
          setSubmitError("Bitte laden Sie eine Moduldatei hoch.");
          return;
        }
        await createModule.mutateAsync({
          name,
          type,
          uploadedFile: uploadedFiles.file,
          uploadedThumbnail: uploadedFiles.thumbnail,
        });
      }
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Upload fehlgeschlagen",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const pdfFileUrl = useMemo(() => {
    if (file.modifiedPdf) {
      // Create a blob URL from the modified PDF
      const blob = new Blob([file.modifiedPdf as BlobPart], { type: 'application/pdf' });
      return URL.createObjectURL(blob);
    }
    return file.data instanceof File ? URL.createObjectURL(file.data) : file.src;
  }, [file.data, file.src, file.modifiedPdf]);

  const isPdfPreview = useMemo(
    () => isPdfLikeFile(file.data, file.src),
    [file.data, file.src],
  );
  
  useEffect(() => {
    return () => {
      if (pdfFileUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(pdfFileUrl);
      }
    };
  }, [pdfFileUrl]);
  

  const handleResetFile = () => {
    setAllowedTags([]);
    setFile({ data: undefined, hasChanged: false });
  };


  return (
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(360px,420px)_minmax(0,1fr)]">
      <div className="content-card min-h-0 overflow-hidden">
        <div className="flex h-full flex-col p-4 text-pirrot-blue-800 sm:p-5">
          <div className="border-pirrot-blue-200/70 mb-5 border-b pb-4">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-pirrot-blue-500">
              Module Workspace
            </p>
            <h3 className="text-3xl font-black uppercase text-pirrot-blue-800">
              {moduleId ? "Modul bearbeiten" : "Neues Modul"}
            </h3>
            <p className="mt-2 text-sm text-info-700">
              Verwalten Sie Metadaten, laden Sie die PDF hoch und pruefen Sie
              erkannte Formularfelder direkt neben der Vorschau.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-6">
            {/* Form Inputs */}
            <div className="w-full flex flex-col gap-1">
              <label>Name</label>
              <input
                className="field-shell p-2 text-opacity-80"
                onChange={(e) => setName(e.target.value)}
                value={name}
              />
            </div>
            <div className="flex w-full flex-col gap-2 lg:flex-row">
              <div className="flex w-full flex-col gap-1">
                <label className="text-pirrot-blue-800">Typ</label>
                <input
                  id="types"
                  autoComplete="off"
                  className="field-shell p-2 text-info-950 text-opacity-80"
                  onBlur={() => setTimeout(() => setIsTypePickerOpen(false), 200)}
                  onFocus={() => setIsTypePickerOpen(true)}
                  onChange={(e) => setType(e.target.value)}
                  value={type}
                />
                <div className="relative w-full">
                  {isTypePickerOpen && (
                    <div className="content-card absolute top-0 z-40 flex max-h-44 w-full flex-col gap-1 overflow-y-auto p-1">
                      {typesPickable
                        .filter((t) =>
                          t.name.toLowerCase().includes(type.toLowerCase()),
                        )
                        .map((t) => (
                          <button
                            id={t.name}
                            key={t.id}
                            type="button"
                            onClick={() => {
                              setType(t.name);
                              setIsTypePickerOpen(false);
                            }}
                            className="field-shell flex w-full justify-between p-2 text-info-950"
                          >
                            {t.name}
                            <span className="flex items-center justify-center gap-2">
                              <ClipboardCopyIcon className="size-4" />
                              {getPageRules({ min: t.minPages, max: t.maxPages })}
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* File Uploads & Tag Displays */}
            <div className="grid w-full grid-cols-1 gap-3">
              <div className="field-shell min-h-48 p-0.5">
                {file.data ? (
                  <div
                    className="group relative flex size-full cursor-pointer flex-col items-center justify-center rounded-sm border-2 border-solid border-pirrot-blue-800 bg-pirrot-blue-500/20 text-pirrot-blue-800 transition duration-500 hover:border-pirrot-blue-100"
                    onClick={handleResetFile}
                  >
                    <span className="absolute top-2 right-2 hidden text-pirrot-red-400 transition duration-500 group-hover:block">
                      undo
                    </span>
                    <CheckCircleIcon className="size-8" />
                    <span>{file.data.name}</span>
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
              <div className="field-shell min-h-0 flex-1 p-0.5">
                <div className="flex h-full min-h-56 flex-col p-1">
                  <div className="flex items-center justify-between px-1 pb-2">
                    <h2 className="text-sm font-medium uppercase">Erkannte Tags</h2>
                    <span className="text-xs font-semibold text-info-600">
                      {allowedTags.length}
                    </span>
                  </div>
                  <div className="field-shell flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-1">
                    {allowedTags.map((tag) => (
                      <Tag
                        key={tag.id}
                        {...tag}
                        variant="selected"
                        onClick={(removedTag) => handleTagToggle(removedTag, true)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Form Actions */}
            {submitError ? (
              <p className="rounded border border-pirrot-red-400 bg-pirrot-red-100 p-3 text-sm text-pirrot-red-600">
                {submitError}
              </p>
            ) : null}
            <div className="mt-auto flex w-full gap-2">
              <Link
                href="/dashboard?view=module"
                className="btn-soft flex w-full items-center justify-center p-4 text-center"
              >
                Abbruch
              </Link>
              <button
                type="submit"
                disabled={
                  isUploading || createModule.isPending || updateModule.isPending
                }
                className="btn-solid w-full p-4 disabled:opacity-30"
              >
                {isUploading || createModule.isPending || updateModule.isPending
                  ? "Speichert..."
                  : moduleId
                    ? "Updaten"
                    : "Speichern"}
              </button>
            </div>
          </form>
        </div>
      </div>
      <div className="content-card min-h-[65vh] overflow-hidden xl:min-h-0">
        <div className="flex h-full flex-col">
          <div className="border-pirrot-blue-200/70 flex items-center justify-between border-b px-4 py-3 sm:px-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-pirrot-blue-500">
                Live Preview
              </p>
              <h2 className="text-lg font-black uppercase text-pirrot-blue-800">
                PDF Vorschau
              </h2>
            </div>
            <span className="text-xs text-info-600">
              {file.data ? file.data.name : "Keine Datei"}
            </span>
          </div>
          <div className="flex min-h-[55vh] flex-1 bg-white/45 p-2 sm:p-3">
            {pdfFileUrl ? (
              isPdfPreview ? (
                <iframe
                  src={pdfFileUrl + "#view=fit"}
                  className="size-full rounded-xl bg-white"
                />
              ) : (
                <div className="relative flex size-full items-center justify-center rounded-xl bg-white p-4">
                  <Image
                    src={pdfFileUrl}
                    alt="Modulvorschau"
                    fill
                    sizes="(min-width: 1280px) 50vw, 100vw"
                    className="rounded-xl object-contain p-4"
                    unoptimized
                  />
                </div>
              )
            ) : (
              <div className="flex size-full items-center justify-center rounded-xl border border-dashed border-pirrot-blue-300 bg-pirrot-blue-50/60 p-8 text-center text-info-600">
                Laden Sie eine PDF hoch, um die Vorschau auf voller Breite zu
                nutzen.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
