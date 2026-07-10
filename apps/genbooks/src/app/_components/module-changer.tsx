'use client'

import { Reorder } from "framer-motion"
import { BookImage, CalendarDays, GripVertical, ShellIcon, XIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { BookPart } from "@prisma/client";
import type { ConfigModules } from "@/util/book/configurator";

type ModuleItem = {
  id: string;
  name: string;
  type: string;
  theme: string | null;
  thumbnail: string;
};

export type ModuleId = ModuleItem["id"];
export type ColorCode = 4 | 1;

type ModuleChangerItem = {
  id: string;
  name: string;
  theme: string | null;
  part: BookPart;
  type: string;
  thumbnail: string;
  url: string;
  createdAt: Date;
  booksCount: number;
};

type BucketKey = keyof ConfigModules;

function SectionTitle({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {subtitle ? <p className="text-info-800 text-xs">{subtitle}</p> : null}
    </div>
  );
}

export default function ModuleChanger(props: {
  items: ConfigModules;
  modules: ModuleChangerItem[];
  onItemsChange?: (newItems: ConfigModules) => void;
  onColorMapChange: (colorMap: Map<ModuleId, ColorCode>) => void;
  initialColorMap: Map<ModuleId, ColorCode>;
}) {
  const {
    items,
    modules,
    onItemsChange,
    onColorMapChange,
    initialColorMap,
  } = props;
  const coverItem = modules.find((m) => m.id === items.COVER[0]);
  const plannerItems = items.PLANNER
    .map((itemId) => modules.find((m) => m.id === itemId))
    .filter((item): item is ModuleChangerItem => Boolean(item));
  const bindingItem = modules.find((m) => m.id === items.BINDING[0]);

  const [colorMap, setColorMap] = useState<Map<ModuleId, ColorCode>>(
    initialColorMap,
  );

  useEffect(() => {
    onColorMapChange(colorMap);
  }, [colorMap, onColorMapChange]);

  const orderedPreItems = useMemo(
    () =>
      items.PRE
        .map((itemId) => modules.find((m) => m.id === itemId))
        .filter((item): item is ModuleChangerItem => Boolean(item)),
    [items.PRE, modules],
  );

  const orderedPostItems = useMemo(
    () =>
      items.POST
        .map((itemId) => modules.find((m) => m.id === itemId))
        .filter((item): item is ModuleChangerItem => Boolean(item)),
    [items.POST, modules],
  );

  const allContentItems = [...orderedPreItems, ...plannerItems, ...orderedPostItems];
  const contentColors = allContentItems.map((item) => colorMap.get(item.id) ?? 4);
  let contentIsColor: boolean | null;
  if (contentColors.length === 0) {
    contentIsColor = null;
  } else if (contentColors.every((color) => color === 4)) {
    contentIsColor = true;
  } else if (contentColors.every((color) => color === 1)) {
    contentIsColor = false;
  } else {
    contentIsColor = null;
  }

  function handleColorChange(moduleId: ModuleId, color: ColorCode) {
    setColorMap((prev) => {
      const next = new Map(prev);
      next.set(moduleId, color);
      return next;
    });
  }

  function handleRemoveItem(id: string, bucket: BucketKey) {
    if (!onItemsChange) return;

    onItemsChange({
      ...items,
      [bucket]: items[bucket].filter((itemId) => itemId !== id),
    });
  }

  function handleReorder(bucket: "PRE" | "POST", newOrder: string[]) {
    if (!onItemsChange) return;

    onItemsChange({
      ...items,
      [bucket]: newOrder,
    });
  }

  function setAllModuleColors(color: ColorCode) {
    setColorMap((prev) => {
      const next = new Map(prev);
      allContentItems.forEach((item) => {
        next.set(item.id, color);
      });
      return next;
    });
  }

  function createReorderableItem(item: ModuleItem, bucket: "PRE" | "POST") {
    return (
      <Reorder.Item key={item.id} value={item.id}>
        <div className="py-0.5">
          <div className="field-shell flex w-full cursor-grab items-center gap-2 rounded border p-2 text-info-950">
            <div className="flex size-12 items-center justify-center p-0.5">
              <GripVertical />
            </div>
            <div className="flex w-full flex-col text-base">
              <h5 className="text-sm font-bold">{item.name}</h5>
              <span className="text-xs">{item.theme}</span>
              <span className="text-xs font-semibold first-letter:uppercase">
                {item.type}
              </span>
            </div>
            <ModuleColorChanger
              moduleId={item.id}
              currentColor={colorMap.get(item.id) ?? 4}
              onColorChange={handleColorChange}
            />
            <div className="flex size-12 items-center justify-center p-0.5">
              <button
                type="button"
                onClick={() => handleRemoveItem(item.id, bucket)}
              >
                <XIcon />
              </button>
            </div>
          </div>
        </div>
      </Reorder.Item>
    );
  }

  function createStaticItem(
    item: ModuleItem,
    type: "COVER" | "PLANNER" | "BINDING",
  ) {
    const staticIcon = (itemType: typeof type) => {
      switch (itemType) {
        case "COVER":
          return <BookImage className="size-6" />;
        case "PLANNER":
          return <CalendarDays className="size-6" />;
        case "BINDING":
          return <ShellIcon className="size-6" />;
      }
    };

    return (
      <div className="my-1 py-0.5" key={item.id}>
        <div
          className={`field-shell flex w-full items-center gap-2 rounded border-2 p-2
            ${type === "COVER" ? "border-pirrot-blue-300 text-pirrot-blue-950" : ""}
            ${type === "PLANNER" ? "border-pirrot-green-300 text-pirrot-green-700" : ""}
            ${type === "BINDING" ? "border-warning-300 text-warning-700" : ""}`}
        >
          <div className="flex size-12 items-center justify-center p-0.5">
            {staticIcon(type)}
          </div>
          <div className="flex w-full flex-col text-base">
            <h5 className="text-sm font-bold">{item.name}</h5>
            <span className="text-xs text-info-950">{item.theme}</span>
          </div>
          {type !== "BINDING" ? (
            <ModuleColorChanger
              moduleId={item.id}
              currentColor={colorMap.get(item.id) ?? 4}
              onColorChange={handleColorChange}
            />
          ) : null}
          <div className="flex size-12 items-center justify-center p-0.5">
            <button
              type="button"
              onClick={() =>
                handleRemoveItem(
                  item.id,
                  type === "COVER"
                    ? "COVER"
                    : type === "PLANNER"
                      ? "PLANNER"
                      : "BINDING",
                )
              }
              className="text-info-950"
            >
              <XIcon />
            </button>
          </div>
        </div>
      </div>
    );
  }

  function renderSortableSection(
    title: string,
    subtitle: string,
    bucket: "PRE" | "POST",
    items: ModuleChangerItem[],
  ) {
    return (
      <div className="mb-2 flex flex-col gap-2">
        <SectionTitle title={title} subtitle={subtitle} />
        {items.length === 0 ? (
          <div className="field-shell my-1 w-full p-4 text-sm text-info-800">
            Keine Module ausgewählt.
          </div>
        ) : (
          <div className="relative max-h-[240px] overflow-y-auto">
            <Reorder.Group
              axis="y"
              values={items.map((item) => item.id)}
              onReorder={(nextOrder) => handleReorder(bucket, nextOrder)}
            >
              {items.map((item) => createReorderableItem(item, bucket))}
            </Reorder.Group>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="content-card flex flex-col gap-3 p-2">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-black uppercase tracking-wide">Buchaufbau</h2>
        <p className="text-info-800 text-xs">
          Reihenfolge und Druckfarben fur die einzelnen Bereiche Ihres Planers.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <SectionTitle title="Inhaltsdruck" subtitle="Farben fur Vorderteil, Wochenplaner und Hinterteil" />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAllModuleColors(1)}
            className={`btn-soft flex-1 p-1 ${contentIsColor !== null && !contentIsColor ? "border-pirrot-blue-700/50 border-2" : ""}`}
          >
            S/W
          </button>
          <button
            type="button"
            onClick={() => setAllModuleColors(4)}
            className={`btn-soft flex-1 p-1 ${contentIsColor !== null && contentIsColor ? "border-pirrot-blue-700/50 border-2" : ""}`}
          >
            Farbe
          </button>
        </div>
      </div>

      <div className="mb-2 flex flex-col gap-1">
        <SectionTitle title="Umschlag" />
        {coverItem ? (
          createStaticItem(coverItem, "COVER")
        ) : (
          <div className="field-shell my-1 w-full p-4 text-sm text-info-800">
            Kein Umschlag ausgewählt.
          </div>
        )}
      </div>

      {renderSortableSection(
        "Vorderer Teil",
        "Diese Module erscheinen vor dem Wochenplaner.",
        "PRE",
        orderedPreItems,
      )}

      <div className="mb-2 flex flex-col gap-1">
        <SectionTitle
          title="Wochenplaner"
          subtitle="Der Hauptteil des Buches."
        />
        {plannerItems.length > 0 ? (
          plannerItems.map((item) => createStaticItem(item, "PLANNER"))
        ) : (
          <div className="field-shell my-1 w-full p-4 text-sm text-info-800">
            Kein Wochenplaner ausgewählt.
          </div>
        )}
      </div>

      {renderSortableSection(
        "Hinterer Teil",
        "Diese Module erscheinen nach dem Wochenplaner.",
        "POST",
        orderedPostItems,
      )}

      <div className="mb-2">
        <SectionTitle title="Bindung" />
        {bindingItem ? (
          createStaticItem(bindingItem, "BINDING")
        ) : (
          <div className="field-shell my-1 w-full p-4 text-sm text-info-800">
            Keine Bindung ausgewählt.
          </div>
        )}
      </div>
    </div>
  );
}

function ModuleColorChanger(props: {
  moduleId: ModuleId;
  currentColor: ColorCode;
  onColorChange: (moduleId: ModuleId, color: ColorCode) => void;
}) {
  const { moduleId, currentColor, onColorChange } = props;

  return (
    <div className="field-shell flex h-fit shrink-0 overflow-hidden rounded-full p-1 text-xs">
      <button
        type="button"
        onClick={() => onColorChange(moduleId, 1)}
        className={`rounded-full px-2 py-1 ${currentColor === 1 ? "bg-info-950 text-white" : ""}`}
      >
        S/W
      </button>
      <button
        type="button"
        onClick={() => onColorChange(moduleId, 4)}
        className={`rounded-full px-2 py-1 ${currentColor === 4 ? "bg-pirrot-blue-600 text-white" : ""}`}
      >
        Farbe
      </button>
    </div>
  );
}
