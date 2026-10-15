"use client";

import { useState, type ReactNode } from "react";

// การ์ดขั้นของหน้าโครงการ — ยกหน้าตาจาก StepCard ของหน้ารายละเอียดลีด (leads/[id]/page.tsx)
//   active = พื้นม่วงอ่อน + กรอบม่วง + ป้าย Active · done = กรอบเทา + ✓ Done กดพับ/กางรายละเอียด · locked = เส้นประ
// ไม่มีโหมดเต็มจอแบบหน้าลีด (เนื้อหาการ์ดสั้นกว่า)

/** stopped = ขั้นที่โครงการแพ้งาน/ยกเลิกไป (ไม่ใช่ "เสร็จ") — กางดูรายละเอียดได้แบบ done */
export type StepState = "done" | "active" | "locked" | "stopped";

export default function ProjectStepCard({ no, title, state, summary, lockedHint, children }: {
  no: number; title: string; state: StepState;
  /** done: บรรทัดสรุปใต้ชื่อขั้น */
  summary?: ReactNode;
  /** locked: บอกว่าปลดเมื่อไร */
  lockedHint?: string;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const foldable = (state === "done" || state === "stopped") && !!children;
  const container = state === "active"
    ? "bg-active-light border border-active shadow-sm shadow-active/10 ring-1 ring-active/20"
    : state === "done" || state === "stopped" ? "bg-white border border-gray-300"
    : "bg-gray-50 border border-dashed border-gray-200";
  const iconBox = state === "active" ? "bg-active text-white" : state === "done" ? "bg-emerald-500 text-white"
    : state === "stopped" ? "bg-gray-400 text-white" : "bg-white text-gray-300 ring-1 ring-inset ring-gray-200";
  const showBody = state === "active" || (foldable && open);

  return (
    // scroll-mt = ความสูง header ติดบน (หน้าแม่วัดสดใส่ --hdr) + 12px — กดรางขั้นแล้วการ์ดไม่มุดใต้ header
    <div id={`step-${no}`} data-step-active={state === "active" ? "" : undefined} className={`rounded-2xl overflow-hidden scroll-mt-[calc(var(--hdr,124px)+12px)] ${container}`}>
      <div className={`flex items-center gap-3 px-5 py-4 ${foldable ? "cursor-pointer" : ""}`}
        onClick={foldable ? () => setOpen((x) => !x) : undefined}>
        <div className={`w-10 h-8 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold ${iconBox}`}>
          {state === "done" ? "✓" : String(no).padStart(2, "0")}
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold tracking-wider uppercase leading-none ${state === "locked" ? "text-gray-300" : "text-gray-400"}`}>Step {String(no).padStart(2, "0")}</div>
          <div className={`text-base font-bold leading-tight tracking-tight mt-1 ${state === "locked" ? "text-gray-400" : "text-gray-900"}`}>{title}</div>
          {(state === "done" || state === "stopped") && summary && <div className="mt-0.5 text-sm text-gray-500 truncate">{summary}</div>}
          {state === "locked" && lockedHint && <div className="mt-0.5 text-xs text-gray-400">{lockedHint}</div>}
        </div>
        {state === "active" && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-active shrink-0">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-active opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-active" />
            </span>
            Active
          </span>
        )}
        {(state === "done" || state === "stopped") && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider shrink-0 ${state === "stopped" ? "text-gray-500" : "text-teal-600"}`}>
            {state === "stopped" ? "หยุดที่ขั้นนี้" : "✓ Done"}{children && <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" /></svg>}
          </span>
        )}
      </div>
      {showBody && <div className="px-5 pb-5 pt-3 border-t border-gray-100 space-y-3">{children}</div>}
    </div>
  );
}
