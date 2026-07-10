"use client";

import { api } from "@/trpc/react";
import { BookTemplate, ChevronLeft, ChevronRight } from "lucide-react";
import { useRouter } from "next/navigation";
import BookPreview from "./book-preview";
import LoadingSpinner from "./loading-spinner";
import { useState, useEffect, useRef, useCallback } from "react";
import prices from "@/util/prices";
import { calculatePrintCost } from "@/util/pdf/calculator";
import {
  generateCoverPreview,
  getCoverThumbnail,
  getCoverPdfUrl,
} from "@/util/pdf/cover-preview";

interface TemplatePreviewProps {
  template: {
    id: string;
    name: string | null;
    bookTitle: string | null;
    subTitle: string | null;
    planStart: Date;
    planEnd: Date | null;
    format: string;
    modules: Array<{
      module: {
        files: Array<{ name?: string | null; src: string }>;
      };
    } | null>;
  };
}

function useCoverPreview(template: TemplatePreviewProps["template"]) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [hasTried, setHasTried] = useState(false);

  const generatePreview = useCallback(async () => {
    if (isGenerating || hasTried) return;

    const pdfUrl = getCoverPdfUrl(template.modules);
    if (!pdfUrl) {
      setHasTried(true);
      return;
    }

    setIsGenerating(true);
    try {
      const yearStart = new Date(template.planStart).getFullYear();
      const yearEnd = template.planEnd
        ? new Date(template.planEnd).getFullYear()
        : undefined;
      const bookTitle = template.bookTitle ?? "Vorlage";

      const generated = await generateCoverPreview({
        pdfUrl,
        bookTitle,
        yearStart,
        yearEnd,
      });

      if (generated) {
        setPreviewUrl(generated);
      }
    } catch {
      // Ignore thumbnail generation failure and fall back to existing image.
    } finally {
      setIsGenerating(false);
      setHasTried(true);
    }
  }, [template, isGenerating, hasTried]);

  return {
    previewUrl,
    fallbackUrl: getCoverThumbnail(template.modules),
    isGenerating,
    generatePreview,
  };
}

function TemplateCard({
  template,
}: {
  template: TemplatePreviewProps["template"];
}) {
  const router = useRouter();
  const { mutate: cloneTemplate, isPending: isCloning } =
    api.book.cloneTemplate.useMutation({
      onSuccess: (newBook) => {
        router.push(`/config?bookId=${newBook.id}`);
      },
    });

  const { previewUrl, fallbackUrl, isGenerating, generatePreview } =
    useCoverPreview(template);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            void generatePreview();
          }
        });
      },
      { rootMargin: "100px" },
    );

    const element = document.getElementById(`template-${template.id}`);
    if (element) {
      observer.observe(element);
    }

    return () => observer.disconnect();
  }, [template.id, generatePreview]);

  return (
    <div id={`template-${template.id}`} className="w-full min-w-0">
      <div className="content-card flex h-full w-full flex-col gap-4 p-4 transition-shadow hover:shadow-md">
        <div className="bg-pirrot-blue-50 flex aspect-square min-h-52 items-center justify-center overflow-hidden rounded-lg p-4">
          <div className="origin-center scale-75">
            <BookPreview
              name={template.bookTitle ?? "Vorlage"}
              period={{
                start: template.planStart.toISOString().slice(0, 16),
                end: template.planEnd?.toISOString().slice(0, 16) ?? "",
              }}
              sub={template.subTitle ?? ""}
              coverThumbnail={previewUrl ?? fallbackUrl}
              isLoading={isGenerating}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="font-cairo text-pirrot-blue-950 text-xl font-bold">
            {template.name ?? "Unbenannte Vorlage"}
          </h3>
          <div className="flex gap-2">
            {template.modules.length > 0 && (
              <span className="bg-pirrot-blue-100/50 text-pirrot-blue-800 rounded px-2 py-1 text-xs">
                {template.modules.length} Module
              </span>
            )}
            <span className="bg-pirrot-blue-100/50 text-pirrot-blue-800 rounded px-2 py-1 text-xs">
              {template.format}
            </span>

            {(() => {
              const estimatedPages = template.modules.length * 4;
              const cost = calculatePrintCost({
                amount: 1,
                bPages: estimatedPages,
                cPages: 0,
                format: "DIN A5",
                prices: prices,
              });
              return (
                <span className="bg-pirrot-green-100/50 text-pirrot-green-800 rounded px-2 py-1 text-xs font-bold">
                  ab {(cost.single / 100).toFixed(2).replace(".", ",")} €
                </span>
              );
            })()}
          </div>
          <p className="line-clamp-2 min-h-[2.5em] text-sm text-gray-600">
            Keine Beschreibung verfügbar.
          </p>
        </div>

        <button
          type="button"
          disabled={isCloning}
          onClick={() => cloneTemplate({ templateId: template.id })}
          className="btn-solid mt-auto flex items-center justify-center gap-2 px-4 py-2 disabled:opacity-50"
        >
          {isCloning ? (
            <LoadingSpinner />
          ) : (
            <>
              <BookTemplate size={20} />
              Vorlage verwenden
            </>
          )}
        </button>
      </div>
    </div>
  );
}

export default function TemplateGallery() {
  const { data: templates, isLoading } = api.book.getTemplates.useQuery();

  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);

  const scroll = (direction: "left" | "right") => {
    if (!scrollRef.current) return;
    const container = scrollRef.current;
    const scrollAmount = container.clientWidth * 0.8;
    container.scrollBy({
      left: direction === "left" ? -scrollAmount : scrollAmount,
      behavior: "smooth",
    });
  };

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const index = itemRefs.current.indexOf(
              entry.target as HTMLDivElement,
            );
            if (index !== -1) {
              setActiveIndex(index);
            }
          }
        });
      },
      { rootMargin: "-40% 0px -40% 0px" },
    );

    itemRefs.current.forEach((item) => {
      if (item) observer.observe(item);
    });

    return () => observer.disconnect();
  }, [templates]);

  if (isLoading) {
    return (
      <div className="flex w-full justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!templates || templates.length === 0) {
    return null;
  }

  return (
    <section className="section-shell flex w-full flex-col items-center gap-8 py-12">
      <div className="flex flex-col items-center gap-2 text-center">
        <h2 className="text-pirrot-blue-950 text-3xl font-black uppercase lg:text-5xl">
          Vorlagen
        </h2>
        <p className="text-info-800 max-w-xl text-lg">
          Starten Sie schneller mit unseren vorgefertigten Planern.
        </p>
      </div>

      <div
        className="content-card scrollbar-hide relative w-full overflow-x-auto px-4 py-5"
        ref={scrollRef}
      >
        <div className="flex touch-pan-y gap-4">
          {templates.map((template, index) => (
            <div
              key={template.id}
              ref={(el) => {
                itemRefs.current[index] = el;
              }}
              className="w-[calc(50%-0.5rem)] flex-shrink-0 md:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.67rem)]"
            >
              <TemplateCard
                template={template as TemplatePreviewProps["template"]}
              />
            </div>
          ))}
        </div>
      </div>
      <div className="flex w-full max-w-7xl items-center justify-end gap-4 px-4">
        <div className="flex gap-2">
          {templates.map((template, index) => (
            <button
              key={`pagination-${template.id}`}
              type="button"
              onClick={() => {
                const el = itemRefs.current[index];
                el?.scrollIntoView({
                  behavior: "smooth",
                  block: "nearest",
                  inline: "start",
                });
              }}
              className={`h-3 w-3 rounded-full transition-colors ${index === activeIndex
                  ? "bg-pirrot-blue-500"
                  : "bg-pirrot-blue-200 hover:bg-pirrot-blue-300"
                }`}
              aria-label={`Gehe zu Vorlage ${index + 1}`}
            />
          ))}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => scroll("left")}
            className="btn-soft text-pirrot-blue-950 rounded-full p-2"
          >
            <ChevronLeft size={24} />
          </button>
          <button
            type="button"
            onClick={() => scroll("right")}
            className="btn-soft text-pirrot-blue-950 rounded-full p-2"
          >
            <ChevronRight size={24} />
          </button>
        </div>
      </div>
    </section>
  );
}
