import { useEffect, useState } from "react";

type ModalType =
  | "info"
  | "custom-modules"
  | "dates"
  | "name"
  | "preview"
  | "binding-overflow"
  | "custom-cover"
  | "login-prompt"
  | undefined;

export function useUIState() {
  const [modalId, setModalId] = useState<ModalType>();
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const [isBookInfoOpen, setIsBookInfoOpen] = useState(true);
  const [isCostOpen, setIsCostOpen] = useState(true);
  const [onlyPickedModules, setOnlyPickedModules] = useState(false);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  useEffect(() => {
    const mobile = window.matchMedia("(max-width: 767px)");
    // On mobile both panels are bottom sheets, so they start closed.
    const syncViewport = () => {
      setIsMobileViewport(mobile.matches);
      if (!mobile.matches) return;
      setIsFilterOpen(false);
      setIsBookInfoOpen(false);
    };
    syncViewport();
    mobile.addEventListener("change", syncViewport);
    return () => mobile.removeEventListener("change", syncViewport);
  }, []);
  const [previewFileURL, setPreviewFileURL] = useState<string | undefined>();
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [acceptPolicies, setAcceptPolicies] = useState({
    agb: false,
    data: false,
  });
  const acceptPoliciesValid = acceptPolicies.agb && acceptPolicies.data;
  return {
    modalId,
    setModalId,
    acceptPolicies,
    setAcceptPolicies,
    acceptPoliciesValid,
    isFilterOpen,
    setIsFilterOpen,
    previewFileURL,
    setPreviewFileURL,
    isBookInfoOpen,
    setIsBookInfoOpen,
    isCostOpen,
    setIsCostOpen,
    onlyPickedModules,
    setOnlyPickedModules,
    isMobileViewport,
    configWarnings,
    setConfigWarnings,
  };
}
