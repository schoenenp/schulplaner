"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XMarkIcon,
} from "@heroicons/react/16/solid";

type ToastVariant = "info" | "success" | "error" | "loading";

type ToastEntry = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastApi = {
  /** Shows a toast and returns its id. Loading toasts stay until updated or dismissed. */
  show: (message: string, variant?: ToastVariant) => number;
  /** Replaces message and variant of an existing toast, restarting its auto-dismiss timer. */
  update: (id: number, message: string, variant: ToastVariant) => void;
  dismiss: (id: number) => void;
};

const AUTO_DISMISS_MS: Record<ToastVariant, number | undefined> = {
  info: 5000,
  success: 5000,
  error: 8000,
  loading: undefined,
};

const VARIANT_ICONS: Record<ToastVariant, React.ReactNode> = {
  info: <InformationCircleIcon className="size-5 shrink-0 text-pirrot-blue-300" />,
  success: <CheckCircleIcon className="size-5 shrink-0 text-emerald-400" />,
  error: <ExclamationTriangleIcon className="size-5 shrink-0 text-amber-400" />,
  loading: (
    <span className="flex size-5 shrink-0 items-center justify-center">
      <span className="size-2 animate-pulse rounded-full bg-pirrot-blue-400" />
    </span>
  ),
};

const ToastContext = createContext<ToastApi | undefined>(undefined);

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return api;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextIdRef = useRef(1);
  const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const scheduleDismiss = useCallback(
    (id: number, variant: ToastVariant) => {
      const existing = timersRef.current.get(id);
      if (existing) {
        clearTimeout(existing);
        timersRef.current.delete(id);
      }
      const duration = AUTO_DISMISS_MS[variant];
      if (duration !== undefined) {
        timersRef.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
    },
    [dismiss],
  );

  const show = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = nextIdRef.current++;
      setToasts((current) => [...current, { id, message, variant }]);
      scheduleDismiss(id, variant);
      return id;
    },
    [scheduleDismiss],
  );

  const update = useCallback(
    (id: number, message: string, variant: ToastVariant) => {
      setToasts((current) =>
        current.map((toast) =>
          toast.id === id ? { ...toast, message, variant } : toast,
        ),
      );
      scheduleDismiss(id, variant);
    },
    [scheduleDismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({ show, update, dismiss }),
    [show, update, dismiss],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className="glass-card-soft toast-enter pointer-events-auto flex items-start gap-3 border-pirrot-blue-300/25 p-4 text-sm text-pirrot-blue-50"
          >
            {VARIANT_ICONS[toast.variant]}
            <span className="flex-1 leading-5">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded-md p-0.5 text-pirrot-blue-100/60 transition hover:text-pirrot-blue-50"
              aria-label="Meldung schließen"
            >
              <XMarkIcon className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
