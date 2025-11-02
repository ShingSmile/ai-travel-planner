"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { cn } from "@/lib/utils";

type ToastVariant = "info" | "success" | "warning" | "error";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const variantClasses: Record<ToastVariant, string> = {
  info: "border border-border bg-surface text-foreground",
  success: "border border-success/30 bg-success/10 text-success-foreground",
  warning: "border border-warning/30 bg-warning/10 text-warning-foreground",
  error: "border border-destructive/30 bg-destructive/10 text-destructive",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const toast = useCallback((options: ToastOptions) => {
    const id = (
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 10)
    ) as string;

    const toastOptions: ToastRecord = {
      variant: "info",
      duration: 4200,
      ...options,
      id,
    };

    setToasts((current) => [...current, toastOptions]);

    const duration = toastOptions.duration ?? 4200;
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, duration);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const contextValue = useMemo(
    () => ({
      toast,
      dismiss,
    }),
    [toast, dismiss]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-4 z-[9999] flex flex-col items-center gap-3 px-4">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "pointer-events-auto w-full max-w-md rounded-2xl px-5 py-4 shadow-lg shadow-black/5 backdrop-blur",
              variantClasses[item.variant ?? "info"]
            )}
            role="status"
            aria-live="polite"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-sm font-semibold">{item.title}</p>
                {item.description && (
                  <p className="text-sm text-foreground/80">{item.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                className="text-sm text-foreground/60 transition hover:text-foreground"
              >
                关闭
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);

  if (!context) {
    throw new Error("useToast 需要在 ToastProvider 内部使用");
  }

  return context;
}
