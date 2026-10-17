"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import useEmblaCarousel from "embla-carousel-react";
import {
  ChevronLeft,
  ChevronRight,
  EyeIcon,
  MinusIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import Modal from "./modal";
import ModulePreview from "./module-preview";
import type { ModulePickerItem } from "./module-item";

type ModuleCarouselItem = ModulePickerItem & {
  booksCount?: number;
  pageCount?: number | null;
};

type ModuleCarouselProps = {
  items: ModuleCarouselItem[];
  isPicked: (moduleId: string) => boolean;
  onPickedItem: (pickedItem: { id: string; type: string }) => void;
  getDisabledState?: (moduleId: string) => {
    disabled: boolean;
    reason?: string;
  };
};

const MODULE_PART_LABELS: Record<string, string> = {
  COVER: "Umschlag",
  DEFAULT: "Inhalt",
  PLANNER: "Kalendarium",
  BINDING: "Bindung",
  SETTINGS: "Planerinfo",
};

function getAccentClasses(moduleType: string): {
  bar: string;
  badge: string;
  text: string;
  indicatorActive: string;
  indicatorIdle: string;
} {
  switch (moduleType.toLocaleLowerCase()) {
    case "umschlag":
      return {
        bar: "bg-pirrot-blue-300",
        badge: "bg-pirrot-blue-100 text-pirrot-blue-800",
        text: "text-pirrot-blue-700",
        indicatorActive: "bg-pirrot-blue-600",
        indicatorIdle: "bg-pirrot-blue-200 hover:bg-pirrot-blue-300",
      };
    case "wochenplaner":
      return {
        bar: "bg-pirrot-green-300",
        badge: "bg-pirrot-green-100 text-pirrot-green-800",
        text: "text-pirrot-green-700",
        indicatorActive: "bg-pirrot-green-600",
        indicatorIdle: "bg-pirrot-green-200 hover:bg-pirrot-green-300",
      };
    case "bindung":
      return {
        bar: "bg-warning-300",
        badge: "bg-warning-100 text-warning-800",
        text: "text-warning-800",
        indicatorActive: "bg-warning-600",
        indicatorIdle: "bg-warning-200 hover:bg-warning-300",
      };
    default:
      return {
        bar: "bg-pirrot-red-300",
        badge: "bg-pirrot-red-100 text-pirrot-red-700",
        text: "text-pirrot-red-600",
        indicatorActive: "bg-pirrot-red-600",
        indicatorIdle: "bg-pirrot-red-200 hover:bg-pirrot-red-300",
      };
  }
}

export default function ModuleCarousel(props: ModuleCarouselProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({
    align: "start",
    containScroll: false,
    slidesToScroll: 1,
    loop: props.items.length > 1,
  });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [previewModule, setPreviewModule] = useState<ModuleCarouselItem | null>(
    null,
  );
  const [imageFallbacks, setImageFallbacks] = useState<Record<string, string>>(
    {},
  );

  const scrollPrev = useCallback(() => emblaApi?.scrollPrev(), [emblaApi]);
  const scrollNext = useCallback(() => emblaApi?.scrollNext(), [emblaApi]);
  const scrollTo = useCallback(
    (index: number) => emblaApi?.scrollTo(index),
    [emblaApi],
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;

    onSelect();
    emblaApi.on("select", onSelect);
    emblaApi.on("reInit", onSelect);

    return () => {
      emblaApi.off("select", onSelect);
      emblaApi.off("reInit", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    emblaApi.reInit({
      align: "start",
      containScroll: false,
      slidesToScroll: 1,
      loop: props.items.length > 1,
    });
    setSelectedIndex((current) =>
      props.items.length === 0 ? 0 : Math.min(current, props.items.length - 1),
    );
  }, [emblaApi, props.items.length]);

  if (props.items.length === 0) return null;

  const carouselAccent = getAccentClasses(
    props.items[selectedIndex]?.type ?? props.items[0]?.type ?? "",
  );

  return (
    <>
      <Modal selector="modal-hook" show={previewModule !== null}>
        <div className="bg-info-950/90 fixed inset-0 z-[69] flex items-center justify-center p-4">
          <div className="content-card text-pirrot-blue-950 pointer-events-none z-[69] max-h-[calc(100dvh-2rem)] w-full max-w-3xl overflow-y-auto p-4 min-[1920px]:!max-w-[90rem] 2xl:max-w-6xl">
            <div className="pointer-events-auto flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="min-w-0 truncate text-xl font-bold">
                  {previewModule?.name}
                </h3>
                <button
                  onClick={() => setPreviewModule(null)}
                  type="button"
                  className="btn-soft text-pirrot-blue-900 p-2"
                  aria-label="Vorschau schließen"
                >
                  <XIcon className="size-5" />
                </button>
              </div>
              <div className="field-shell flex min-h-0 w-full items-center justify-center overflow-hidden rounded">
                {previewModule ? (
                  <ModulePreview
                    moduleId={previewModule.id}
                    className="h-[min(60dvh,26.25rem)] 2xl:h-[min(78dvh,64rem)]"
                    sizes="(min-width: 1920px) 1400px, (min-width: 1536px) 1120px, (max-width: 768px) 100vw, 720px"
                  />
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <section className="content-card overflow-hidden p-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full gap-2 overflow-x-auto py-1">
            {props.items.map((item, index) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(index)}
                className={`h-2.5 shrink-0 rounded-full transition-all ${
                  selectedIndex === index
                    ? `${carouselAccent.indicatorActive} w-8`
                    : `${carouselAccent.indicatorIdle} w-2.5`
                }`}
                aria-label={`Zu Modul ${index + 1}`}
              />
            ))}
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={scrollPrev}
              className="btn-soft rounded-full p-2"
              aria-label="Vorheriges Modul"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              onClick={scrollNext}
              className="btn-soft rounded-full p-2"
              aria-label="Nächstes Modul"
            >
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
        <div ref={emblaRef} className="overflow-hidden">
          <div className="flex touch-pan-y">
            {props.items.map((item, index) => {
              const disabledState = props.getDisabledState?.(item.id) ?? {
                disabled: false,
              };
              const selected = props.isPicked(item.id);
              const accent = getAccentClasses(item.type);
              const imageSrc =
                imageFallbacks[item.id] ??
                (item.thumbnail && item.thumbnail.length > 0
                  ? item.thumbnail
                  : "/default.png");

              return (
                <article
                  key={item.id}
                  className="min-w-0 flex-[0_0_100%] pr-0"
                  aria-roledescription="slide"
                  aria-label={`${index + 1} von ${props.items.length}`}
                >
                  <div className="relative overflow-hidden rounded-xl border border-white/70 bg-white/50">
                    <div
                      className={`absolute inset-x-0 top-0 h-1 ${accent.bar}`}
                    />
                    <div className="grid min-h-[560px] grid-cols-1 lg:grid-cols-[2fr_1fr] 2xl:min-h-[720px] 2xl:grid-cols-[minmax(0,1fr)_18rem]">
                      <button
                        type="button"
                        onClick={() => setPreviewModule(item)}
                        className="field-shell group relative m-3 min-h-[360px] overflow-hidden rounded-lg text-left lg:min-h-[536px] 2xl:min-h-[696px]"
                        aria-label={`${item.name} Vorschau öffnen`}
                      >
                        <Image
                          className="object-contain transition duration-300 group-hover:scale-[1.02]"
                          src={imageSrc}
                          alt={item.name}
                          fill
                          sizes="(max-width: 1024px) 100vw, 66vw"
                          priority={index === selectedIndex}
                          onError={() =>
                            setImageFallbacks((prev) => ({
                              ...prev,
                              [item.id]: "/default.png",
                            }))
                          }
                        />
                        <span className="text-info-900 absolute right-3 bottom-3 inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-2 text-sm font-bold shadow-sm">
                          <EyeIcon className="size-4" />
                          Vorschau
                        </span>
                      </button>

                      <aside className="flex min-h-0 flex-col justify-between gap-4 border-t border-white/70 p-4 lg:border-t-0 lg:border-l">
                        <div className="flex flex-col gap-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase ${accent.badge}`}
                            >
                              {item.type}
                            </span>
                            {selected ? (
                              <span className="bg-pirrot-green-100 text-pirrot-green-700 rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase">
                                Aktiv
                              </span>
                            ) : null}
                          </div>

                          <div>
                            <p className={`text-sm font-bold ${accent.text}`}>
                              Modul {index + 1} von {props.items.length}
                            </p>
                            <h3 className="text-info-950 mt-1 text-2xl font-bold">
                              {item.name}
                            </h3>
                          </div>

                          <dl className="grid gap-2 text-sm">
                            <div className="field-shell flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2">
                              <dt className="text-info-800 font-bold">Thema</dt>
                              <dd className="min-w-0 text-right font-bold break-words">
                                {item.theme ?? "Ohne Thema"}
                              </dd>
                            </div>
                            <div className="field-shell flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2">
                              <dt className="text-info-800 font-bold">
                                Bereich
                              </dt>
                              <dd className="min-w-0 text-right font-bold break-words">
                                {MODULE_PART_LABELS[item.part] ?? item.part}
                              </dd>
                            </div>
                            <div className="field-shell flex flex-wrap items-start justify-between gap-x-3 gap-y-1 px-3 py-2">
                              <dt className="text-info-800 font-bold">
                                Seitenzahl
                              </dt>
                              <dd className="min-w-0 text-right font-bold">
                                {typeof item.pageCount === "number" &&
                                item.pageCount > 0
                                  ? `${item.pageCount} ${item.pageCount === 1 ? "Seite" : "Seiten"}`
                                  : "Nicht verfügbar"}
                              </dd>
                            </div>
                          </dl>

                          {disabledState.disabled && disabledState.reason ? (
                            <p className="border-warning-300 bg-warning-100/70 text-warning-900 rounded-lg border px-3 py-2 text-sm font-bold">
                              {disabledState.reason}
                            </p>
                          ) : null}
                        </div>

                        <div className="grid gap-2">
                          <button
                            type="button"
                            disabled={disabledState.disabled}
                            onClick={() =>
                              props.onPickedItem({
                                id: item.id,
                                type: item.type,
                              })
                            }
                            className={`flex items-center justify-between gap-2 p-3 ${
                              selected ? "btn-soft" : "btn-solid"
                            } ${
                              disabledState.disabled
                                ? "cursor-not-allowed opacity-60"
                                : ""
                            }`}
                          >
                            {selected ? (
                              <>
                                <MinusIcon className="size-5" />
                                Abwählen
                              </>
                            ) : (
                              <>
                                <PlusIcon className="size-5" />
                                Auswählen
                              </>
                            )}
                          </button>
                          {typeof item.booksCount === "number" &&
                          item.booksCount > 0 ? (
                            <div className="text-info-800 mt-1 flex flex-wrap items-start gap-x-2 gap-y-1 border-t border-white/70 pt-3 text-xs">
                              <span
                                className="shrink-0 font-semibold"
                                aria-label={`${item.booksCount} Verwendungen`}
                              >
                                <span aria-hidden="true">📒</span>{" "}
                                {item.booksCount}
                              </span>
                              <p className="min-w-0 flex-1 basis-40">
                                {`Bereits in ${item.booksCount} ${item.booksCount === 1 ? "bestelltem Planer" : "bestellten Planern"} verwendet.`}
                              </p>
                            </div>
                          ) : null}
                        </div>
                      </aside>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>
    </>
  );
}
