"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { formatThaiDate } from "@/lib/utils/formatters";

// แถบขั้นของหน้าโครงการ (แผน 20261016-01 แบบ A) — แทนรางขั้นซ้าย + การ์ดขั้นเรียงแนวตั้งเดิม
//   จอใหญ่: แถบแนวนอนแบ่ง 2 ช่วง (ขาย 01–05 / ดำเนินโครงการ 06–09) · กดขั้นที่เสร็จ = ดูรายละเอียดขั้นนั้น · ชี้ขั้นที่ล็อก = บอกว่าปลดเมื่อไร
//   มือถือ: แถบความคืบหน้า "ขั้น n/9" กดแล้วขึ้นแผ่นล่างรายการทุกขั้น

/** stopped = ขั้นที่โครงการแพ้งาน/ยกเลิกไป (ไม่ใช่ "เสร็จ") */
export type StepState = "done" | "active" | "locked" | "stopped";

export type StepView = {
  step: number; no: number; label: string; short: string; state: StepState;
  /** done: วันที่ผ่านขั้นนี้ */
  date?: string | null;
  /** done: ไม่เคยเข้าขั้นนี้ (ข้ามไป) */
  skipped?: boolean;
  /** locked: ปลดเมื่อไร */
  hint?: string;
  /** done/active: บรรทัดสรุปในแผ่นล่างมือถือ */
  summary?: ReactNode;
};

const pad = (n: number) => String(n).padStart(2, "0");
const SALES_MAX = 3500;

function subText(s: StepView) {
  if (s.state === "active") return "ตอนนี้";
  if (s.state === "stopped") return "หยุดที่นี่";
  if (s.state === "done") return s.skipped ? "ข้าม" : s.date ? formatThaiDate(s.date, { year: false }) : "";
  return "";
}

/** จอ md ขึ้นไป */
export default function ProjectStepper({ steps, selected, onSelect }: {
  steps: StepView[];
  /** ขั้นที่กำลังดูย้อนหลัง (null = ขั้นปัจจุบัน) */
  selected: number | null;
  onSelect: (step: number) => void;
}) {
  const phases = [
    { key: "sales", label: "ขาย", range: "01–05", flex: "flex-[5]", items: steps.filter((s) => s.step <= SALES_MAX) },
    { key: "exec", label: "ดำเนินโครงการ", range: "06–09", flex: "flex-[4]", items: steps.filter((s) => s.step > SALES_MAX) },
  ];
  return (
    <div className="max-md:hidden flex gap-6 px-5 pb-3 border-t border-gray-100">
      {phases.map((ph) => {
        const now = ph.items.some((s) => s.state === "active" || s.state === "stopped");
        const fin = ph.items.every((s) => s.state === "done");
        return (
          <div key={ph.key} className={`${ph.flex} min-w-0`}>
            <div className={`flex items-center gap-2 mt-2 mb-2 text-xxs font-bold tracking-wide ${now ? "text-active-dark" : fin ? "text-emerald-600" : "text-gray-400"}`}>
              <span className="whitespace-nowrap">{ph.label}{fin ? " ✓" : ""} <span className="font-normal">{ph.range}</span></span>
              <span className={`flex-1 h-px ${now ? "bg-violet-200" : "bg-gray-200"}`} />
            </div>
            <ol className="flex">
              {ph.items.map((s, i) => {
                const sel = selected === s.step;
                const clickable = s.state !== "locked";
                const dot = s.state === "done" ? `bg-emerald-500 text-white ${sel ? "ring-4 ring-emerald-200" : ""}`
                  : s.state === "active" ? "bg-active text-white ring-4 ring-violet-100"
                  : s.state === "stopped" ? "bg-gray-400 text-white ring-4 ring-gray-100"
                  : "bg-white text-gray-400 ring-2 ring-inset ring-gray-200";
                const label = sel ? "text-emerald-700" : s.state === "active" ? "text-active-dark"
                  : s.state === "locked" ? "text-gray-400 font-medium" : "text-gray-700 group-hover:text-active";
                const line = s.state === "locked" || s.state === "stopped" ? "bg-gray-200" : "bg-emerald-400";
                return (
                  <li key={s.step} className="group relative flex-1 min-w-0">
                    {i > 0 && <span className={`absolute top-[13px] h-0.5 rounded-full ${line}`} style={{ left: "calc(-50% + 18px)", right: "calc(50% + 18px)" }} />}
                    <button type="button" disabled={!clickable} onClick={() => onSelect(s.step)} style={{ minHeight: 0 }}
                      className={`w-full flex flex-col items-center px-1 text-center ${clickable ? "cursor-pointer" : "cursor-help"}`}>
                      <span className={`relative z-10 w-7 h-7 rounded-full flex items-center justify-center text-xxs font-bold ${dot}`}>
                        {s.state === "done" ? "✓" : pad(s.no)}
                      </span>
                      <span className={`mt-1.5 text-xs font-bold leading-tight ${label}`}>
                        <span className="xl:hidden">{s.short}</span><span className="max-xl:hidden">{s.label}</span>
                      </span>
                      <span className={`text-xxs leading-tight whitespace-nowrap ${s.state === "active" ? "font-bold text-active" : "text-gray-400"}`}>{subText(s) || " "}</span>
                    </button>
                    {/* ปุ่มที่ disabled ไม่รับ hover ในบางเบราว์เซอร์ ⇒ ใช้ hover ของ li */}
                    {s.state === "locked" && s.hint && (
                      <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2.5 py-1 text-xxs text-white shadow group-hover:block">
                        {s.hint}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

/** จอมือถือ — แถบความคืบหน้า + แผ่นล่างรายการขั้น */
export function StepProgressMobile({ steps, caption, onSelect }: {
  steps: StepView[];
  /** แทนชื่อขั้นปัจจุบัน — เช่น "ปิดโครงการแล้ว" */
  caption?: string;
  onSelect: (step: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const cur = steps.find((s) => s.state === "active" || s.state === "stopped");
  const doneCount = steps.filter((s) => s.state === "done").length;
  const seg = (s: StepView) => s.state === "done" ? "bg-emerald-500" : s.state === "active" ? "bg-active" : s.state === "stopped" ? "bg-gray-400" : "bg-violet-100";
  const pick = (step: number) => { setOpen(false); onSelect(step); };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} style={{ minHeight: 0 }}
        className="md:hidden w-full rounded-xl border border-violet-100 bg-active-light px-3 py-2 text-left">
        <div className="flex items-baseline justify-between gap-2 text-sm">
          <span className="min-w-0 truncate">
            {cur ? <><b className="text-active-dark">ขั้น {cur.no}/{steps.length}</b> {caption ?? cur.label}</> : <b className="text-emerald-700">{caption ?? `ครบ ${doneCount} ขั้น`}</b>}
          </span>
          <span className="shrink-0 text-xs font-bold text-active">ทุกขั้น ›</span>
        </div>
        <div className="mt-1.5 flex gap-[3px]">
          {steps.map((s) => <span key={s.step} className={`flex-1 h-1.5 rounded-full ${seg(s)} ${s.step === SALES_MAX ? "mr-1.5" : ""}`} />)}
        </div>
      </button>

      {open && createPortal(
        // portal ออกไป body — ปุ่มอยู่ใน header ติดบน (z-40) ซึ่งตั้ง stacking context เอง ถ้าวาดในนั้นแถบล่างมือถือ (z-50) จะทับแผ่นนี้
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="ขั้นของโครงการ">
          <div className="absolute inset-0 bg-gray-900/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[82vh] overflow-y-auto rounded-t-2xl bg-white px-4 pt-2 shadow-2xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 16px)" }}>
            <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-gray-300" />
            <h2 className="text-base font-bold text-gray-900">ขั้นของโครงการ</h2>
            {[{ label: "ขาย", items: steps.filter((s) => s.step <= SALES_MAX) }, { label: "ดำเนินโครงการ", items: steps.filter((s) => s.step > SALES_MAX) }].map((g) => (
              <div key={g.label}>
                <div className="mt-2 text-xxs font-bold tracking-wide text-gray-400">{g.label}</div>
                <ul className="divide-y divide-gray-100">
                  {g.items.map((s) => {
                    const dot = s.state === "done" ? "bg-emerald-500 text-white" : s.state === "active" ? "bg-active text-white"
                      : s.state === "stopped" ? "bg-gray-400 text-white" : "ring-2 ring-inset ring-gray-200 text-gray-400";
                    return (
                      <li key={s.step}>
                        <button type="button" disabled={s.state === "locked"} onClick={() => pick(s.step)} style={{ minHeight: 0 }}
                          className="w-full flex items-center gap-3 py-2 text-left">
                          <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xxs font-bold ${dot}`}>{s.state === "done" ? "✓" : pad(s.no)}</span>
                          <span className="flex-1 min-w-0">
                            <span className={`block text-sm leading-tight ${s.state === "active" ? "font-bold text-active-dark" : s.state === "locked" ? "text-gray-400" : "text-gray-800"}`}>{pad(s.no)} {s.label}</span>
                            {s.state === "locked" ? (s.hint && <span className="block text-xxs text-gray-400">{s.hint}</span>)
                              : s.summary && <span className="block truncate text-xxs text-gray-400">{s.summary}</span>}
                          </span>
                          <span className={`shrink-0 text-xxs whitespace-nowrap ${s.state === "active" ? "font-bold text-active" : "text-gray-400"}`}>{subText(s)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
