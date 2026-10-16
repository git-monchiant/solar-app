"use client";

import { useState, type ReactNode } from "react";
import { formatThaiDate } from "@/lib/utils/formatters";
import { daysSince, STAGE_AGING_WARN_DAYS } from "@/lib/b2b/project-view";

// การ์ด "ขั้นต่อไป" บนสุดของหน้าโครงการ (แผน 20261016-01 แบบ A) — บอกงานถัดไป + เช็กลิสต์ว่ายังขาดอะไร + อยู่ขั้นนี้กี่วัน
//   ปุ่มหลัก (primary) ซ่อนบนมือถือ — หน้าแม่วางไว้แถบท้ายจอแทน · ปุ่มรอง (actions) อยู่ท้ายการ์ดทุกจอ

/** ok = เสร็จ · todo = ทำข้อนี้ · wait = ยังไม่ถึง · pending = รอคนอื่น · skip = ข้าม/ไม่ต้องใช้ */
export type NextItemState = "ok" | "todo" | "wait" | "pending" | "skip";
export type NextItem = { key: string; state: NextItemState; title: ReactNode; detail?: ReactNode; action?: ReactNode };

const DOT: Record<NextItemState, string> = {
  ok: "bg-emerald-50 text-emerald-600",
  todo: "bg-active text-white",
  wait: "bg-white text-gray-400 ring-2 ring-inset ring-gray-200",
  pending: "bg-amber-100 text-amber-700",
  skip: "bg-gray-100 text-gray-400",
};
const TITLE: Record<NextItemState, string> = {
  ok: "text-gray-500", todo: "font-bold text-active-dark", wait: "text-gray-500", pending: "font-medium text-amber-800", skip: "text-gray-400",
};

export default function NextStepCard({ no, label, title, sub, enteredAt, items, note, actions, primary, children }: {
  no: number;
  label: string;
  title: ReactNode;
  sub?: ReactNode;
  /** เวลาที่เข้าขั้นนี้ — null = ไม่แสดงจำนวนวัน */
  enteredAt?: string | null;
  items?: NextItem[];
  /** ข้อความท้ายการ์ด (ซ้ายของปุ่ม) เช่น เงื่อนไขปลดปุ่ม */
  note?: ReactNode;
  actions?: ReactNode;
  primary?: ReactNode;
  children?: ReactNode;
}) {
  // เวลาอ้างอิง — จับครั้งเดียวตอนแสดง (render ต้องให้ผลเดิมทุกครั้ง)
  const [now] = useState(() => Date.now());
  const days = enteredAt ? daysSince(enteredAt, now) : null;
  const late = days != null && days > STAGE_AGING_WARN_DAYS;
  const footer = !!(note || actions || primary);
  return (
    <section className="rounded-2xl border border-violet-200 bg-white shadow-sm shadow-active/10 overflow-hidden">
      <div className="flex items-start gap-3 px-4 md:px-5 pt-3.5 pb-3 bg-gradient-to-b from-active-light to-white">
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold tracking-wide text-active">ขั้น {String(no).padStart(2, "0")} · {label}</div>
          <h2 className="mt-0.5 text-base md:text-lg font-bold leading-snug text-gray-900">{title}</h2>
          {sub && <p className="mt-0.5 text-sm text-gray-600">{sub}</p>}
        </div>
        {days != null && (
          <div className="shrink-0 text-right leading-tight" title={late ? `อยู่ขั้นนี้เกิน ${STAGE_AGING_WARN_DAYS} วัน` : undefined}>
            <div className={`text-base font-medium ${late ? "text-amber-600" : "text-gray-800"}`}>{days === 0 ? "วันนี้" : `${days} วัน`}</div>
            <div className="text-xxs text-gray-400 whitespace-nowrap">เข้าขั้นนี้ {formatThaiDate(enteredAt, { year: false })}</div>
          </div>
        )}
      </div>

      {items && items.length > 0 && (
        <ol className="px-4 md:px-5">
          {items.map((it, i) => (
            <li key={it.key}
              className={`flex items-center gap-3 py-2.5 border-t border-gray-100 first:border-t-0 ${it.state === "todo" ? "-mx-4 md:-mx-5 px-4 md:px-5 bg-active-light/70 border-violet-100" : ""}`}>
              <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xxs font-bold ${DOT[it.state]}`}>
                {it.state === "ok" ? "✓" : it.state === "pending" ? "…" : it.state === "skip" ? "–" : i + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm leading-tight ${TITLE[it.state]}`}>{it.title}</div>
                {it.detail && <div className="mt-0.5 text-xs text-gray-400 break-words">{it.detail}</div>}
              </div>
              {it.action && <div className="shrink-0 flex items-center gap-2">{it.action}</div>}
            </li>
          ))}
        </ol>
      )}

      {children && <div className="px-4 md:px-5 pb-4 pt-1">{children}</div>}

      {footer && (
        // มือถือเหลือแค่ปุ่มหลัก (ย้ายไปแถบท้ายจอ) ⇒ ไม่ต้องมีแถบท้ายการ์ด
        <div className={`flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 bg-gray-50 px-4 md:px-5 py-2.5 ${!note && !actions ? "max-md:hidden" : ""}`}>
          {note && <div className="mr-auto text-xs text-gray-500">{note}</div>}
          {actions}
          {primary && <div className="max-md:hidden flex items-center">{primary}</div>}
        </div>
      )}
    </section>
  );
}

/** แถบผู้ตรวจสอบ 3 ชั้น (ผ่านแล้วกี่ชั้น) */
export function TierBar({ done }: { done: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-gray-400 tabular-nums">
      {[1, 2, 3].map((i) => <span key={i} className={`w-6 md:w-8 h-1.5 rounded-full ${i <= done ? "bg-emerald-500" : "bg-gray-200"}`} />)}
      <span className="ml-1">{done}/3</span>
    </span>
  );
}
