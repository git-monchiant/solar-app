"use client";

import { useState, type ReactNode } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { formatNumber, formatTHB } from "@/lib/utils/formatters";
import { omQty, type OmParams } from "@/lib/b2b/boq-om";
import type { CalcResult } from "@/lib/b2b/boq-calc";
import { formatPrice, priceSuffix, type B2bCategory } from "@/lib/b2b/materials";
import { BOQ_LINE_NOTE_MAX, BOQ_MAX_MANUAL_COST, BOQ_MAX_QTY, wattInModel, type BoqLine } from "@/lib/b2b/boq";

/** บาทเต็มจำนวน — formatTHB ค่าเริ่มต้นไม่ปัดเศษ (แสดงทศนิยมได้ถึง 3 ตำแหน่ง) */
const thb0 = (n: number) => formatTHB(Math.round(n));

// รายละเอียดหมวดหนึ่งของใบ BOQ — ตาราง "ลำดับ · รายการ (ยี่ห้อ · รุ่นใต้ชื่อ) · ปริมาณ · หน่วย · ต้นทุน · ราคาขาย" (ข้อมูลตาม sheet EPCL - BOQS) (คอลัมน์ % มีเฉพาะใน Excel — ผู้ใช้ไม่เอาบนจอ 6 ต.ค. 69)
// หมวด 1–18: บรรทัดมาจาก Master อย่างเดียว (แก้ได้แค่จำนวน) · หมวดเสริม 19–25: ใส่ราคาเองได้ (เคาะ 6 ต.ค. 69)

const money = (n: number) => formatTHB(n, { decimals: 2 });
const cell = "px-2 py-1.5";
const input = "h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-transparent disabled:border-transparent";

/** ช่องปริมาณ — เก็บข้อความที่พิมพ์ไว้เองระหว่างแก้ ไม่งั้นลบจนว่างแล้ว qty = 0 → React เติม "0" กลับทันที (ลบ 0 ไม่ออก / พิมพ์ต่อเป็น "05")
 *  ว่างระหว่างพิมพ์ = คิดเป็น 0 · ออกจากช่องแล้วแสดงค่าจริง · คลิกเข้าช่อง = เลือกทั้งหมด พิมพ์ทับได้เลย */
function QtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={0} max={BOQ_MAX_QTY} step="any" inputMode="decimal" className={`${input} text-right tabular-nums`}
      value={draft ?? (Number.isFinite(value) ? String(value) : "")}
      onFocus={(e) => e.target.select()}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = Number(e.target.value);
        onChange(e.target.value === "" || !Number.isFinite(n) ? 0 : n);
      }}
      onBlur={() => setDraft(null)} />
  );
}

/** หมายเหตุรายบรรทัด (แผน 20261016-02) — ไม่มีหมายเหตุ = ปุ่ม "+ หมายเหตุ" · กดแล้วออกจากช่องโดยไม่พิมพ์ = ปิดช่องเฉยๆ (ไม่นับเป็นงานค้าง) */
function NoteField({ value, readOnly, onChange }: { value: string | null; readOnly: boolean; onChange: (v: string | null) => void }) {
  const [open, setOpen] = useState(false);
  if (readOnly) return value ? <div className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-500">หมายเหตุ: {value}</div> : null;
  if (!value && !open) {
    return <button type="button" onClick={() => setOpen(true)} style={{ minHeight: 0 }} className="mt-0.5 text-xxs text-gray-400 hover:text-primary">+ หมายเหตุ</button>;
  }
  return (
    <input autoFocus={!value} maxLength={BOQ_LINE_NOTE_MAX} value={value ?? ""} placeholder="หมายเหตุ เช่น ราคารวมขนส่ง · ลูกค้าขอรุ่นนี้"
      className="mt-1 h-7 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-gray-700 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
      onFocus={() => setOpen(true)}   // ลบข้อความเดิมจนว่างระหว่างพิมพ์ — ช่องต้องไม่หายกลายเป็นปุ่ม
      onChange={(e) => onChange(e.target.value || null)}
      onBlur={(e) => { if (!e.target.value.trim()) setOpen(false); }} />
  );
}

/** จำนวนบรรทัดที่ต้องจัดการในหมวด — ป้ายบนหัวการ์ด (หน้าแม่นับจากบรรทัดจริง) */
export type CategoryFlags = { pending: number; changed: number };

// การ์ดหมวดของแท็บ "รายการ" (แผน 20261016-04 แบบ A+B) — หัวการ์ดกดพับ/กาง · ตัวเลขหมวดอยู่ขวา · ปุ่มเพิ่มรายการอยู่ในตัวการ์ด
// visible = ตัวกรอง/ค้นหาของแท็บ — ซ่อนบรรทัดที่ไม่ตรง แต่เลขลำดับคงตามใบ (ตรงกับข้อความ "หมวด X ลำดับ N" ตอนบันทึก)
export default function BoqCategorySection({ category, lines, calc, optional = false, readOnly, omParams = null, extra, open, onToggle, share = null, flags,
  visible, highlight = false, scrollMarginTop, onChange, onRemove, onRefresh, onPick, onAddManual, onRemoveAddon }: {
  category: B2bCategory;
  lines: BoqLine[];
  calc: CalcResult;
  /** หมวดเสริมที่เสนอเป็นทางเลือก (ไม่รวมในยอด) */
  optional?: boolean;
  readOnly: boolean;
  /** ช่องตั้งค่า O&M ของใบ — บรรทัดสูตร (om_role) จำนวนคิดให้ แก้มือไม่ได้ (แผน 20261016-03) */
  omParams?: OmParams | null;
  /** กล่องใต้หัวหมวด (หมวด 13 = ช่องตั้งค่า O&M) */
  extra?: ReactNode;
  open: boolean;
  onToggle: () => void;
  /** % ของต้นทุนรวมก่อน VAT (ทางเลือก = null) */
  share?: number | null;
  flags: CategoryFlags;
  visible?: (l: BoqLine) => boolean;
  highlight?: boolean;
  scrollMarginTop?: number;
  onChange: (key: string, patch: Partial<BoqLine>) => void;
  onRemove: (key: string) => void;
  onRefresh: (key: string) => void;
  onPick: () => void;
  onAddManual: () => void;
  onRemoveAddon?: () => void;
}) {
  const sum = calc.categories[category.id];
  const empty = lines.length === 0;
  const rows = lines.map((l, i) => ({ l, i })).filter(({ l }) => !visible || visible(l));
  const btn = "h-8 rounded-lg px-3 text-xs font-semibold whitespace-nowrap";
  const actions = !readOnly && (
    <>
      <button type="button" onClick={onPick} style={{ minHeight: 0 }} className={`${btn} border border-primary/30 bg-white text-primary hover:bg-primary/5`}>+ เลือกจาก Master</button>
      {category.is_addon && (
        <button type="button" onClick={onAddManual} style={{ minHeight: 0 }} className={`${btn} border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100`}>+ ใส่ราคาเอง</button>
      )}
      {onRemoveAddon && empty && (
        <button type="button" onClick={onRemoveAddon} style={{ minHeight: 0 }} className="text-xs text-gray-400 hover:text-red-600">เอาหมวดนี้ออก</button>
      )}
    </>
  );
  const pill = "rounded-full px-2 py-0.5 text-xxs font-semibold whitespace-nowrap";
  const fig = (label: string, value: string, strong = false) => (
    <div><div className="text-xxs text-gray-400">{label}</div><div className={`text-sm tabular-nums ${strong ? "font-bold text-gray-900" : "text-gray-700"}`}>{value}</div></div>
  );

  return (
    <section id={`cat-${category.id}`} style={{ scrollMarginTop }}
      className={`rounded-xl border bg-white overflow-hidden transition-shadow ${highlight ? "border-primary ring-4 ring-primary/20" : "border-gray-200"}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-3 md:px-4">
        <button type="button" onClick={onToggle} style={{ minHeight: 0 }} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <ChevronRightIcon className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`} strokeWidth={2.5} />
          <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${empty ? "bg-gray-50 text-gray-400" : "bg-gray-100 text-gray-600"}`}>{category.id}</span>
          <span className="min-w-0">
            <span className={`block text-sm font-bold leading-snug ${empty ? "text-gray-400" : "text-gray-900"}`}>{category.name}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
              {empty ? "ยังไม่มีรายการ" : `${lines.length} รายการ`}
              {category.is_addon && <span className={`${pill} ${optional ? "bg-gray-100 text-gray-500" : "bg-amber-50 text-amber-700"}`}>ส่วนเพิ่มเติม · {optional ? "ทางเลือก (ไม่รวมในยอด)" : "รวมในราคา"}</span>}
              {flags.pending > 0 && <span className={`${pill} bg-red-50 text-red-600`}>รอราคา {flags.pending}</span>}
              {flags.changed > 0 && <span className={`${pill} bg-amber-100 text-amber-800`}>ราคาเปลี่ยน {flags.changed}</span>}
              {omParams && lines.some((l) => l.om_role) && <span className={`${pill} bg-primary/10 text-primary`}>คิดจากช่องตั้งค่า O&amp;M</span>}
            </span>
          </span>
        </button>
        {empty ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : (
          <div className="flex items-center gap-4 text-right">
            {fig("ต้นทุน", thb0(sum.cost))}
            {fig("ราคาขาย", thb0(sum.sale), true)}
            <div className="max-sm:hidden">{fig("สัดส่วน", share == null ? "—" : `${share.toFixed(1)}%`)}</div>
          </div>
        )}
      </div>

      {open && (extra || !empty) && (
        <div className="border-t border-gray-100">
          {extra}
          {!empty && actions && (
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2 md:px-4">{actions}</div>
          )}
          {!empty && rows.length === 0 && <div className="px-4 py-3 text-sm text-gray-400">ไม่มีบรรทัดตามตัวกรอง/คำค้นในหมวดนี้</div>}
        </div>
      )}

      {open && !empty && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className={`${cell} w-[32px] text-right`}>#</th>
                <th className={cell}>รายการ <span className="font-normal text-gray-400">· ยี่ห้อ · รุ่น / ขนาด</span></th>
                <th className={`${cell} w-[90px] text-right`}>ปริมาณ</th>
                <th className={`${cell} w-[72px]`}>หน่วย</th>
                <th className={`${cell} w-[112px] text-right`}>ต้นทุน/หน่วย</th>
                <th className={`${cell} w-[118px] text-right`}>ต้นทุนรวม</th>
                <th className={`${cell} w-[124px] text-right`}>ราคาขายรวม</th>
                <th className={`${cell} w-[32px]`} />
              </tr>
            </thead>
            <tbody>
              {rows.map(({ l, i }) => {
                const r = calc.lines[l.key];
                const manual = l.line_type === "manual";
                const pct = l.price_basis === "pct_category" || l.price_basis === "pct_sale";
                const changed = !manual && l.current_unit_price != null && l.unit_cost != null && l.current_unit_price !== l.unit_cost;
                // รอราคาแต่ Purchase ใส่ราคาใน Master แล้ว (หน้านี้เปิดค้างไว้ตอน Purchase บันทึก) — กดใช้ได้เลย
                const arrived = !manual && l.unit_cost == null && l.current_unit_price != null;
                const om = l.om_role && omParams ? omQty(l.om_role, omParams) : null;
                return (
                  <tr key={l.key} className={`border-t border-gray-100 align-top ${l.unit_cost == null ? "bg-red-50/40" : changed ? "bg-amber-50/50" : ""}`}>
                    <td className={`${cell} text-right tabular-nums text-gray-400`}>{i + 1}</td>
                    <td className={cell}>
                      {/* ยี่ห้อ · รุ่น อยู่ใต้ชื่อ (แบบ A+B — ตารางแคบลงพอวางข้างเมนูหมวด) */}
                      {manual && !readOnly ? (
                        <>
                          <input className={input} value={l.name} placeholder="ชื่อรายการ" onChange={(e) => onChange(l.key, { name: e.target.value })} />
                          <div className="mt-1 grid grid-cols-2 gap-1">
                            <input className={input} value={l.brand ?? ""} placeholder="ยี่ห้อ" onChange={(e) => onChange(l.key, { brand: e.target.value || null })} />
                            <input className={input} value={l.model ?? ""} placeholder="รุ่น / ขนาด" onChange={(e) => onChange(l.key, { model: e.target.value || null })} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="text-gray-900 break-words">{l.name}</div>
                          {(l.brand || l.model || l.spec_watt) && (
                            <div className="text-xs text-gray-500 break-words">
                              {[l.brand, l.model].filter(Boolean).join(" · ")}
                              {l.spec_watt && !wattInModel(l.model, l.spec_watt) ? <span className="text-gray-400">{l.brand || l.model ? " · " : ""}{l.spec_watt} W</span> : null}
                            </div>
                          )}
                        </>
                      )}
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {l.subgroup && <span title={l.subgroup} className="max-w-full truncate text-xxs text-gray-400">{l.subgroup}</span>}
                        {l.unit_cost == null && !arrived && (
                          <span className="rounded-full bg-red-50 px-1.5 text-xxs font-semibold text-red-600">{manual ? "ยังไม่ใส่ราคา" : "รอราคา (Purchase)"}</span>
                        )}
                        {arrived && (
                          <span className="rounded-full bg-amber-100 px-1.5 text-xxs font-semibold text-amber-800">
                            Purchase ใส่ราคาแล้ว {formatPrice(l.current_unit_price)}
                            {!readOnly && <button type="button" onClick={() => onRefresh(l.key)} style={{ minHeight: 0 }} className="ml-1 underline">ใช้ราคานี้</button>}
                          </span>
                        )}
                        {changed && (
                          <span className="rounded-full bg-amber-100 px-1.5 text-xxs font-semibold text-amber-800">
                            ราคาใน Master เปลี่ยนเป็น {formatPrice(l.current_unit_price)}
                            {!readOnly && <button type="button" onClick={() => onRefresh(l.key)} style={{ minHeight: 0 }} className="ml-1 underline">ใช้ราคาใหม่</button>}
                          </span>
                        )}
                        {l.current_active === false && <span className="rounded-full bg-gray-100 px-1.5 text-xxs text-gray-500">ปิดใช้งานใน Master</span>}
                        {manual && <span className="rounded-full bg-amber-50 px-1.5 text-xxs text-amber-700">ราคาใส่เอง{l.price_entered_by_name ? ` · ${l.price_entered_by_name}` : ""}</span>}
                      </div>
                      {om && <div className="mt-0.5 text-xxs text-primary">จำนวน = {om.how}</div>}
                      <NoteField value={l.note} readOnly={readOnly} onChange={(note) => onChange(l.key, { note })} />
                    </td>
                    <td className={`${cell} text-right`}>
                      {l.price_basis === "system_wp" ? (
                        <span className="tabular-nums text-gray-600" title="ค่าต่อ Wp ใช้ขนาดระบบเป็นปริมาณ">{formatNumber(r?.eff_qty ?? 0)}</span>
                      ) : readOnly || om ? (
                        <span className="tabular-nums" title={om ? "คิดจากช่องตั้งค่า O&M" : undefined}>{formatNumber(l.qty)}</span>
                      ) : (
                        <QtyInput value={l.qty} onChange={(qty) => onChange(l.key, { qty })} />
                      )}
                    </td>
                    <td className={cell}>
                      {manual && !readOnly ? (
                        <div className="space-y-1">
                          <input className={input} value={l.unit} placeholder="หน่วย" onChange={(e) => onChange(l.key, { unit: e.target.value })} />
                          <select className="h-7 w-full rounded-md border border-gray-200 bg-white text-xxs" value={l.price_basis}
                            onChange={(e) => onChange(l.key, { price_basis: e.target.value as BoqLine["price_basis"] })}>
                            <option value="unit">ต่อหน่วย</option>
                            <option value="system_wp">ต่อ Wp</option>
                          </select>
                        </div>
                      ) : <span className="text-gray-600">{l.price_basis === "system_wp" ? "Wp" : l.unit}</span>}
                    </td>
                    <td className={`${cell} text-right tabular-nums`}>
                      {manual && !readOnly ? (
                        <input type="number" min={0} max={BOQ_MAX_MANUAL_COST} step="any" inputMode="decimal" className={`${input} text-right`}
                          value={l.unit_cost ?? ""} onChange={(e) => onChange(l.key, { unit_cost: e.target.value === "" ? null : Number(e.target.value) })} />
                      ) : (
                        <>
                          <div>{l.unit_cost == null ? "—" : money(r?.unit_cost ?? 0)}</div>
                          {(pct || l.price_basis === "watt") && l.unit_cost != null && (
                            <div className="text-xxs text-gray-400">{pct ? `${formatPrice(l.unit_cost)}% ของ${l.price_basis === "pct_sale" ? "ยอดขาย 1–17" : "ต้นทุนหมวด"}` : `${formatPrice(l.unit_cost)} ${priceSuffix(l.price_basis, l.unit)}`}</div>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`${cell} text-right tabular-nums`}>{r ? money(r.cost) : "—"}</td>
                    <td className={`${cell} text-right tabular-nums`}>
                      <div className="font-medium">{r ? money(r.sale) : "—"}</div>
                      {r && l.unit_cost != null && <div className="text-xxs text-gray-400">ต่อหน่วย {money(r.sale_unit)}</div>}
                    </td>
                    <td className={cell}>
                      {!readOnly && (
                        <button type="button" title="ลบบรรทัด" onClick={() => onRemove(l.key)} style={{ minHeight: 0 }}
                          className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-600">×</button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
