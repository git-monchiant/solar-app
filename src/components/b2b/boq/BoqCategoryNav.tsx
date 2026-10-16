"use client";

import { useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { formatTHB } from "@/lib/utils/formatters";
import type { CalcResult } from "@/lib/b2b/boq-calc";
import type { B2bCategory } from "@/lib/b2b/materials";
import type { CategoryFlags } from "./BoqCategorySection";

/** บาทเต็มจำนวน — formatTHB ค่าเริ่มต้นไม่ปัดเศษ (แสดงทศนิยมได้ถึง 3 ตำแหน่ง) */
const thb0 = (n: number) => formatTHB(Math.round(n));

// เมนูหมวดค้างซ้ายของแท็บ "รายการ" (แผน 20261016-04 แบบ A+B) — กดแล้วเลื่อนไปการ์ดหมวดนั้น
// แต่ละหมวด: ราคาขาย · แท่งขนาด (เทียบหมวดที่แพงสุด · สีเดียว) · จุดสถานะ (แดง รอราคา · เหลือง ราคาเปลี่ยน · เขียว มีรายการ)
// หมวดที่ยังว่าง = แถวเรียบสีจาง "เลข ชื่อ +" (กดแล้วเปิดการ์ดเปล่าให้เลือกรายการ) อยู่ในกลุ่มพับได้ — เดิมเป็นชิปกว้างไม่เท่ากันเรียงยาว (ปรับ 16 ต.ค.)
//   มาตรฐาน: กางไว้เป็นค่าเริ่มต้น (ผู้ใช้สั่ง 16 ต.ค.) · ส่วนเพิ่มเติมที่ยังไม่ได้เพิ่ม: พับไว้ก่อน · กดพับ/กางเองได้

export default function BoqCategoryNav({ filled, empty, addons, addonChoices, calc, flags, active, readOnly, onGo, onOpenEmpty, onAddAddon }: {
  /** หมวดมาตรฐานที่มีรายการ */
  filled: B2bCategory[];
  /** หมวดมาตรฐานที่ยังว่าง */
  empty: B2bCategory[];
  /** หมวดเสริมที่อยู่ในใบ */
  addons: B2bCategory[];
  /** หมวดเสริมที่ยังเพิ่มได้ */
  addonChoices: B2bCategory[];
  calc: CalcResult;
  flags: (categoryId: number) => CategoryFlags;
  active: number | null;
  readOnly: boolean;
  onGo: (categoryId: number) => void;
  onOpenEmpty: (c: B2bCategory) => void;
  onAddAddon: (c: B2bCategory) => void;
}) {
  const [showEmpty, setShowEmpty] = useState(true);
  const [choicesOpen, setChoicesOpen] = useState(false);
  const max = Math.max(1, ...[...filled, ...addons].map((c) => calc.categories[c.id]?.cost ?? 0));
  const head = "flex items-center justify-between px-2 pt-2 pb-1 text-xxs font-bold uppercase tracking-wider text-gray-400";

  const groupToggle = (label: string, n: number, isOpen: boolean, onClick: () => void) => (
    <button type="button" onClick={onClick} style={{ minHeight: 0 }} aria-expanded={isOpen}
      className="flex w-full items-center gap-1.5 px-2 pt-2 pb-1 text-left text-xxs font-bold uppercase tracking-wider text-gray-400 hover:text-gray-600">
      <span>{label}</span>
      <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gray-100 px-1 tabular-nums text-gray-500">{n}</span>
      <ChevronRightIcon className={`ml-auto h-3 w-3 transition-transform ${isOpen ? "rotate-90" : ""}`} strokeWidth={2.5} />
    </button>
  );
  const addRow = (c: B2bCategory, onClick: (c: B2bCategory) => void) => (
    <button key={c.id} type="button" onClick={() => onClick(c)} style={{ minHeight: 0 }} title={c.name}
      className="group grid w-full grid-cols-[22px_1fr_auto] items-center gap-x-2 rounded-lg px-2 py-1 text-left hover:bg-gray-50">
      <span className="text-right text-xs text-gray-300">{c.id}</span>
      <span className="truncate text-sm text-gray-400 group-hover:text-gray-700">{c.name}</span>
      {!readOnly && <span className="text-base font-semibold leading-none text-gray-300 group-hover:text-primary">+</span>}
    </button>
  );

  const row = (c: B2bCategory) => {
    const r = calc.categories[c.id];
    const f = flags(c.id);
    const has = (r?.lines ?? 0) > 0;
    const dot = f.pending ? "bg-red-500" : f.changed ? "bg-amber-400" : has ? "bg-emerald-500" : "bg-gray-200";
    return (
      <button key={c.id} type="button" onClick={() => onGo(c.id)} style={{ minHeight: 0 }}
        className={`grid w-full grid-cols-[22px_1fr_auto] items-center gap-x-2 gap-y-1 rounded-lg px-2 py-1.5 text-left ${active === c.id ? "bg-primary/10" : "hover:bg-gray-50"}`}>
        <span className="text-right text-xs font-bold text-gray-400">{c.id}</span>
        <span className={`truncate text-sm ${has ? "font-medium text-gray-800" : "text-gray-400"}`} title={c.name}>{c.name}</span>
        <span className="flex items-center gap-1.5 text-xs tabular-nums text-gray-600">
          {has ? thb0(r.sale) : ""}
          <i className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
        </span>
        {has && (
          <>
            <span />
            <span className="col-span-2 h-1 overflow-hidden rounded-full bg-gray-100">
              <span className="block h-full rounded-full bg-sky-500" style={{ width: `${((r.cost / max) * 100).toFixed(1)}%` }} />
            </span>
          </>
        )}
      </button>
    );
  };

  return (
    <nav className="rounded-xl border border-gray-200 bg-white p-2" aria-label="หมวดในใบ BOQ">
      <div className={head}><span>หมวดมาตรฐาน</span><span>ราคาขาย</span></div>
      {filled.length === 0 && <p className="px-2 py-1 text-xs text-gray-400">ยังไม่มีรายการ — เลือกหมวดด้านล่างเพื่อเริ่ม</p>}
      {filled.map(row)}
      {empty.length > 0 && (
        <div className="mt-1 border-t border-gray-100">
          {groupToggle("ยังไม่มีรายการ", empty.length, showEmpty, () => setShowEmpty(!showEmpty))}
          {showEmpty && empty.map((c) => addRow(c, onOpenEmpty))}
        </div>
      )}
      {(addons.length > 0 || (!readOnly && addonChoices.length > 0)) && (
        <div className="mt-1 border-t border-gray-100">
          <div className={head}><span>ส่วนเพิ่มเติม</span></div>
          {addons.map(row)}
          {!readOnly && addonChoices.length > 0 && (
            <>
              {groupToggle("ยังไม่ได้เพิ่ม", addonChoices.length, choicesOpen, () => setChoicesOpen(!choicesOpen))}
              {choicesOpen && addonChoices.map((c) => addRow(c, onAddAddon))}
            </>
          )}
        </div>
      )}
    </nav>
  );
}
