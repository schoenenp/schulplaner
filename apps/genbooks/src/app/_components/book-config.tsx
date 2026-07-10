"use client";

import prices from "@/util/prices";
import {
  ArrowLeft,
  ArrowRight,
  BookA,
  BookImage,
  CalendarDays,
  CheckIcon,
  ChevronDown,
  Component,
  EyeIcon,
  GiftIcon,
  InfoIcon,
  LoaderCircle,
  PenBox,
  Plus,
  SaveIcon,
  ShellIcon,
  XIcon,
} from "lucide-react";
import Modal from "./modal";
import LoginPromptModal from "./login-prompt-modal";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NextImage from "next/image";
import { api } from "@/trpc/react";
import LoadingSpinner from "./loading-spinner";
import ModuleItem, { type ModulePickerItem } from "./module-item";
import ModuleCarousel from "./module-carousel";
import ModuleChanger, { type ColorCode, type ModuleId } from "./module-changer";
import {
  calculatePdfPageCounts,
  processPdfModules,
  processPdfModulesPreview,
  type BookDetails,
  type PDFModule,
} from "@/util/pdf";
import Link from "next/link";

import { useModuleState } from "@/hooks/use-module-state";
import { useUIState } from "@/hooks/use-ui-state";
import { useBookConfig } from "@/hooks/use-book-config";

import { ToggleSwitch } from "./toggle-switch";
import { SearchInput } from "./search-input";
import FileUpload from "../config/_components/file-upload";
import { uploadModuleFiles } from "@/util/upload/client";

import { useRouter } from "next/navigation";
import ConfigInfoForm from "./config-info-form";
import CustomDatesForm from "./custom-dates-form";
import { calculatePrintCost } from "@/util/pdf/calculator";
import ConfigOrderForm from "./config-payment-form";
import { formatDateKeyUTC } from "@/util/date";
import {
  getBindingPageLimitByName,
  getBindingLimitMessage,
  isBindingAllowedForTotalPages,
} from "@/util/book/binding-rules";
import Login from "../config/_components/_user/login-form";
import UserModules from "../config/_components/_user/modules";
import { configSteps } from "@/util/book/config-steps";
import {
  CONFIG_STEP_ORDER,
  FILTER_TYPES,
  getOrderedContentModuleIds,
  isBindingModuleLike,
  isConfigModuleSelected,
  isContentModuleLike,
  isCoverModuleLike,
  isPlannerModuleLike,
  type ConfigModuleBucket,
  type ConfigModules,
  type ConfigStepId,
} from "@/util/book/configurator";

type BindingOverflowEvent = {
  invalidBindingId: string;
  invalidBindingName: string;
  totalPages: number;
  suggestedBindingIds: string[];
};

type AvailableModule = ModulePickerItem & {
  url?: string | null;
  coverImageUrl?: string | null;
  thumbnail?: string | null;
  booksCount?: number;
  theme: string | null;
  part: string;
  /** Stored PDF page count; lets price estimation skip fetching the PDF. */
  pageCount?: number | null;
  /** Print-quality grayscale variant created at upload, when available. */
  grayscalePdfUrl?: string | null;
};

type CalculationSnapshot = {
  bPages: number;
  cPages: number;
  fullPageCount: number;
};

type LiveDelta = {
  pageDelta: number;
  priceDelta: number;
};

const A4_ASPECT_RATIO = 210 / 297;
const A4_MAX_WIDTH_PX = 2480;
const A4_MAX_HEIGHT_PX = 3508;

async function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Bild konnte nicht geladen werden."));
    };
    image.src = objectUrl;
  });
}

function getCenteredAspectCropRect(
  sourceWidth: number,
  sourceHeight: number,
  targetAspectRatio: number,
): { x: number; y: number; width: number; height: number } {
  const sourceAspectRatio = sourceWidth / sourceHeight;

  if (Math.abs(sourceAspectRatio - targetAspectRatio) < 0.0001) {
    return {
      x: 0,
      y: 0,
      width: sourceWidth,
      height: sourceHeight,
    };
  }

  if (sourceAspectRatio > targetAspectRatio) {
    const cropWidth = sourceHeight * targetAspectRatio;
    return {
      x: Math.round((sourceWidth - cropWidth) / 2),
      y: 0,
      width: Math.round(cropWidth),
      height: sourceHeight,
    };
  }

  const cropHeight = sourceWidth / targetAspectRatio;
  return {
    x: 0,
    y: Math.round((sourceHeight - cropHeight) / 2),
    width: sourceWidth,
    height: Math.round(cropHeight),
  };
}

async function cropImageToA4File(file: File): Promise<File> {
  const image = await loadImageFile(file);
  const cropRect = getCenteredAspectCropRect(
    image.width,
    image.height,
    A4_ASPECT_RATIO,
  );

  const downscaleFactor = Math.min(
    1,
    A4_MAX_WIDTH_PX / cropRect.width,
    A4_MAX_HEIGHT_PX / cropRect.height,
  );

  const outputWidth = Math.max(1, Math.round(cropRect.width * downscaleFactor));
  const outputHeight = Math.max(
    1,
    Math.round(cropRect.height * downscaleFactor),
  );

  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Bild konnte nicht vorbereitet werden.");
  }

  context.drawImage(
    image,
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (!result) {
        reject(new Error("Bild konnte nicht exportiert werden."));
        return;
      }
      resolve(result);
    }, "image/png");
  });

  const baseName = file.name.replace(/\.[^/.]+$/, "").trim() || "cover";
  return new File([blob], `${baseName}-a4.png`, { type: "image/png" });
}

const STEP_LABELS: Record<ConfigStepId, string> = {
  COVER: "Umschlag",
  PRE: "Vorderer Teil",
  PLANNER: "Wochenplaner",
  POST: "Hinterer Teil",
  BINDING: "Bindung",
  CHECKOUT: "Checkout",
};

const STEP_ACCENTS: Record<ConfigStepId, string> = {
  COVER: "text-pirrot-blue-700",
  PRE: "text-pirrot-red-500",
  PLANNER: "text-pirrot-green-700",
  POST: "text-pirrot-red-500",
  BINDING: "text-warning-700",
  CHECKOUT: "text-info-900",
};

const STICKY_STEP_HEADER_TOP_OFFSET_PX = 8;
const CHECKOUT_PREVIEW_STICKY_GAP_PX = 16;

function getBindingRuleKey(
  moduleItem: Pick<AvailableModule, "theme" | "name">,
): string {
  return moduleItem.theme?.toLocaleLowerCase() ?? moduleItem.name;
}

function getBindingRuleKeys(
  moduleItem: Pick<AvailableModule, "theme" | "name">,
): string[] {
  const keys = [moduleItem.theme?.toLocaleLowerCase(), moduleItem.name].filter(
    (value): value is string =>
      typeof value === "string" && value.trim().length > 0,
  );
  return Array.from(new Set(keys));
}

function getMatchedBindingRuleKey(
  moduleItem: Pick<AvailableModule, "theme" | "name">,
): string | null {
  for (const key of getBindingRuleKeys(moduleItem)) {
    if (getBindingPageLimitByName(key) !== null) {
      return key;
    }
  }
  return null;
}

function isBindingAllowedForModule(
  moduleItem: Pick<AvailableModule, "theme" | "name">,
  totalPages: number,
): boolean {
  const matchedKey = getMatchedBindingRuleKey(moduleItem);
  if (!matchedKey) return true;
  return isBindingAllowedForTotalPages(matchedKey, totalPages);
}

function getBindingLimitMessageForModule(
  moduleItem: Pick<AvailableModule, "theme" | "name">,
  totalPages: number,
): string | null {
  const matchedKey = getMatchedBindingRuleKey(moduleItem);
  if (!matchedKey) return null;
  return getBindingLimitMessage(matchedKey, totalPages);
}

function getModuleBadgeClass(moduleType: string): string {
  switch (moduleType.toLowerCase()) {
    case FILTER_TYPES.BINDING:
      return "bg-warning-300/20";
    case FILTER_TYPES.PLANNER:
      return "bg-pirrot-green-300/20";
    case FILTER_TYPES.COVER:
      return "bg-pirrot-blue-300/20";
    default:
      return "bg-pirrot-red-400/20";
  }
}

function formatSignedPages(value: number): string {
  if (value === 0) return "0 Seiten";
  return `${value > 0 ? "+" : ""}${value} Seiten`;
}

function formatSignedEuroCents(value: number): string {
  const euros = (Math.abs(value) / 100).toFixed(2);
  return `${value > 0 ? "+" : value < 0 ? "-" : ""}${euros} €`;
}

function getStepIcon(stepId: ConfigStepId) {
  switch (stepId) {
    case "COVER":
      return <BookImage className="size-4" />;
    case "PRE":
      return <Component className="size-4" />;
    case "PLANNER":
      return <CalendarDays className="size-4" />;
    case "POST":
      return <BookA className="size-4" />;
    case "BINDING":
      return <ShellIcon className="size-4" />;
    case "CHECKOUT":
      return <CheckIcon className="size-4" />;
  }
}

function getStepThemeClasses(stepId: ConfigStepId) {
  switch (stepId) {
    case "COVER":
      return "border-pirrot-blue-300/60 text-pirrot-blue-800";
    case "PRE":
      return "border-pirrot-red-200/70 text-pirrot-red-700";
    case "PLANNER":
      return "border-pirrot-green-300/60 text-pirrot-green-800";
    case "POST":
      return "border-pirrot-red-200/70 text-pirrot-red-700";
    case "BINDING":
      return "border-warning-300/60 text-warning-800";
    case "CHECKOUT":
      return "border-pirrot-blue-200/60 text-info-900";
  }
}

function getStepBucket(step: ConfigStepId): ConfigModuleBucket | null {
  switch (step) {
    case "COVER":
      return "COVER";
    case "PRE":
      return "PRE";
    case "PLANNER":
      return "PLANNER";
    case "POST":
      return "POST";
    case "BINDING":
      return "BINDING";
    case "CHECKOUT":
      return null;
  }
}

function isAutoAdvanceStep(step: ConfigStepId): boolean {
  return step === "COVER" || step === "PLANNER" || step === "BINDING";
}

function getAutoAdvanceStepForModule(
  step: ConfigStepId,
  moduleItem: Pick<AvailableModule, "type" | "part">,
): ConfigStepId | null {
  switch (step) {
    case "COVER":
      return isCoverModuleLike(moduleItem) ? "COVER" : null;
    case "PLANNER":
      return isPlannerModuleLike(moduleItem) ? "PLANNER" : null;
    case "BINDING":
      return isBindingModuleLike(moduleItem) ? "BINDING" : null;
    default:
      return null;
  }
}

function getBucketLabel(bucket: ConfigModuleBucket): string {
  switch (bucket) {
    case "COVER":
      return "Umschlag";
    case "PRE":
      return "vorderen Teil";
    case "PLANNER":
      return "Wochenplaner";
    case "POST":
      return "hinteren Teil";
    case "BINDING":
      return "Bindung";
  }
}

function removeModuleFromBuckets(
  pickedModules: ConfigModules,
  moduleId: string,
): ConfigModules {
  return {
    COVER: pickedModules.COVER.filter((id) => id !== moduleId),
    PRE: pickedModules.PRE.filter((id) => id !== moduleId),
    PLANNER: pickedModules.PLANNER.filter((id) => id !== moduleId),
    POST: pickedModules.POST.filter((id) => id !== moduleId),
    BINDING: pickedModules.BINDING.filter((id) => id !== moduleId),
  };
}

function SelectedModuleList(props: {
  title: string;
  modules: AvailableModule[];
  emptyText: string;
}) {
  const { title, modules, emptyText } = props;

  return (
    <div className="field-shell flex flex-col gap-2 p-3">
      <h4 className="font-bold">{title}</h4>
      {modules.length === 0 ? (
        <p className="text-info-800 text-sm">{emptyText}</p>
      ) : (
        <ul className="space-y-2">
          {modules.map((moduleItem) => (
            <li
              key={moduleItem.id}
              className="border-info-950/10 flex flex-wrap items-center gap-2 border-b pb-2"
            >
              <span className="font-semibold">{moduleItem.name}</span>
              <span
                className={`rounded-lg px-2 py-0.5 text-xs first-letter:uppercase ${getModuleBadgeClass(moduleItem.type)}`}
              >
                {moduleItem.type}
              </span>
              {moduleItem.theme ? (
                <span className="field-shell rounded-lg px-2 py-0.5 text-xs first-letter:uppercase">
                  {moduleItem.theme}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function BookConfig(props: {
  bookId?: string;
  isLoggedIn?: boolean;
  partnerToken?: string;
}) {
  const { bookId, isLoggedIn, partnerToken } = props;
  const router = useRouter();

  const {
    modules,
    book: existingBook,
    tips: existingTips,
  } = useBookConfig(bookId);

  const {
    nameInput,
    setNameInput,
    pickedFormat,
    setPickedFormat,
    previewPrice,
    setPreviewPrice,
    orderAmount,
    setOrderAmount,
    pickedModules,
    setPickedModules,
    totalPagesCount,
    setTotalPagesCount,
    isMakingPreview,
    setIsMakingPreview,
  } = useModuleState({
    name: existingBook?.name,
    modules: existingBook?.modules.map((moduleItem) => ({
      id: moduleItem.moduleId,
      idx: moduleItem.idx,
      part: moduleItem.module.part,
      color: moduleItem.colorCode === "COLOR" ? 4 : 1,
    })),
  });

  const {
    modalId,
    setModalId,
    acceptPolicies,
    setAcceptPolicies,
    acceptPoliciesValid,
    isFilterOpen,
    setIsFilterOpen,
    isBookInfoOpen,
    setIsBookInfoOpen,
    configWarnings,
    setConfigWarnings,
    previewFileURL,
    setPreviewFileURL,
    isCostOpen,
    setIsCostOpen,
    onlyPickedModules,
    setOnlyPickedModules,
  } = useUIState();

  const [searchFilterValue, setSearchFilterValue] = useState("");
  const [currentStep, setCurrentStep] = useState<ConfigStepId>("COVER");
  const [pendingAutoAdvanceStep, setPendingAutoAdvanceStep] =
    useState<ConfigStepId | null>(null);
  const [moduleColorMap, setModuleColorMap] = useState<
    Map<ModuleId, ColorCode>
  >(() => {
    const next = new Map<ModuleId, ColorCode>();
    if (existingBook?.modules) {
      for (const moduleItem of existingBook.modules) {
        next.set(moduleItem.moduleId, moduleItem.colorCode === "COLOR" ? 4 : 1);
      }
    }
    return next;
  });
  const [isRefreshingPreview, setIsRefreshingPreview] = useState(false);
  const [useMobilePdfFallback, setUseMobilePdfFallback] = useState(false);
  const [bindingOverflowEvent, setBindingOverflowEvent] =
    useState<BindingOverflowEvent | null>(null);
  const [liveChangeNotice, setLiveChangeNotice] = useState<string>();
  const [lastCalculation, setLastCalculation] =
    useState<CalculationSnapshot | null>(null);
  const [isLiveCalculating, setIsLiveCalculating] = useState(false);
  const [liveCalculationError, setLiveCalculationError] = useState<string>();
  const [liveDelta, setLiveDelta] = useState<LiveDelta | null>(null);
  const [previewConfigKey, setPreviewConfigKey] = useState<string | null>(null);
  const [customCoverPreviewUrl, setCustomCoverPreviewUrl] = useState<
    string | null
  >(null);
  const [customCoverUploadError, setCustomCoverUploadError] = useState<
    string | null
  >(null);
  const [customCoverFile, setCustomCoverFile] = useState<File | null>(null);
  const [isUploadingCustomCover, setIsUploadingCustomCover] = useState(false);
  const [customCoverUploadVersion, setCustomCoverUploadVersion] = useState(0);
  const [checkoutPreviewStickyTop, setCheckoutPreviewStickyTop] = useState(
    STICKY_STEP_HEADER_TOP_OFFSET_PX + CHECKOUT_PREVIEW_STICKY_GAP_PX,
  );
  const mainContentRef = useRef<HTMLDivElement>(null);
  const stickyStepHeaderRef = useRef<HTMLDivElement>(null);
  const prepareCheckoutStepRef = useRef<(() => Promise<void>) | null>(null);
  const calcRequestIdRef = useRef(0);
  const previousCalculationRef = useRef<CalculationSnapshot | null>(null);

  useEffect(() => {
    return () => {
      if (previewFileURL) {
        URL.revokeObjectURL(previewFileURL);
      }
    };
  }, [previewFileURL]);

  useEffect(() => {
    return () => {
      if (customCoverPreviewUrl) {
        URL.revokeObjectURL(customCoverPreviewUrl);
      }
    };
  }, [customCoverPreviewUrl]);

  useEffect(() => {
    const userAgent = navigator.userAgent ?? "";
    const platform = navigator.platform ?? "";
    const touchPoints = navigator.maxTouchPoints ?? 0;
    const isiPadOS = platform === "MacIntel" && touchPoints > 1;
    const isiOS = /iPad|iPhone|iPod/i.test(userAgent) || isiPadOS;
    const isMobileDevice =
      /Android|webOS|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(
        userAgent,
      );

    setUseMobilePdfFallback(isiOS || isMobileDevice);
  }, []);

  useEffect(() => {
    if (!liveChangeNotice) return;
    const timeout = window.setTimeout(() => {
      setLiveChangeNotice(undefined);
    }, 2600);
    return () => window.clearTimeout(timeout);
  }, [liveChangeNotice]);

  useEffect(() => {
    mainContentRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, [currentStep]);

  useEffect(() => {
    const updateStickyOffset = () => {
      const headerHeight =
        stickyStepHeaderRef.current?.getBoundingClientRect().height ?? 0;
      setCheckoutPreviewStickyTop(
        Math.ceil(headerHeight) +
          STICKY_STEP_HEADER_TOP_OFFSET_PX +
          CHECKOUT_PREVIEW_STICKY_GAP_PX,
      );
    };

    updateStickyOffset();
    window.addEventListener("resize", updateStickyOffset);

    const resizeObserver =
      typeof ResizeObserver !== "undefined" && stickyStepHeaderRef.current
        ? new ResizeObserver(updateStickyOffset)
        : null;
    if (resizeObserver && stickyStepHeaderRef.current) {
      resizeObserver.observe(stickyStepHeaderRef.current);
    }

    return () => {
      window.removeEventListener("resize", updateStickyOffset);
      resizeObserver?.disconnect();
    };
  }, [currentStep]);

  const activateStep = useCallback(
    (stepId: ConfigStepId) => {
      if (stepId !== currentStep) {
        setSearchFilterValue("");
        setOnlyPickedModules(false);
      }
      setCurrentStep(stepId);
    },
    [currentStep, setOnlyPickedModules],
  );

  const allModules = useMemo<AvailableModule[]>(
    () => modules as AvailableModule[],
    [modules],
  );

  const moduleLookupById = useMemo(
    () => new Map(allModules.map((moduleItem) => [moduleItem.id, moduleItem])),
    [allModules],
  );

  const selectedBindingRuleKey = useMemo(() => {
    const selectedBindingId = pickedModules.BINDING[0];
    if (!selectedBindingId) return undefined;

    const selectedBinding = moduleLookupById.get(selectedBindingId);
    if (!selectedBinding) return undefined;

    return (
      getMatchedBindingRuleKey(selectedBinding) ??
      getBindingRuleKey(selectedBinding)
    );
  }, [moduleLookupById, pickedModules.BINDING]);

  const pdfBookDetails = useMemo<BookDetails>(
    () => ({
      title: existingBook?.bookTitle ?? "Schulplaner",
      period: {
        start: existingBook?.planStart,
        end: existingBook?.planEnd ?? undefined,
      },
      code: existingBook?.region ?? "DE-SL",
      country: existingBook?.country ?? "DE",
      addHolidays: true,
      customDates: (existingBook?.customDates ?? []).map((dateItem) => ({
        date: formatDateKeyUTC(new Date(dateItem.date)),
        name: dateItem.name,
      })),
    }),
    [
      existingBook?.bookTitle,
      existingBook?.planStart,
      existingBook?.planEnd,
      existingBook?.region,
      existingBook?.country,
      existingBook?.customDates,
    ],
  );

  const pdfModulesForSelection = useMemo<PDFModule[] | null>(() => {
    const coverId = pickedModules.COVER[0];
    if (!coverId) return null;

    const coverModule = moduleLookupById.get(coverId);
    if (!coverModule?.url) return null;

    const contentIds = getOrderedContentModuleIds(pickedModules);
    const contentModules: PDFModule[] = [];

    for (const [idx, moduleId] of contentIds.entries()) {
      const moduleItem = moduleLookupById.get(moduleId);
      if (!moduleItem?.url) return null;

      contentModules.push({
        idx,
        id: moduleId,
        name: moduleItem.name,
        type: moduleItem.type.toLowerCase(),
        pdfUrl: moduleItem.url,
        pageCount: moduleItem.pageCount ?? null,
        grayscalePdfUrl: moduleItem.grayscalePdfUrl ?? null,
      });
    }

    return [
      ...contentModules,
      {
        id: coverModule.id,
        name: coverModule.name,
        idx: 12345,
        type: FILTER_TYPES.COVER,
        pdfUrl: coverModule.url,
        coverImageUrl: coverModule.coverImageUrl ?? undefined,
        pageCount: coverModule.pageCount ?? null,
      },
    ];
  }, [moduleLookupById, pickedModules]);

  const configKey = useMemo(
    () =>
      JSON.stringify({
        cover: pickedModules.COVER,
        pre: pickedModules.PRE,
        planner: pickedModules.PLANNER,
        post: pickedModules.POST,
        binding: pickedModules.BINDING,
        format: pickedFormat,
        colors: Array.from(moduleColorMap.entries()).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      }),
    [moduleColorMap, pickedFormat, pickedModules],
  );

  const isCheckoutPreviewStale =
    previewConfigKey !== null && previewConfigKey !== configKey;
  const hasLiveCalcBaseConfig =
    pickedModules.COVER.length === 1 && pickedModules.PLANNER.length >= 1;

  useEffect(() => {
    if (!lastCalculation) return;
    const estimatedCost = calculatePrintCost({
      amount: orderAmount,
      bPages: lastCalculation.bPages,
      cPages: lastCalculation.cPages,
      format: pickedFormat,
      bindingName: selectedBindingRuleKey,
      prices,
    });
    setPreviewPrice(estimatedCost);
  }, [
    lastCalculation,
    orderAmount,
    pickedFormat,
    selectedBindingRuleKey,
    setPreviewPrice,
  ]);

  const modulesByStep = useMemo(() => {
    const resolveModules = (ids: string[]) =>
      ids
        .map((id) => moduleLookupById.get(id))
        .filter((moduleItem): moduleItem is AvailableModule =>
          Boolean(moduleItem),
        );

    return {
      cover: resolveModules(pickedModules.COVER),
      pre: resolveModules(pickedModules.PRE),
      planner: resolveModules(pickedModules.PLANNER),
      post: resolveModules(pickedModules.POST),
      binding: resolveModules(pickedModules.BINDING),
    };
  }, [moduleLookupById, pickedModules]);

  const completionStatus = useMemo(
    () => ({
      hasCoverModule: pickedModules.COVER.length === 1,
      hasPlannerModule: pickedModules.PLANNER.length >= 1,
      hasBindingModule: pickedModules.BINDING.length === 1,
    }),
    [pickedModules],
  );

  const currentStepConfig = configSteps.find(
    (step) => step.id === currentStep,
  )!;
  const currentStepIndex = CONFIG_STEP_ORDER.indexOf(currentStep);
  const currentBucket = getStepBucket(currentStep);
  const currentStepSelectedIds = useMemo(
    () => (currentBucket ? pickedModules[currentBucket] : []),
    [currentBucket, pickedModules],
  );
  const isPrimaryModuleStep =
    currentStep === "COVER" ||
    currentStep === "PLANNER" ||
    currentStep === "BINDING";

  const matchingTips = useMemo(
    () =>
      (existingTips ?? []).map((tip: { title?: string } | string) =>
        typeof tip === "string" ? tip : (tip.title ?? ""),
      ),
    [existingTips],
  );

  const bindingAvailabilityById = useMemo(() => {
    const availability = new Map<
      string,
      { disabled: boolean; reason?: string }
    >();

    for (const moduleItem of allModules) {
      if (!isBindingModuleLike(moduleItem)) {
        availability.set(moduleItem.id, { disabled: false });
        continue;
      }

      if (totalPagesCount <= 0) {
        availability.set(moduleItem.id, { disabled: false });
        continue;
      }

      const isAllowed = isBindingAllowedForModule(moduleItem, totalPagesCount);
      availability.set(moduleItem.id, {
        disabled: !isAllowed,
        reason: isAllowed
          ? undefined
          : (getBindingLimitMessageForModule(moduleItem, totalPagesCount) ??
            undefined),
      });
    }

    return availability;
  }, [allModules, totalPagesCount]);

  const bindingOverflowSuggestions = useMemo(() => {
    if (!bindingOverflowEvent) return [];
    return bindingOverflowEvent.suggestedBindingIds
      .map((id) => moduleLookupById.get(id))
      .filter((moduleItem): moduleItem is AvailableModule =>
        Boolean(moduleItem),
      );
  }, [bindingOverflowEvent, moduleLookupById]);

  const isConfigComplete =
    completionStatus.hasCoverModule &&
    completionStatus.hasPlannerModule &&
    completionStatus.hasBindingModule;

  const visibleModules = useMemo(() => {
    if (currentStep === "CHECKOUT") return [];

    const normalizedSearch = searchFilterValue.trim().toLowerCase();

    return allModules.filter((moduleItem) => {
      const isStepMatch =
        currentStep === "COVER"
          ? isCoverModuleLike(moduleItem)
          : currentStep === "PLANNER"
            ? isPlannerModuleLike(moduleItem)
            : currentStep === "BINDING"
              ? isBindingModuleLike(moduleItem)
              : isContentModuleLike(moduleItem);

      if (!isStepMatch) return false;

      if (
        onlyPickedModules &&
        !currentStepSelectedIds.includes(moduleItem.id)
      ) {
        return false;
      }

      if (!normalizedSearch) return true;

      return [moduleItem.name, moduleItem.type, moduleItem.theme ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);
    });
  }, [
    allModules,
    currentStep,
    currentStepSelectedIds,
    onlyPickedModules,
    searchFilterValue,
  ]);

  const utils = api.useUtils();
  const { mutate: updateName } = api.book.updatePlannerName.useMutation({
    onSuccess: async (data) => {
      await utils.config.init.invalidate({ bookId });
      setNameInput(data.name);
      setModalId(undefined);
    },
  });

  const { mutateAsync: saveConfigModules, isPending: isSavingConfig } =
    api.book.saveBookModules.useMutation({
      onSuccess: async () => {
        await utils.book.getById.invalidate({ id: bookId });
        router.refresh();
      },
    });
  const { mutateAsync: createModule } = api.module.create.useMutation();

  function announceChange(message: string) {
    setLiveChangeNotice(message);
  }

  function resetCustomCoverUpload() {
    setCustomCoverUploadError(null);
    setCustomCoverFile(null);
    if (customCoverPreviewUrl) {
      URL.revokeObjectURL(customCoverPreviewUrl);
      setCustomCoverPreviewUrl(null);
    }
  }

  async function handleCustomCoverImageUpload(file: File) {
    if (isUploadingCustomCover) {
      return;
    }

    if (!bookId) {
      setCustomCoverUploadError("Buch-ID fehlt. Bitte Seite neu laden.");
      return;
    }

    setIsUploadingCustomCover(true);
    setCustomCoverUploadError(null);

    try {
      const croppedImage = await cropImageToA4File(file);
      const nextPreviewUrl = URL.createObjectURL(croppedImage);

      if (customCoverPreviewUrl) {
        URL.revokeObjectURL(customCoverPreviewUrl);
      }
      setCustomCoverPreviewUrl(nextPreviewUrl);
      setCustomCoverFile(croppedImage);
      setModalId("custom-cover");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCustomCoverUploadError(
        `Upload fehlgeschlagen: ${formatCustomCoverError(message)}`,
      );
      setCustomCoverUploadVersion((prev) => prev + 1);
    } finally {
      setIsUploadingCustomCover(false);
    }
  }

  async function confirmCustomCoverCreation() {
    if (isUploadingCustomCover || !customCoverFile) {
      return;
    }

    if (!bookId) {
      setCustomCoverUploadError("Buch-ID fehlt. Bitte Seite neu laden.");
      return;
    }

    setIsUploadingCustomCover(true);
    setCustomCoverUploadError(null);

    try {
      const { file: uploadedFile, thumbnail: uploadedThumbnail } =
        await uploadModuleFiles({
          type: FILTER_TYPES.COVER,
          file: customCoverFile,
        });

      if (!uploadedFile) {
        throw new Error("Upload fehlgeschlagen");
      }

      const createdModule = await createModule({
        name: `Bild Umschlag ${new Date().toISOString().slice(0, 10)}`,
        type: FILTER_TYPES.COVER,
        uploadedFile,
        uploadedThumbnail,
      });

      await utils.config.init.invalidate({ bookId });
      setPickedModules((prev) => ({
        ...removeModuleFromBuckets(prev, createdModule.id),
        COVER: [createdModule.id],
      }));
      activateStep("COVER");
      setPendingAutoAdvanceStep("COVER");
      setIsBookInfoOpen(true);
      announceChange(
        "Bild-Umschlag erstellt und als aktiver Umschlag ausgewählt.",
      );
      setModalId(undefined);
      resetCustomCoverUpload();
      setCustomCoverUploadVersion((prev) => prev + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setCustomCoverUploadError(
        `Upload fehlgeschlagen: ${formatCustomCoverError(message)}`,
      );
    } finally {
      setIsUploadingCustomCover(false);
    }
  }

  function clearSearch() {
    setSearchFilterValue("");
  }

  function findSelectedBucket(moduleId: string): ConfigModuleBucket | null {
    if (pickedModules.COVER.includes(moduleId)) return "COVER";
    if (pickedModules.PRE.includes(moduleId)) return "PRE";
    if (pickedModules.PLANNER.includes(moduleId)) return "PLANNER";
    if (pickedModules.POST.includes(moduleId)) return "POST";
    if (pickedModules.BINDING.includes(moduleId)) return "BINDING";
    return null;
  }

  const triggerBindingOverflowIfNeeded = useCallback(
    (nextTotalPagesCount: number): boolean => {
      const selectedBindingId = pickedModules.BINDING[0];
      if (!selectedBindingId || nextTotalPagesCount <= 0) return false;

      const selectedBinding = moduleLookupById.get(selectedBindingId);
      if (!selectedBinding || !isBindingModuleLike(selectedBinding))
        return false;

      if (isBindingAllowedForModule(selectedBinding, nextTotalPagesCount)) {
        setBindingOverflowEvent(null);
        return false;
      }

      const suggestedBindingIds = allModules
        .filter((moduleItem) => {
          if (!isBindingModuleLike(moduleItem)) return false;
          if (moduleItem.id === selectedBinding.id) return false;
          return isBindingAllowedForModule(moduleItem, nextTotalPagesCount);
        })
        .slice(0, 2)
        .map((moduleItem) => moduleItem.id);

      setPickedModules((prev) => ({ ...prev, BINDING: [] }));
      setBindingOverflowEvent({
        invalidBindingId: selectedBinding.id,
        invalidBindingName: selectedBinding.name,
        totalPages: nextTotalPagesCount,
        suggestedBindingIds,
      });
      setModalId("binding-overflow");
      return true;
    },
    [
      allModules,
      moduleLookupById,
      pickedModules.BINDING,
      setModalId,
      setPickedModules,
    ],
  );

  useEffect(() => {
    if (!hasLiveCalcBaseConfig) {
      calcRequestIdRef.current += 1;
      previousCalculationRef.current = null;
      setLastCalculation(null);
      setLiveDelta(null);
      setLiveCalculationError(undefined);
      setIsLiveCalculating(false);
      setTotalPagesCount(0);
      setPreviewPrice({ single: 0, total: 0 });
      return;
    }

    if (!pdfModulesForSelection) {
      setLiveCalculationError(
        "Seitenzahl konnte für die aktuelle Auswahl nicht berechnet werden.",
      );
      return;
    }

    const requestId = ++calcRequestIdRef.current;
    const timeoutId = window.setTimeout(() => {
      void (async () => {
        try {
          setIsLiveCalculating(true);
          setLiveCalculationError(undefined);

          const counts = await calculatePdfPageCounts(
            pdfBookDetails,
            pdfModulesForSelection,
            {
              colorMap: moduleColorMap,
            },
          );

          if (requestId !== calcRequestIdRef.current) return;

          const nextCalculation: CalculationSnapshot = {
            bPages: counts.bPages,
            cPages: counts.cPages,
            fullPageCount: counts.fullPageCount,
          };

          const previousCalculation = previousCalculationRef.current;
          const nextPrice = calculatePrintCost({
            amount: orderAmount,
            bPages: counts.bPages,
            cPages: counts.cPages,
            format: pickedFormat,
            bindingName: selectedBindingRuleKey,
            prices,
          });

          if (previousCalculation) {
            const previousPrice = calculatePrintCost({
              amount: orderAmount,
              bPages: previousCalculation.bPages,
              cPages: previousCalculation.cPages,
              format: pickedFormat,
              bindingName: selectedBindingRuleKey,
              prices,
            });

            setLiveDelta({
              pageDelta:
                nextCalculation.fullPageCount -
                previousCalculation.fullPageCount,
              priceDelta: nextPrice.total - previousPrice.total,
            });
          } else {
            setLiveDelta(null);
          }

          previousCalculationRef.current = nextCalculation;
          setLastCalculation(nextCalculation);
          setPreviewPrice(nextPrice);
          setTotalPagesCount(nextCalculation.fullPageCount);
          triggerBindingOverflowIfNeeded(nextCalculation.fullPageCount);
        } catch (error) {
          if (requestId !== calcRequestIdRef.current) return;
          const message =
            error instanceof Error ? error.message : String(error);
          setLiveCalculationError(handleWarningText(message));
        } finally {
          if (requestId === calcRequestIdRef.current) {
            setIsLiveCalculating(false);
          }
        }
      })();
    }, 320);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [
    hasLiveCalcBaseConfig,
    moduleColorMap,
    orderAmount,
    pdfBookDetails,
    pdfModulesForSelection,
    pickedFormat,
    selectedBindingRuleKey,
    setPreviewPrice,
    setTotalPagesCount,
    triggerBindingOverflowIfNeeded,
  ]);

  const handleOpenPreviewInNewTab = useCallback(() => {
    if (!previewFileURL) return;
    const opened = window.open(previewFileURL, "_blank", "noopener,noreferrer");
    if (!opened) {
      window.location.href = previewFileURL;
    }
  }, [previewFileURL]);

  function markPreviewFresh() {
    setPreviewConfigKey(configKey);
  }

  async function handleSaveConfig(
    event?: React.MouseEvent<HTMLButtonElement>,
  ): Promise<void> {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    if (!bookId) return;

    await saveConfigModules({
      bookId,
      modules: [
        ...pickedModules.COVER.map((id) => ({
          id,
          idx: 0,
          colorCode: moduleColorMap.get(id),
        })),
        ...getOrderedContentModuleIds(pickedModules).map((id, index) => ({
          id,
          idx: index + 1,
          colorCode: moduleColorMap.get(id),
        })),
        ...pickedModules.BINDING.map((id) => ({
          id,
          idx: -1,
        })),
      ],
    });
  }

  async function generateCheckoutPreview(usePreviewMode: boolean) {
    if (!pdfModulesForSelection) {
      throw new Error("Cover module not found");
    }

    if (previewFileURL) {
      URL.revokeObjectURL(previewFileURL);
      setPreviewFileURL(undefined);
    }

    const options = {
      format: pickedFormat,
      colorMap: moduleColorMap,
      ...(usePreviewMode ? {} : { addWatermark: true }),
    };

    const result = usePreviewMode
      ? await processPdfModulesPreview(
          pdfBookDetails,
          pdfModulesForSelection,
          options,
        )
      : await processPdfModules(
          pdfBookDetails,
          pdfModulesForSelection,
          options,
        );

    const blob = new Blob([result.pdfFile as BlobPart], {
      type: "application/pdf",
    });
    const url = URL.createObjectURL(blob);

    const recalculatedTotalPages = result.details.fullPageCount;
    if (typeof recalculatedTotalPages !== "number") {
      throw new Error("Genaue Gesamtseitenzahl konnte nicht ermittelt werden.");
    }

    setPreviewFileURL(url);
    const nextCalculation = {
      bPages: result.details.bPages,
      cPages: result.details.cPages,
      fullPageCount: recalculatedTotalPages,
    };
    setLastCalculation(nextCalculation);
    previousCalculationRef.current = nextCalculation;
    setTotalPagesCount(recalculatedTotalPages);
    markPreviewFresh();
    triggerBindingOverflowIfNeeded(recalculatedTotalPages);
  }

  async function prepareCheckoutStep() {
    try {
      setIsMakingPreview(true);
      await generateCheckoutPreview(false);
      await handleSaveConfig();
      activateStep("CHECKOUT");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const warning = handleWarningText(message);
      setConfigWarnings((prev) =>
        prev.includes(warning) ? prev : [...prev, warning],
      );
    } finally {
      setIsMakingPreview(false);
    }
  }

  async function refreshCheckoutPreview() {
    try {
      setIsRefreshingPreview(true);
      setIsMakingPreview(true);
      await generateCheckoutPreview(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const warning = handleWarningText(message);
      setConfigWarnings((prev) =>
        prev.includes(warning) ? prev : [...prev, warning],
      );
    } finally {
      setIsMakingPreview(false);
      setIsRefreshingPreview(false);
    }
  }

  function handleWarningText(text: string): string {
    const normalizedText = text.trim();
    if (!normalizedText) {
      return configWarningTexts.default;
    }

    switch (true) {
      case normalizedText.toLocaleLowerCase().includes("cover"):
        return configWarningTexts.cover;
      case normalizedText.toLocaleLowerCase().includes("planner"):
        return `${configWarningTexts.planner} (${normalizedText})`;
      default:
        return normalizedText;
    }
  }

  function formatCustomCoverError(text: string): string {
    const normalized = text.toLocaleLowerCase();

    if (
      normalized.includes("placeholder") ||
      normalized.includes("cover_image") ||
      normalized.includes("custom_image")
    ) {
      return "Die Umschlagvorlage hat kein Bildfeld für den Bild-Umschlag.";
    }

    if (
      normalized.includes("unsupported custom cover image format") ||
      normalized.includes("embed") ||
      normalized.includes("png") ||
      normalized.includes("jpeg")
    ) {
      return "Das Bild konnte nicht in den Umschlag eingesetzt werden. Bitte PNG oder JPEG verwenden.";
    }

    if (
      normalized.includes("custom_cover_template_url") ||
      normalized.includes("custom cover template") ||
      normalized.includes("cover template")
    ) {
      return "Die Umschlagvorlage konnte nicht geladen werden.";
    }

    return text;
  }

  function handlePickedItem(pickedItem: { id: string; type: string }) {
    const pickedModule = moduleLookupById.get(pickedItem.id);
    if (!pickedModule) return;

    const normalizedType = pickedModule.type.toLowerCase();
    const currentBucketForModule = findSelectedBucket(pickedModule.id);
    const targetContentBucket = currentStep === "POST" ? "POST" : "PRE";

    if (
      currentBucketForModule &&
      isContentModuleLike(pickedModule) &&
      (currentBucketForModule === "PRE" || currentBucketForModule === "POST") &&
      currentBucketForModule !== targetContentBucket &&
      (currentStep === "PRE" || currentStep === "POST")
    ) {
      setPickedModules((prev) => {
        const next = removeModuleFromBuckets(prev, pickedModule.id);
        return {
          ...next,
          [targetContentBucket]: [
            ...next[targetContentBucket],
            pickedModule.id,
          ],
        };
      });
      announceChange(
        `${pickedModule.name} wurde in den ${getBucketLabel(targetContentBucket)} verschoben.`,
      );
      setIsBookInfoOpen(true);
      return;
    }

    if (currentBucketForModule) {
      setPickedModules((prev) =>
        removeModuleFromBuckets(prev, pickedModule.id),
      );
      announceChange(
        `${pickedModule.name} wurde aus dem ${getBucketLabel(currentBucketForModule)} entfernt.`,
      );
      return;
    }

    if (
      isBindingModuleLike(pickedModule) &&
      totalPagesCount > 0 &&
      !isBindingAllowedForModule(pickedModule, totalPagesCount)
    ) {
      const warning =
        getBindingLimitMessageForModule(pickedModule, totalPagesCount) ??
        "Die gewählte Bindung ist für die aktuelle Seitenzahl nicht verfügbar.";
      setConfigWarnings((prev) =>
        prev.includes(warning) ? prev : [...prev, warning],
      );
      return;
    }

    const autoAdvanceStep = getAutoAdvanceStepForModule(
      currentStep,
      pickedModule,
    );

    setPickedModules((prev) => {
      const next = removeModuleFromBuckets(prev, pickedModule.id);

      if (
        isCoverModuleLike(pickedModule) ||
        normalizedType === FILTER_TYPES.COVER
      ) {
        announceChange(`${pickedModule.name} wurde als Umschlag gesetzt.`);
        return { ...next, COVER: [pickedModule.id] };
      }

      if (
        isBindingModuleLike(pickedModule) ||
        normalizedType === FILTER_TYPES.BINDING
      ) {
        announceChange(`${pickedModule.name} wurde als Bindung gesetzt.`);
        return { ...next, BINDING: [pickedModule.id] };
      }

      if (
        isPlannerModuleLike(pickedModule) ||
        normalizedType === FILTER_TYPES.PLANNER
      ) {
        announceChange(`${pickedModule.name} wurde als Wochenplaner gesetzt.`);
        return { ...next, PLANNER: [pickedModule.id] };
      }

      announceChange(
        `${pickedModule.name} wurde zum ${getBucketLabel(targetContentBucket)} hinzugefügt.`,
      );
      return {
        ...next,
        [targetContentBucket]: [...next[targetContentBucket], pickedModule.id],
      };
    });

    if (bindingOverflowEvent) {
      setBindingOverflowEvent(null);
    }
    if (modalId === "binding-overflow") {
      setModalId(undefined);
    }

    if (autoAdvanceStep) {
      setPendingAutoAdvanceStep(autoAdvanceStep);
    }

    setIsBookInfoOpen(true);
  }

  function isStepAccessible(stepId: ConfigStepId): boolean {
    switch (stepId) {
      case "COVER":
        return true;
      case "PRE":
        return completionStatus.hasCoverModule;
      case "PLANNER":
        return completionStatus.hasCoverModule;
      case "POST":
        return (
          completionStatus.hasCoverModule && completionStatus.hasPlannerModule
        );
      case "BINDING":
        return (
          completionStatus.hasCoverModule && completionStatus.hasPlannerModule
        );
      case "CHECKOUT":
        return isConfigComplete;
    }
  }

  function isStepComplete(stepId: ConfigStepId): boolean {
    switch (stepId) {
      case "COVER":
        return completionStatus.hasCoverModule;
      case "PRE":
        return true;
      case "PLANNER":
        return completionStatus.hasPlannerModule;
      case "POST":
        return true;
      case "BINDING":
        return completionStatus.hasBindingModule;
      case "CHECKOUT":
        return Boolean(previewFileURL) && !isCheckoutPreviewStale;
    }
  }

  function canContinueCurrentStep(): boolean {
    switch (currentStep) {
      case "COVER":
        return completionStatus.hasCoverModule;
      case "PRE":
        return completionStatus.hasCoverModule;
      case "PLANNER":
        return completionStatus.hasPlannerModule;
      case "POST":
        return completionStatus.hasPlannerModule;
      case "BINDING":
        return isConfigComplete;
      case "CHECKOUT":
        return isCheckoutPreviewStale;
    }
  }

  async function handleStepChange(stepId: ConfigStepId) {
    if (!isStepAccessible(stepId)) return;
    if (stepId === "CHECKOUT") {
      await prepareCheckoutStep();
      return;
    }
    activateStep(stepId);
  }

  async function handleNextStep() {
    if (currentStep === "CHECKOUT") {
      if (isCheckoutPreviewStale) {
        await prepareCheckoutStep();
      }
      return;
    }

    const nextStep = CONFIG_STEP_ORDER[currentStepIndex + 1];
    if (!nextStep) return;
    await handleStepChange(nextStep);
  }

  function handlePreviousStep() {
    if (currentStepIndex <= 0) return;
    activateStep(CONFIG_STEP_ORDER[currentStepIndex - 1]!);
  }

  prepareCheckoutStepRef.current = prepareCheckoutStep;

  useEffect(() => {
    if (!pendingAutoAdvanceStep) return;

    if (
      currentStep !== pendingAutoAdvanceStep ||
      !isAutoAdvanceStep(pendingAutoAdvanceStep)
    ) {
      setPendingAutoAdvanceStep(null);
      return;
    }

    const isReady =
      pendingAutoAdvanceStep === "COVER"
        ? completionStatus.hasCoverModule
        : pendingAutoAdvanceStep === "PLANNER"
          ? completionStatus.hasPlannerModule
          : isConfigComplete;

    if (!isReady || isMakingPreview) return;

    const nextStepIndex = CONFIG_STEP_ORDER.indexOf(pendingAutoAdvanceStep) + 1;
    const nextStep = CONFIG_STEP_ORDER[nextStepIndex];

    if (!nextStep) {
      setPendingAutoAdvanceStep(null);
      return;
    }

    const timeout = window.setTimeout(
      () => {
        setPendingAutoAdvanceStep(null);
        if (nextStep === "CHECKOUT") {
          void prepareCheckoutStepRef.current?.();
          return;
        }
        activateStep(nextStep);
      },
      pendingAutoAdvanceStep === "BINDING" ? 500 : 420,
    );

    return () => window.clearTimeout(timeout);
  }, [
    activateStep,
    completionStatus.hasCoverModule,
    completionStatus.hasPlannerModule,
    currentStep,
    isConfigComplete,
    isMakingPreview,
    pendingAutoAdvanceStep,
  ]);

  function handleConfigWarning(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    const warnId = event.currentTarget.id.split("-")[1];
    setConfigWarnings((prev) =>
      prev.filter((_, index) => index !== Number(warnId)),
    );
  }

  const handleNameSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!bookId || !nameInput) return;
    updateName({ id: bookId, name: nameInput });
  };

  const renderMobilePdfFallback = (className = "") => {
    if (!previewFileURL) return null;
    return (
      <div
        className={`field-shell bg-pirrot-blue-950/5 flex size-full flex-col items-center justify-center gap-3 p-4 text-center ${className}`}
      >
        <p className="text-sm">
          Auf iPad und Mobilgeräten wird die PDF-Vorschau hier nicht zuverlässig
          angezeigt.
        </p>
        <p className="text-info-800 text-xs">
          Bitte öffnen Sie die Vorschau in einem neuen Tab.
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={handleOpenPreviewInNewTab}
            className="btn-solid px-3 py-2 text-sm"
          >
            Vorschau öffnen
          </button>
          <a
            href={previewFileURL}
            download="vorschau.pdf"
            className="btn-soft px-3 py-2 text-sm"
          >
            PDF herunterladen
          </a>
        </div>
      </div>
    );
  };

  const renderPreviewDisclaimer = () => (
    <p className="text-info-800 text-xs">
      Hinweis: Dies ist nur eine Vorschau, daher können einzelne Seiten fehlen.
    </p>
  );

  const renderModalContent = () => {
    switch (modalId) {
      case "info":
        return (
          <div className="content-card text-info-950 w-full max-w-xl p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">Planerinfo</h3>
              <button
                type="button"
                onClick={() => setModalId(undefined)}
                className="btn-soft rounded p-2"
              >
                <XIcon className="size-6" />
              </button>
            </div>
            <ConfigInfoForm
              onAbortForm={() => setModalId(undefined)}
              initialFormState={
                existingBook
                  ? {
                      id: existingBook.id,
                      name: existingBook.bookTitle,
                      sub: existingBook.subTitle,
                      country: existingBook.country,
                      region: existingBook.region,
                      period: {
                        start: existingBook.planStart
                          .toISOString()
                          .slice(0, 16),
                        end: existingBook.planEnd?.toISOString().slice(0, 16),
                      },
                    }
                  : undefined
              }
            />
          </div>
        );
      case "dates":
        return (
          <div className="content-card text-info-950 w-full max-w-xl p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">Eigene Termine</h3>
              <button
                type="button"
                onClick={() => setModalId(undefined)}
                className="btn-soft rounded p-2"
              >
                <XIcon className="size-6" />
              </button>
            </div>
            <CustomDatesForm bookId={bookId!} />
          </div>
        );
      case "custom-modules":
        return bookId ? (
          <div className="text-info-950 w-full max-w-5xl p-3">
            <div className="content-card flex flex-col gap-4 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-bold">Eigene Inhalte</h3>
                  <p className="text-info-800 text-sm">
                    Eigene PDFs anlegen und direkt in die normale Modulauswahl
                    übernehmen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalId(undefined)}
                  className="btn-soft rounded p-2"
                >
                  <XIcon className="size-6" />
                </button>
              </div>
              <UserModules
                bookId={bookId}
                existingTips={matchingTips}
                onCreated={() => {
                  setModalId(undefined);
                  announceChange(
                    "Eigenes Modul gespeichert. Es erscheint jetzt direkt in der Auswahl.",
                  );
                }}
              />
            </div>
          </div>
        ) : null;
      case "custom-cover":
        return (
          <div className="content-card text-info-950 w-full max-w-2xl p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-2xl font-bold">Bild-Umschlag erstellen</h3>
                <p className="text-info-800 text-sm">
                  Vorschau des zugeschnittenen Coverbilds. Beim Bestätigen wird
                  daraus ein vierseitiger Umschlag erstellt und ausgewählt.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setModalId(undefined);
                  resetCustomCoverUpload();
                  setCustomCoverUploadVersion((prev) => prev + 1);
                }}
                className="btn-soft rounded p-2"
                disabled={isUploadingCustomCover}
              >
                <XIcon className="size-6" />
              </button>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-[220px_1fr]">
              <div className="field-shell bg-white p-2">
                <div className="border-pirrot-blue-200 relative mx-auto aspect-[210/297] w-full max-w-[200px] overflow-hidden rounded-lg border">
                  {customCoverPreviewUrl ? (
                    <NextImage
                      src={customCoverPreviewUrl}
                      alt="A4 Cover Vorschau"
                      fill
                      sizes="200px"
                      className="object-cover"
                      unoptimized
                    />
                  ) : null}
                </div>
              </div>
              <div className="flex flex-col justify-between gap-4">
                <div className="field-shell p-3">
                  <p className="text-info-800 text-xs font-bold tracking-[0.16em] uppercase">
                    Moduldatei
                  </p>
                  <p className="mt-1 font-bold">
                    {customCoverFile?.name ?? "Bild-Umschlag"}
                  </p>
                  <p className="text-info-800 mt-2 text-sm">
                    Das gespeicherte Modul wird aus der Umschlagvorlage, diesem
                    Bild und leeren Ergänzungsseiten im Format DIN A4 plus
                    Anschnitt erzeugt.
                  </p>
                </div>

                {customCoverUploadError ? (
                  <div className="border-pirrot-red-300 bg-pirrot-red-100/60 rounded-lg border px-3 py-2 text-sm">
                    {customCoverUploadError}
                  </div>
                ) : null}

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setModalId(undefined);
                      resetCustomCoverUpload();
                      setCustomCoverUploadVersion((prev) => prev + 1);
                    }}
                    className="btn-soft px-3 py-2"
                    disabled={isUploadingCustomCover}
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={() => void confirmCustomCoverCreation()}
                    className="btn-solid flex items-center gap-2 px-3 py-2"
                    disabled={isUploadingCustomCover || !customCoverFile}
                  >
                    Erstellen
                    {isUploadingCustomCover ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      case "binding-overflow":
        return (
          <div className="content-card text-info-950 w-full max-w-2xl p-4">
            <div className="flex flex-col gap-2">
              <h3 className="text-2xl font-bold">
                Bindung wechseln erforderlich
              </h3>
              <p>
                Die gewählte Bindung{" "}
                <b>{bindingOverflowEvent?.invalidBindingName ?? "Unbekannt"}</b>{" "}
                passt nicht zur aktuellen Seitenzahl von{" "}
                <b>{bindingOverflowEvent?.totalPages ?? totalPagesCount}</b>.
              </p>
              <p>Bitte wählen Sie eine passende Alternative:</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
              {bindingOverflowSuggestions.map((bindingOption) => (
                <button
                  key={bindingOption.id}
                  type="button"
                  className="field-shell hover:bg-pirrot-blue-50 flex flex-col items-start gap-1 p-3 text-left transition-colors"
                  onClick={() =>
                    handlePickedItem({
                      id: bindingOption.id,
                      type: bindingOption.type,
                    })
                  }
                >
                  <span className="font-bold">{bindingOption.name}</span>
                  <span className="text-xs first-letter:uppercase">
                    {bindingOption.type}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      case "preview":
        return (
          <div className="content-card text-info-950 w-full max-w-[90vw] p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-bold">Vorschau</h3>
              <button
                type="button"
                onClick={() => setModalId(undefined)}
                className="btn-soft rounded p-2"
              >
                <XIcon className="size-6" />
              </button>
            </div>
            <div className="flex h-[85vh] min-h-0 w-full flex-col gap-2 p-1">
              {previewFileURL ? (
                <>
                  {renderPreviewDisclaimer()}
                  {useMobilePdfFallback ? (
                    renderMobilePdfFallback("min-h-0 flex-1")
                  ) : (
                    <div className="min-h-0 flex-1">
                      <iframe
                        src={previewFileURL}
                        title="PDF Preview"
                        width="100%"
                        height="100%"
                        className="border-info-950/5 h-full w-full border"
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-4">
                  <LoadingSpinner />
                </div>
              )}
            </div>
          </div>
        );
      case "name":
        return (
          <div className="content-card text-info-950 w-full max-w-xl p-3">
            <form onSubmit={handleNameSubmit}>
              <div className="flex flex-col gap-2">
                <label htmlFor="project-name" className="form-label">
                  Projektname
                </label>
                <div className="flex gap-2">
                  <input
                    id="project-name"
                    className="field-shell w-full px-3 py-2.5"
                    onChange={(event) => setNameInput(event.target.value)}
                    value={nameInput ?? ""}
                  />
                  <button type="submit" className="btn-solid rounded p-2">
                    <CheckIcon className="size-6" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalId(undefined)}
                    className="btn-soft rounded p-2"
                  >
                    <XIcon className="size-6" />
                  </button>
                </div>
              </div>
            </form>
          </div>
        );
      default:
        return null;
    }
  };

  if (!existingBook) {
    return (
      <div className="relative flex h-screen w-full flex-col items-center justify-center gap-8 overflow-hidden">
        <h2 className="text-pirrot-red-400 text-2xl font-bold">
          Kein Buch gefunden.
        </h2>
        <p className="w-full max-w-xl">
          Unsere Suche hat leider für Sie keine Buchvorschau gefunden. Kehren
          Sie zum Startbildschirm zurück oder loggen Sie sich ein.
        </p>
        <div className="w-full max-w-xl">
          <Login />
        </div>
        <Link
          href="/"
          className="underline underline-offset-4 transition-all duration-300 hover:underline-offset-8"
        >
          ← Zurück zum Anfang
        </Link>
      </div>
    );
  }

  const partnerBookMeta = existingBook as typeof existingBook & {
    partnerCampaignExpiresAt?: Date | string | null;
    partnerOrderSubmittedAt?: Date | string | null;
  };
  const partnerCampaignExpiresAt =
    existingBook.sourceType === "PARTNER_TEMPLATE" &&
    partnerBookMeta.partnerCampaignExpiresAt
      ? new Date(partnerBookMeta.partnerCampaignExpiresAt)
      : null;
  const hasPartnerOrderBeenSubmitted =
    existingBook.sourceType === "PARTNER_TEMPLATE" &&
    Boolean(partnerBookMeta.partnerOrderSubmittedAt);
  const isPartnerCampaignExpired = partnerCampaignExpiresAt
    ? partnerCampaignExpiresAt.getTime() < Date.now()
    : false;
  const isPartnerTemplateFlagActive =
    existingBook.sourceType === "PARTNER_TEMPLATE" &&
    !isPartnerCampaignExpired &&
    !hasPartnerOrderBeenSubmitted;
  const showPartnerTemplateBanner =
    Boolean(partnerToken) || isPartnerTemplateFlagActive;

  return (
    <>
      <div
        className={`${modalId !== undefined && modalId !== "login-prompt" ? "blur" : ""} relative z-10 flex h-screen w-full flex-col justify-between overflow-hidden md:flex-row`}
      >
        <div
          className={`${isFilterOpen ? "sticky top-0 md:w-sm" : ""} border-pirrot-blue-950/10 bg-pirrot-blue-100/65 relative flex flex-col gap-2 overflow-y-auto border-b backdrop-blur-sm md:h-screen lg:border-r`}
        >
          <div className="flex items-center gap-2 p-2">
            {bookId ? (
              <button
                type="button"
                onClick={() => setModalId("custom-modules")}
                className="btn-solid p-2"
                aria-label="Eigene Inhalte öffnen"
                title="Eigene Inhalte"
              >
                <Plus className="size-5" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsFilterOpen((prev) => !prev)}
              className="btn-soft p-2"
            >
              {isFilterOpen ? <XIcon /> : <ChevronDown />}
            </button>
          </div>

          {isFilterOpen ? (
            <div className="flex w-full flex-col gap-2 p-2 pt-0">
              <div className="content-card flex flex-col gap-2 p-3">
                <h3 className="font-bold">Aktueller Schritt</h3>
                <p className={`text-xl font-bold ${STEP_ACCENTS[currentStep]}`}>
                  {STEP_LABELS[currentStep]}
                </p>
                <p className="text-info-800 text-sm">
                  {currentStepConfig.desc}
                </p>
                <div className="field-shell flex items-start gap-2 p-2 text-sm">
                  <InfoIcon
                    className={`mt-0.5 size-4 shrink-0 ${STEP_ACCENTS[currentStep]}`}
                  />
                  <p className="text-info-800">{currentStepConfig.hint}</p>
                </div>
              </div>

              {currentStep !== "CHECKOUT" ? (
                <>
                  <SearchInput
                    value={searchFilterValue}
                    onChange={setSearchFilterValue}
                    onClear={clearSearch}
                  />
                  <ToggleSwitch
                    checked={onlyPickedModules}
                    onChange={setOnlyPickedModules}
                    label="Nur aktuelle Auswahl"
                  />
                </>
              ) : null}

              <div className="content-card flex flex-col gap-2 p-3">
                <h3 className="font-bold">Live-Hinweis</h3>
                <p className="text-info-800 text-sm">
                  {liveChangeNotice ??
                    "Änderungen an Modulen werden hier sofort mit dem Zielbereich eingeblendet."}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="field-shell p-2">
                    <p className="text-info-800 text-[11px] tracking-wide uppercase">
                      Seiten
                    </p>
                    <p className="text-lg font-bold">{totalPagesCount}</p>
                    {liveDelta ? (
                      <p className="text-info-800 text-xs">
                        {formatSignedPages(liveDelta.pageDelta)}
                      </p>
                    ) : null}
                  </div>
                  <div className="field-shell p-2">
                    <p className="text-info-800 text-[11px] tracking-wide uppercase">
                      Preis
                    </p>
                    <p className="text-lg font-bold">
                      {(previewPrice.total / 100).toFixed(2)} €
                    </p>
                    {liveDelta ? (
                      <p className="text-info-800 text-xs">
                        {formatSignedEuroCents(liveDelta.priceDelta)}
                      </p>
                    ) : null}
                  </div>
                </div>
                {isLiveCalculating ? (
                  <p className="text-pirrot-blue-700 text-xs">
                    Seiten und Kosten werden gerade neu berechnet…
                  </p>
                ) : null}
                {liveCalculationError ? (
                  <p className="text-pirrot-red-500 text-xs">
                    {liveCalculationError}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        <div
          ref={mainContentRef}
          className="flex w-full max-w-screen-2xl flex-[5] flex-col gap-8 overflow-y-auto"
        >
          <div className="flex w-full flex-col gap-8 p-2 lg:p-4">
            {showPartnerTemplateBanner ? (
              <div className="bg-pirrot-green-100 border-pirrot-green-300 flex flex-col items-start justify-between gap-4 rounded-lg border p-4 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                  <div className="bg-pirrot-green-300 rounded-full p-2">
                    <GiftIcon className="size-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-pirrot-green-600 text-lg font-bold">
                      Partner-Vorlage
                    </h3>
                    <p className="text-pirrot-green-700 text-sm">
                      {existingBook.modules.length ?? 0} Module inklusive •
                      Zusätzliche Module kosten Extra
                    </p>
                  </div>
                </div>
                <div className="text-pirrot-green-600 bg-pirrot-green-50 rounded-full px-3 py-1 text-sm">
                  <span className="font-semibold">Kostenlos</span> inkludiert
                </div>
              </div>
            ) : null}

            <div className="content-card flex w-full flex-col gap-4 p-3">
              <div className="pb-1">
                <Link
                  href="/"
                  className="underline underline-offset-4 transition-all duration-300 hover:underline-offset-8"
                >
                  ← Zurück zum Anfang
                </Link>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setModalId("name")}
                  className="font-cairo flex items-center gap-3 text-3xl font-bold tracking-tight lg:text-5xl"
                >
                  {nameInput} <PenBox className="size-8 lg:size-9" />
                </button>
                <div className="flex items-center gap-2 sm:gap-4">
                  <button
                    type="button"
                    onClick={() => setModalId("info")}
                    className="btn-soft flex items-center gap-2 p-2"
                  >
                    <InfoIcon className="size-5" />
                    <span className="hidden sm:block">Planerinfo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setModalId(isLoggedIn ? "dates" : "login-prompt")
                    }
                    className="btn-soft flex items-center gap-2 p-2"
                  >
                    <CalendarDays className="size-5" />
                    <span className="hidden sm:block">Termine</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsBookInfoOpen((prev) => !prev)}
                    className="btn-soft flex items-center gap-2 p-2"
                  >
                    <BookA className="size-5" />
                    <span className="hidden sm:block">Buchaufbau</span>
                  </button>
                </div>
              </div>

              <hr className="w-full rounded-full border border-white/50" />
            </div>

            <div
              ref={stickyStepHeaderRef}
              className="content-card sticky top-2 z-[59] flex w-full flex-col gap-2 p-2"
            >
              <div className="flex gap-2 overflow-x-auto px-1 pt-2 pb-2">
                {configSteps.map((step, index) => {
                  const isCurrentStep = step.id === currentStep;
                  const isComplete = isStepComplete(step.id);
                  const isAccessible = isStepAccessible(step.id);

                  return (
                    <button
                      key={step.id}
                      type="button"
                      disabled={!isAccessible || isMakingPreview}
                      onClick={() => void handleStepChange(step.id)}
                      title={step.desc}
                      className={`min-w-36 rounded-xl border px-3 py-2 text-left transition ${
                        isCurrentStep
                          ? `${getStepThemeClasses(step.id)} bg-white shadow-md`
                          : isComplete
                            ? "border-pirrot-green-300 bg-pirrot-green-100/60 shadow-sm"
                            : `field-shell ${getStepThemeClasses(step.id)}`
                      } ${!isAccessible ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5 hover:shadow-md"}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="field-shell inline-flex items-center gap-2 rounded-full px-2 py-1 text-[11px] font-bold tracking-wide uppercase">
                          {getStepIcon(step.id)}
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        {isComplete ? (
                          <span className="text-pirrot-green-700 text-xs font-bold">
                            Fertig
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={`mt-1 truncate text-sm font-bold ${STEP_ACCENTS[step.id]}`}
                      >
                        {step.title}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div
                className={`field-shell flex items-center gap-2 px-3 py-2 ${getStepThemeClasses(currentStep)}`}
              >
                <InfoIcon
                  className={`size-4 shrink-0 ${STEP_ACCENTS[currentStep]}`}
                />
                <p className="text-info-800 min-w-0 text-sm leading-snug">
                  {currentStepConfig.hint}
                </p>
              </div>
            </div>

            {liveChangeNotice ? (
              <div className="border-pirrot-green-300 bg-pirrot-green-100/70 text-pirrot-green-800 rounded-xl border px-4 py-3 shadow-sm">
                {liveChangeNotice}
              </div>
            ) : null}

            <div className="flex flex-col gap-4">
              {currentStep !== "CHECKOUT" ? (
                <>
                  <div className="flex flex-col gap-4">
                    {isPrimaryModuleStep ? (
                      <ModuleCarousel
                        items={visibleModules}
                        isPicked={(moduleId) =>
                          isConfigModuleSelected(pickedModules, moduleId)
                        }
                        onPickedItem={handlePickedItem}
                        getDisabledState={(moduleId) =>
                          bindingAvailabilityById.get(moduleId) ?? {
                            disabled: false,
                          }
                        }
                      />
                    ) : (
                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <button
                          onClick={() => setModalId("custom-modules")}
                          className="content-card flex flex-col items-center justify-center"
                        >
                          <Plus />
                          Eigenes Modul
                        </button>
                        {visibleModules.map((moduleItem) => (
                          <ModuleItem
                            key={moduleItem.id}
                            isPicked={isConfigModuleSelected(
                              pickedModules,
                              moduleItem.id,
                            )}
                            item={moduleItem}
                            onPickedItem={handlePickedItem}
                            isDisabled={
                              bindingAvailabilityById.get(moduleItem.id)
                                ?.disabled
                            }
                            disabledReason={
                              bindingAvailabilityById.get(moduleItem.id)?.reason
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {currentStep === "COVER" ? (
                    <div className="content-card flex flex-col gap-3 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-pirrot-blue-600 text-xs font-bold tracking-[0.16em] uppercase">
                            Alternativ
                          </p>
                          <h3 className="text-lg font-bold">
                            Eigenes Cover aus Bild
                          </h3>
                          <p className="text-info-800 text-sm">
                            Das Bild wird automatisch auf A4-Proportion ( ~5:7 )
                            mittig zugeschnitten und als Umschlag angelegt.
                          </p>
                        </div>
                      </div>

                      <div className="field-shell min-h-56 p-1">
                        <FileUpload
                          key={`custom-cover-upload-${customCoverUploadVersion}`}
                          fieldName={
                            isUploadingCustomCover
                              ? "Wird vorbereitet..."
                              : "Bild für Umschlag hochladen"
                          }
                          accept={[
                            "image/png",
                            "image/jpeg",
                            "image/jpg",
                            "image/webp",
                          ]}
                          onPickedFile={(file) => {
                            void handleCustomCoverImageUpload(file);
                          }}
                          resetFile={resetCustomCoverUpload}
                        />
                      </div>

                      {isUploadingCustomCover ? (
                        <div className="field-shell flex items-center gap-2 p-2 text-sm">
                          <LoaderCircle className="size-4 animate-spin" />
                          Bild wird vorbereitet...
                        </div>
                      ) : null}

                      {customCoverUploadError ? (
                        <div className="border-pirrot-red-300 bg-pirrot-red-100/60 rounded-lg border px-3 py-2 text-sm">
                          {customCoverUploadError}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                  {visibleModules.length === 0 ? (
                    <div className="content-card flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center">
                      <h3 className="text-2xl font-bold">
                        Keine Module gefunden
                      </h3>
                      <p className="text-info-800 max-w-lg">
                        Passen Sie die Suche an oder wechseln Sie den Schritt,
                        um weitere Module zu sehen.
                      </p>
                    </div>
                  ) : null}
                </>
              ) : (
                <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="flex flex-col gap-4">
                    <div className="content-card flex flex-col gap-3 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="text-2xl font-bold">
                            Zusammenfassung
                          </h3>
                          <p className="text-info-800 max-w-2xl text-sm">
                            Prüfen Sie Ihren Planer vor dem Bestellen. Die
                            Vorschau und die Kosten basieren auf der zuletzt
                            berechneten Konfiguration.
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => void prepareCheckoutStep()}
                            disabled={isMakingPreview}
                            className="btn-soft flex items-center gap-2 px-3 py-2 disabled:opacity-25"
                          >
                            Neu berechnen
                            {isMakingPreview ? (
                              <LoaderCircle className="size-4 animate-spin" />
                            ) : null}
                          </button>
                          {previewFileURL ? (
                            <button
                              type="button"
                              onClick={() => setModalId("preview")}
                              className="btn-soft flex items-center gap-2 px-3 py-2"
                            >
                              Vorschau <EyeIcon className="size-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <div className="field-shell p-3">
                          <p className="text-info-800 text-xs tracking-wide uppercase">
                            Format
                          </p>
                          <p className="text-xl font-bold">{pickedFormat}</p>
                        </div>
                        <div className="field-shell p-3">
                          <p className="text-info-800 text-xs tracking-wide uppercase">
                            Stückzahl
                          </p>
                          <p className="text-xl font-bold">{orderAmount}x</p>
                        </div>
                        <div className="field-shell p-3">
                          <p className="text-info-800 text-xs tracking-wide uppercase">
                            Seiten
                          </p>
                          <p className="text-xl font-bold">
                            {lastCalculation?.fullPageCount ?? totalPagesCount}
                          </p>
                          {liveDelta ? (
                            <p className="text-info-800 text-xs">
                              {formatSignedPages(liveDelta.pageDelta)}
                            </p>
                          ) : null}
                        </div>
                        <div className="field-shell p-3">
                          <p className="text-info-800 text-xs tracking-wide uppercase">
                            Gesamtpreis
                          </p>
                          <p className="text-xl font-bold">
                            {(previewPrice.total / 100).toFixed(2)} €
                          </p>
                          {liveDelta ? (
                            <p className="text-info-800 text-xs">
                              {formatSignedEuroCents(liveDelta.priceDelta)}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {isLiveCalculating ? (
                        <div className="border-pirrot-blue-300 bg-pirrot-blue-50 rounded-xl border px-3 py-2 text-sm">
                          Seiten und Kosten werden automatisch neu berechnet.
                        </div>
                      ) : null}
                      {liveCalculationError ? (
                        <div className="border-pirrot-red-300 bg-pirrot-red-100/60 rounded-xl border px-3 py-2 text-sm">
                          {liveCalculationError}
                        </div>
                      ) : null}
                      {isCheckoutPreviewStale ? (
                        <div className="border-warning-300 bg-warning-100/60 rounded-xl border px-3 py-2 text-sm">
                          Die Vorschau ist nach Ihren letzten Änderungen
                          veraltet. Bitte berechnen Sie den Checkout erneut.
                        </div>
                      ) : null}
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <SelectedModuleList
                        title="Umschlag"
                        modules={modulesByStep.cover}
                        emptyText="Kein Umschlag ausgewählt."
                      />
                      <SelectedModuleList
                        title="Bindung"
                        modules={modulesByStep.binding}
                        emptyText="Keine Bindung ausgewählt."
                      />
                      <SelectedModuleList
                        title="Vorderer Teil"
                        modules={modulesByStep.pre}
                        emptyText="Keine Module im vorderen Teil."
                      />
                      <SelectedModuleList
                        title="Wochenplaner"
                        modules={modulesByStep.planner}
                        emptyText="Kein Wochenplaner ausgewählt."
                      />
                      <div className="md:col-span-2">
                        <SelectedModuleList
                          title="Hinterer Teil"
                          modules={modulesByStep.post}
                          emptyText="Keine Module im hinteren Teil."
                        />
                      </div>
                    </div>

                    <div className="content-card flex flex-col gap-3 p-4">
                      <h3 className="text-xl font-bold">
                        Rechtliches vor dem Bestellen
                      </h3>
                      <div className="field-shell flex items-center gap-2 px-3 py-2">
                        <input
                          id="agb"
                          type="checkbox"
                          checked={acceptPolicies.agb}
                          onChange={() =>
                            setAcceptPolicies((prev) => ({
                              ...prev,
                              agb: !prev.agb,
                            }))
                          }
                        />
                        <label htmlFor="agb" className="form-label">
                          Allgemeine Geschäftsbedingungen
                        </label>
                      </div>
                      <div className="field-shell flex items-center gap-2 px-3 py-2">
                        <input
                          id="data"
                          type="checkbox"
                          checked={acceptPolicies.data}
                          onChange={() =>
                            setAcceptPolicies((prev) => ({
                              ...prev,
                              data: !prev.data,
                            }))
                          }
                        />
                        <label htmlFor="data" className="form-label">
                          Datenschutzeinwilligung
                        </label>
                      </div>
                    </div>

                    <div
                      className={`content-card p-4 ${acceptPoliciesValid ? "" : "pointer-events-none opacity-60"}`}
                    >
                      <ConfigOrderForm
                        bookId={bookId!}
                        quantity={orderAmount}
                        format={pickedFormat}
                        partnerToken={partnerToken}
                        onAbortForm={() => activateStep("BINDING")}
                      />
                    </div>
                  </div>

                  <div
                    className="content-card flex max-h-[70vh] flex-col gap-3 p-4 lg:sticky"
                    style={{ top: checkoutPreviewStickyTop }}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-xl font-bold">Druckvorschau</h3>
                      {isRefreshingPreview ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : null}
                    </div>
                    {previewFileURL ? (
                      <>
                        {renderPreviewDisclaimer()}
                        {useMobilePdfFallback ? (
                          renderMobilePdfFallback("flex-1")
                        ) : (
                          <div className="min-h-0 flex-1">
                            <iframe
                              src={previewFileURL}
                              title="PDF Preview"
                              width="100%"
                              height="100%"
                              className="border-info-950/5 aspect-5/7 w-full border"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="flex size-full flex-col items-center justify-center gap-4 text-center">
                        <p className="max-w-md">
                          Für den Checkout wird zuerst eine aktuelle Vorschau
                          erzeugt.
                        </p>
                        <button
                          type="button"
                          onClick={() => void prepareCheckoutStep()}
                          disabled={isMakingPreview}
                          className="btn-solid px-4 py-2 disabled:opacity-25"
                        >
                          Vorschau erzeugen
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div
          className={`${isBookInfoOpen ? "h-full lg:w-sm" : ""} border-pirrot-blue-950/10 bg-pirrot-blue-100/65 relative flex flex-col gap-2 overflow-y-auto border-t backdrop-blur-sm md:h-screen lg:border-l`}
        >
          <div className="p-2">
            <button
              type="button"
              onClick={() => setIsBookInfoOpen((prev) => !prev)}
              className="btn-soft p-2"
            >
              <BookA className="size-5" />
            </button>
          </div>

          {isBookInfoOpen ? (
            <>
              <div className="content-card mx-2 flex flex-col gap-3 p-3">
                <div className="flex flex-col gap-2">
                  <h3 className="font-bold">Stückzahl</h3>
                  <input
                    className="field-shell w-full px-3 py-2.5"
                    type="number"
                    min={1}
                    onChange={(event) =>
                      setOrderAmount(Number(event.target.value))
                    }
                    value={orderAmount}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <h3 className="font-bold">Buchformat</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setPickedFormat("DIN A5")}
                      className={`btn-soft flex-1 p-2 ${pickedFormat === "DIN A5" ? "border-pirrot-blue-700/50 border-2" : ""}`}
                    >
                      DIN A5
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickedFormat("DIN A4")}
                      className={`btn-soft flex-1 p-2 ${pickedFormat === "DIN A4" ? "border-pirrot-blue-700/50 border-2" : ""}`}
                    >
                      DIN A4
                    </button>
                  </div>
                </div>
              </div>

              <div className="content-card mx-2 flex flex-col gap-2 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">Kostenübersicht</h3>
                  <button
                    type="button"
                    onClick={() => setIsCostOpen((prev) => !prev)}
                    className="btn-soft p-1.5"
                  >
                    <ChevronDown
                      className={`${isCostOpen ? "rotate-180" : ""} transition-transform`}
                    />
                  </button>
                </div>
                <div
                  className={`field-shell p-3 ${isCostOpen ? "" : "hidden"}`}
                >
                  <div className="flex flex-col gap-1 text-sm">
                    <h3>Seiten gesamt: {totalPagesCount}</h3>
                    {liveDelta ? (
                      <p className="text-info-800 text-xs">
                        Änderung: {formatSignedPages(liveDelta.pageDelta)}
                      </p>
                    ) : null}
                    <h5>Kosten: {(previewPrice.total / 100).toFixed(2)} €</h5>
                    {liveDelta ? (
                      <p className="text-info-800 text-xs">
                        Preisänderung:{" "}
                        {formatSignedEuroCents(liveDelta.priceDelta)}
                      </p>
                    ) : null}
                    <h5>
                      pro Planer: {(previewPrice.single / 100).toFixed(2)} €
                    </h5>
                    {isLiveCalculating ? (
                      <p className="text-pirrot-blue-700">
                        Live-Berechnung läuft…
                      </p>
                    ) : null}
                    {liveCalculationError ? (
                      <p className="text-pirrot-red-500">
                        {liveCalculationError}
                      </p>
                    ) : null}
                    {isCheckoutPreviewStale ? (
                      <p className="text-warning-800">
                        Vorschau und exakte Seitenzahl sind nach den letzten
                        Änderungen veraltet.
                      </p>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <button
                    className="btn-soft flex gap-2 px-4 py-2"
                    type="button"
                    disabled={isMakingPreview || !isConfigComplete}
                    onClick={() => void refreshCheckoutPreview()}
                  >
                    Vorschau neu
                    {isMakingPreview ? (
                      <LoaderCircle className="size-4 animate-spin" />
                    ) : null}
                  </button>
                  {previewFileURL ? (
                    <button
                      type="button"
                      onClick={() => setModalId("preview")}
                      className="btn-soft p-2"
                    >
                      <EyeIcon />
                    </button>
                  ) : null}
                </div>

                {configWarnings.length > 0 ? (
                  <div className="mt-2 flex flex-col gap-2">
                    {configWarnings.map((warning, index) => (
                      <button
                        key={warning}
                        id={`warning-${index}`}
                        type="button"
                        onClick={handleConfigWarning}
                        className="border-pirrot-red-500/50 bg-pirrot-red-300/80 flex w-full gap-2 rounded border p-2 text-start text-sm"
                      >
                        <XIcon className="size-4 shrink-0" />
                        <span>{warning}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="p-1">
                <ModuleChanger
                  items={pickedModules}
                  modules={modules as never[]}
                  onItemsChange={(items) => setPickedModules(items)}
                  initialColorMap={moduleColorMap}
                  onColorMapChange={setModuleColorMap}
                />
              </div>

              <div className="border-info-950/5 bg-pirrot-blue-100/85 sticky bottom-1 mt-auto flex w-full flex-col gap-2 border-t p-2 backdrop-blur-sm">
                <button
                  type="button"
                  disabled={isSavingConfig}
                  onClick={() => void handleSaveConfig()}
                  className="btn-soft flex justify-center gap-2 p-2 font-bold disabled:opacity-25"
                >
                  {isSavingConfig ? <LoadingSpinner /> : "Speichern"}
                  <SaveIcon className="size-5" />
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={currentStepIndex === 0 || isMakingPreview}
                    onClick={handlePreviousStep}
                    className="btn-soft flex flex-1 justify-center gap-2 p-2 font-bold disabled:opacity-25"
                  >
                    <ArrowLeft className="size-5" />
                    Zurück
                  </button>
                  <button
                    type="button"
                    disabled={!canContinueCurrentStep() || isMakingPreview}
                    onClick={() => void handleNextStep()}
                    className="btn-solid flex flex-1 justify-center gap-2 p-2 font-bold disabled:opacity-25"
                  >
                    {currentStep === "CHECKOUT"
                      ? "Aktualisieren"
                      : currentStep === "BINDING"
                        ? "Checkout"
                        : "Weiter"}
                    <ArrowRight className="size-5" />
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>

      <Modal
        selector="modal-hook"
        show={modalId !== undefined && modalId !== "login-prompt"}
      >
        <div className="absolute top-0 left-0 z-[69] flex h-full w-full items-center justify-center">
          <div className="bg-info-950/95 flex size-full items-center justify-center">
            {renderModalContent()}
          </div>
        </div>
      </Modal>

      <LoginPromptModal
        show={modalId === "login-prompt"}
        onClose={() => setModalId(undefined)}
      />
    </>
  );
}

export const configWarningTexts = {
  cover:
    "Umschläge müssen genau 4 Seiten haben. Beachten Sie die Datei größe. (max. 5MB)",
  planner:
    "Der Planer konnte nicht für den Checkout vorbereitet werden. Bitte prüfen Sie die ausgewählten Planer-Module und versuchen Sie es erneut.",
  default:
    "Der Checkout konnte nicht vorbereitet werden. Bitte versuchen Sie es erneut.",
};
