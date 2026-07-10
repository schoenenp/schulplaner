import type { BookPart } from "@prisma/client";

export const FILTER_TYPES = {
  COVER: "umschlag",
  PLANNER: "wochenplaner",
  BINDING: "bindung",
  CUSTOM: "custom",
} as const;

export const CONFIG_STEP_ORDER = [
  "COVER",
  "PRE",
  "PLANNER",
  "POST",
  "BINDING",
  "CHECKOUT",
] as const;

export type ConfigStepId = (typeof CONFIG_STEP_ORDER)[number];
export type ConfigModuleBucket = Exclude<ConfigStepId, "CHECKOUT">;

export type ConfigModules = {
  COVER: string[];
  PRE: string[];
  PLANNER: string[];
  POST: string[];
  BINDING: string[];
};

export function createEmptyConfigModules(): ConfigModules {
  return {
    COVER: [],
    PRE: [],
    PLANNER: [],
    POST: [],
    BINDING: [],
  };
}

export function splitStoredModulesIntoConfigBuckets(
  moduleItems: Array<{ id: string; idx: number; part: BookPart }>,
): ConfigModules {
  const buckets = createEmptyConfigModules();
  let plannerEncountered = false;

  for (const item of [...moduleItems].sort((a, b) => a.idx - b.idx)) {
    switch (item.part) {
      case "COVER":
        buckets.COVER.push(item.id);
        break;
      case "BINDING":
      case "SETTINGS":
        buckets.BINDING.push(item.id);
        break;
      case "PLANNER":
        plannerEncountered = true;
        buckets.PLANNER.push(item.id);
        break;
      case "DEFAULT":
      default:
        if (plannerEncountered) {
          buckets.POST.push(item.id);
        } else {
          buckets.PRE.push(item.id);
        }
        break;
    }
  }

  return buckets;
}

export function isConfigModuleSelected(
  pickedModules: ConfigModules,
  moduleId: string,
): boolean {
  return Object.values(pickedModules).some((bucket) => bucket.includes(moduleId));
}

export function getOrderedContentModuleIds(
  pickedModules: ConfigModules,
): string[] {
  return [...pickedModules.PRE, ...pickedModules.PLANNER, ...pickedModules.POST];
}

export function isCoverModuleLike(input: { type?: string; part?: string | null }) {
  const normalizedType = input.type?.toLowerCase();
  const normalizedPart = input.part?.toUpperCase();
  return (
    normalizedPart === "COVER" || normalizedType === FILTER_TYPES.COVER
  );
}

export function isPlannerModuleLike(input: {
  type?: string;
  part?: string | null;
}) {
  const normalizedType = input.type?.toLowerCase();
  const normalizedPart = input.part?.toUpperCase();
  return (
    normalizedPart === "PLANNER" || normalizedType === FILTER_TYPES.PLANNER
  );
}

export function isBindingModuleLike(input: {
  type?: string;
  part?: string | null;
}) {
  const normalizedType = input.type?.toLowerCase();
  const normalizedPart = input.part?.toUpperCase();
  return (
    normalizedPart === "BINDING" ||
    normalizedPart === "SETTINGS" ||
    normalizedType === FILTER_TYPES.BINDING ||
    normalizedType === "farben"
  );
}

export function isContentModuleLike(input: {
  type?: string;
  part?: string | null;
}) {
  return (
    !isCoverModuleLike(input) &&
    !isPlannerModuleLike(input) &&
    !isBindingModuleLike(input)
  );
}
