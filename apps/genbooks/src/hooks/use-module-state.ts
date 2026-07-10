import type { BookPart } from "@prisma/client";
import { useState } from "react";
import {
  type ConfigModules,
  splitStoredModulesIntoConfigBuckets,
} from "@/util/book/configurator";

type InitialModuleItem = {
  id: string;
  idx: number;
  part: BookPart;
  color?: number;
};

export function useModuleState(initialBook?: {
  name?: string | null;
  modules?: InitialModuleItem[];
}) {
  const [previewPrice, setPreviewPrice] = useState<{
    single: number;
    total: number;
  }>({ single: 200, total: 200 });
  const [orderAmount, setOrderAmount] = useState<number>(1);
  const [nameInput, setNameInput] = useState<string | null>(
    initialBook?.name ?? null,
  );

  const initialModules = splitStoredModulesIntoConfigBuckets(
    initialBook?.modules ?? [],
  );

  const [pickedModules, setPickedModules] =
    useState<ConfigModules>(initialModules);

  const [pickedFormat, setPickedFormat] = useState<"DIN A5" | "DIN A4">(
    "DIN A5",
  );
  const [totalPagesCount, setTotalPagesCount] = useState(0);
  const [isMakingPreview, setIsMakingPreview] = useState(false);

  return {
    nameInput,
    setNameInput,
    pickedFormat,
    setPickedFormat,
    pickedModules,
    setPickedModules,
    totalPagesCount,
    setTotalPagesCount,
    isMakingPreview,
    setIsMakingPreview,
    previewPrice,
    setPreviewPrice,
    orderAmount,
    setOrderAmount,
  };
}
