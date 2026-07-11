"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

import { Button } from "@/components/ui/button";

type ToastType = "success" | "error" | "info";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ConfirmState = {
  title: string;
  message: string;
  resolve: (ok: boolean) => void;
};

type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
  confirm: (title: string, message: string) => Promise<boolean>;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (msg: string, _type?: ToastType) => {
        if (typeof console !== "undefined") console.info("[toast]", msg);
      },
      confirm: async (_title: string, msg: string) => {
        if (typeof window !== "undefined") {
          return window.confirm(msg);
        }
        return false;
      },
    };
  }
  return ctx;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const confirm = useCallback((title: string, message: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ title, message, resolve });
    });
  }, []);

  const value = useMemo(() => ({ toast, confirm }), [toast, confirm]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`}>
            {t.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : t.type === "error" ? (
              <AlertTriangle className="h-4 w-4 shrink-0" />
            ) : (
              <Info className="h-4 w-4 shrink-0" />
            )}
            <span className="text-sm">{t.message}</span>
            <button
              type="button"
              className="mr-auto text-[var(--muted)]"
              onClick={() =>
                setToasts((prev) => prev.filter((x) => x.id !== t.id))
              }
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
      {confirmState ? (
        <div className="confirm-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-dialog">
            <h3 className="font-bold">{confirmState.title}</h3>
            <p className="mt-2 text-sm text-[var(--muted)]">
              {confirmState.message}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
              >
                انصراف
              </Button>
              <Button
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
              >
                تأیید
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}
