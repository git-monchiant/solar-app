"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

type Variant = "info" | "success" | "warning" | "danger";

type ConfirmOpts = {
  title?: string;
  message: string;
  variant?: Variant;
  confirmText?: string;
  cancelText?: string;
};

type AlertOpts = {
  title?: string;
  message: string;
  variant?: Variant;
  okText?: string;
};

type ToastOpts = {
  message: string;
  variant?: Variant;
  duration?: number;
};

type DialogCtx = {
  confirm: (opts: ConfirmOpts | string) => Promise<boolean>;
  alert: (opts: AlertOpts | string) => Promise<void>;
  toast: (opts: ToastOpts | string) => void;
};

const Ctx = createContext<DialogCtx | null>(null);

export function useDialog(): DialogCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useDialog must be used within <DialogProvider>");
  return ctx;
}

type ModalState =
  | { kind: "confirm"; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: "alert"; opts: AlertOpts; resolve: () => void }
  | null;

type ToastItem = { id: number; message: string; variant: Variant };

const variantTheme: Record<Variant, { ring: string; text: string; bg: string; btn: string; icon: React.ReactNode }> = {
  info: {
    ring: "bg-sky-50 text-sky-500",
    text: "text-sky-600",
    bg: "bg-sky-500",
    btn: "bg-primary hover:brightness-110",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
      </svg>
    ),
  },
  success: {
    ring: "bg-emerald-50 text-emerald-500",
    text: "text-emerald-600",
    bg: "bg-emerald-500",
    btn: "bg-emerald-500 hover:bg-emerald-600",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  warning: {
    ring: "bg-amber-50 text-amber-500",
    text: "text-amber-600",
    bg: "bg-amber-500",
    btn: "bg-amber-500 hover:bg-amber-600",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
  },
  danger: {
    ring: "bg-red-50 text-red-500",
    text: "text-red-600",
    bg: "bg-red-500",
    btn: "bg-red-500 hover:bg-red-600",
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
      </svg>
    ),
  },
};

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState>(null);
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const toastIdRef = useRef(0);

  const confirm = useCallback((opts: ConfirmOpts | string) => {
    const normalized: ConfirmOpts = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<boolean>((resolve) => {
      setModal({ kind: "confirm", opts: normalized, resolve });
    });
  }, []);

  const alertFn = useCallback((opts: AlertOpts | string) => {
    const normalized: AlertOpts = typeof opts === "string" ? { message: opts } : opts;
    return new Promise<void>((resolve) => {
      setModal({ kind: "alert", opts: normalized, resolve });
    });
  }, []);

  const toast = useCallback((opts: ToastOpts | string) => {
    const normalized: ToastOpts = typeof opts === "string" ? { message: opts } : opts;
    const id = ++toastIdRef.current;
    const variant = normalized.variant ?? "success";
    const duration = normalized.duration ?? 2500;
    setToasts((prev) => [...prev, { id, message: normalized.message, variant }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modal.kind === "confirm") { modal.resolve(false); setModal(null); }
        else { modal.resolve(); setModal(null); }
      } else if (e.key === "Enter") {
        if (modal.kind === "confirm") { modal.resolve(true); setModal(null); }
        else { modal.resolve(); setModal(null); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modal]);

  const api = useMemo<DialogCtx>(() => ({ confirm, alert: alertFn, toast }), [confirm, alertFn, toast]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {modal && (() => {
        const variant = modal.opts.variant ?? (modal.kind === "confirm" ? "warning" : "info");
        const theme = variantTheme[variant];
        const title = modal.opts.title ?? (modal.kind === "confirm" ? "ยืนยันการทำรายการ" : "แจ้งเตือน");
        const close = (result: boolean) => {
          if (modal.kind === "confirm") modal.resolve(result);
          else modal.resolve();
          setModal(null);
        };
        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => close(false)} />
            <div className="relative bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl animate-slide-up">
              <div className="flex items-start gap-3 mb-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${theme.ring}`}>
                  {theme.icon}
                </div>
                <div className="flex-1 min-w-0 pt-0.5">
                  <div className="font-bold text-gray-900">{title}</div>
                  <div className="text-sm text-gray-600 mt-1 whitespace-pre-wrap break-words">{modal.opts.message}</div>
                </div>
              </div>
              {modal.kind === "confirm" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => close(false)}
                    className="flex-1 h-11 rounded-lg text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                  >
                    {modal.opts.cancelText ?? "ยกเลิก"}
                  </button>
                  <button
                    type="button"
                    onClick={() => close(true)}
                    className={`flex-1 h-11 rounded-lg text-sm font-semibold text-white transition-colors ${theme.btn}`}
                  >
                    {modal.opts.confirmText ?? "ยืนยัน"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => close(true)}
                  className={`w-full h-11 rounded-lg text-sm font-semibold text-white transition-colors ${theme.btn}`}
                >
                  {(modal.opts as AlertOpts).okText ?? "รับทราบ"}
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {toasts.length > 0 && (
        <div className="fixed z-[210] left-1/2 -translate-x-1/2 top-4 flex flex-col gap-2 pointer-events-none">
          {toasts.map((t) => {
            const theme = variantTheme[t.variant];
            return (
              <div
                key={t.id}
                className="pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-full bg-white shadow-lg border border-gray-100 animate-slide-up"
              >
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-white ${theme.bg}`}>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    {t.variant === "success" && <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />}
                    {t.variant === "danger" && <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />}
                    {t.variant === "warning" && <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m0 3h.01" />}
                    {t.variant === "info" && <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v.01M12 12v4" />}
                  </svg>
                </span>
                <span className="text-sm font-medium text-gray-800 whitespace-pre-wrap break-words max-w-[80vw]">{t.message}</span>
              </div>
            );
          })}
        </div>
      )}
    </Ctx.Provider>
  );
}
