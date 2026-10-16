"use client";

import type { ReactNode } from "react";
import { XIcon } from "@/components/ui/icons";

// โครงป๊อปอัปของหน้าโครงการ B2B — ยกจากป๊อปอัปวัสดุ (หัว · เนื้อหา · ปุ่มท้าย) ให้ทุกป๊อปอัปในโมดูลหน้าตาเดียวกัน
export default function ModalShell({ title, subtitle, width = "max-w-lg", error, saving, confirmText, confirmTone = "primary", onConfirm, onClose, children }: {
  title: string;
  subtitle?: string;
  width?: string;
  error?: string;
  saving?: boolean;
  confirmText: string;
  /** primary = เขียวฟ้าของแอป · danger = แพ้งาน/ยกเลิก */
  confirmTone?: "primary" | "danger";
  onConfirm: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const tone = confirmTone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-primary hover:bg-primary-dark";
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
      <div className={`bg-white rounded-2xl shadow-2xl shadow-slate-900/20 w-full ${width} my-8`}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-400 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} style={{ minHeight: 0 }} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center">
            <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>
        <div className="p-6 space-y-3">{children}</div>
        <div className="px-6 py-3 border-t border-gray-100 flex items-center gap-3">
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50">ยกเลิก</button>
            <button type="button" onClick={onConfirm} disabled={saving}
              className={`h-9 px-5 rounded-lg text-white text-sm font-semibold transition-colors disabled:opacity-50 ${tone}`}>
              {saving ? "กำลังบันทึก…" : confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export const fieldCls = "w-full h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-gray-50 disabled:text-gray-600";
export const areaCls = "w-full px-3 py-2 rounded-lg border border-gray-200 bg-white text-sm outline-none transition-colors hover:border-gray-300 focus:border-primary focus:ring-2 focus:ring-primary/10";
export const labelCls = "block text-xs font-semibold text-gray-500 mb-1";
export const Req = () => <span className="text-red-500">*</span>;
