"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** ใช้กับ <select> ทุกตัวใน popover จะได้หน้าตาเดียวกันทั้ง Today และ Pipeline */
export const SLA_SUB_SELECT_CLASS =
  "h-7 w-full rounded-md border border-gray-200 bg-white px-2 pr-7 text-xxs font-medium text-gray-700 outline-none focus:border-gray-400";

/**
 * ปุ่ม "ตัวกรองเพิ่มเติม" พร้อม popover — ยุบตัวกรองที่ใช้นาน ๆ ครั้งไว้ข้างใน
 * แถวบนจะได้เหลือแต่ชิปที่กดทุกวัน
 *
 * เก็บ state เปิด/ปิดกับ click-outside ไว้ในตัวเอง ผู้เรียกส่งมาแค่จำนวนตัวกรอง
 * ที่เปิดอยู่ (ไว้ขึ้น badge) กับ <select> ที่จะอยู่ข้างใน
 */
export default function SlaSubFilter({ count, children }: { count: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <span className="relative inline-flex" ref={ref}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(value => !value)}
        className={`h-7 inline-flex items-center gap-1.5 rounded-md border px-2.5 text-xxs font-semibold whitespace-nowrap transition-colors ${
          count > 0
            ? "border-gray-800 bg-white text-gray-900"
            : "border-dashed border-gray-300 bg-white text-gray-600 hover:border-gray-500"
        }`}
      >
        ตัวกรองเพิ่มเติม
        {count > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-800 px-1 text-[10px] font-bold text-white">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-30 flex w-60 flex-col gap-1.5 rounded-lg border border-gray-300 bg-white p-2.5 text-left shadow-lg">
          <span className="text-xxs font-bold uppercase tracking-wider text-gray-400">กรองเฉพาะ</span>
          {children}
        </div>
      )}
    </span>
  );
}
