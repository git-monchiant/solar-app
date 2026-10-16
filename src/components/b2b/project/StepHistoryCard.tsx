"use client";

import type { ReactNode } from "react";
import { formatThaiDate } from "@/lib/utils/formatters";
import { atLocal } from "@/lib/b2b/project-view";

// ดูขั้นที่ผ่านมา (กดจากแถบขั้น · แผน 20261016-01) — แทนการพับ/กางการ์ดขั้นแบบเดิม
//   stopped = ขั้นที่แพ้งาน/ยกเลิกไป (แสดงแทนการ์ดขั้นต่อไป ไม่มีปุ่มกลับ)
export default function StepHistoryCard({ no, label, stopped, date, skipped, summary, onBack, children }: {
  no: number;
  label: string;
  stopped?: boolean;
  date?: string | null;
  skipped?: boolean;
  summary?: ReactNode;
  onBack?: () => void;
  children?: ReactNode;
}) {
  const eyebrow = stopped ? "หยุดที่ขั้นนี้" : skipped ? "ข้ามขั้นนี้" : date ? `เสร็จ ${formatThaiDate(atLocal(date))}` : "เสร็จแล้ว";
  return (
    <section className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      <div className={`flex items-center gap-3 px-4 md:px-5 py-3 border-b border-gray-100 bg-gradient-to-b ${stopped ? "from-gray-50" : "from-emerald-50"} to-white`}>
        <span className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white ${stopped ? "bg-gray-400" : "bg-emerald-500"}`}>
          {stopped ? String(no).padStart(2, "0") : "✓"}
        </span>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-bold tracking-wide ${stopped ? "text-gray-500" : "text-emerald-600"}`}>ขั้น {String(no).padStart(2, "0")} · {eyebrow}</div>
          <h2 className="text-base md:text-lg font-bold leading-snug text-gray-900">{label}</h2>
          {summary && <p className="text-xs text-gray-500 truncate">{summary}</p>}
        </div>
        {onBack && (
          <button type="button" onClick={onBack}
            className="h-9 px-3 shrink-0 rounded-lg border border-gray-200 bg-white text-sm font-bold text-gray-700 hover:bg-gray-50 whitespace-nowrap">
            ‹ <span className="max-md:hidden">กลับขั้นปัจจุบัน</span><span className="md:hidden">กลับ</span>
          </button>
        )}
      </div>
      {children && <div className="px-4 md:px-5 py-4 space-y-3">{children}</div>}
    </section>
  );
}
