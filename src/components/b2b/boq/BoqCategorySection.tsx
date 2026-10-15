"use client";

import { useState } from "react";
import { formatNumber, formatTHB } from "@/lib/utils/formatters";
import type { CalcResult } from "@/lib/b2b/boq-calc";
import { formatPrice, priceSuffix, type B2bCategory } from "@/lib/b2b/materials";
import { wattInModel, type BoqLine } from "@/lib/b2b/boq";

// รายละเอียดหมวดหนึ่งของใบ BOQ — ตาราง "ลำดับ · รายการ · ยี่ห้อ · รุ่น · ปริมาณ · หน่วย · ต้นทุน · ราคาขาย" ตาม sheet EPCL - BOQS (คอลัมน์ % มีเฉพาะใน Excel — ผู้ใช้ไม่เอาบนจอ 6 ต.ค. 69)
// หมวด 1–18: บรรทัดมาจาก Master อย่างเดียว (แก้ได้แค่จำนวน) · หมวดเสริม 19–25: ใส่ราคาเองได้ (เคาะ 6 ต.ค. 69)

const money = (n: number) => formatTHB(n, { decimals: 2 });
const cell = "px-2 py-1.5";
const input = "h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 disabled:bg-transparent disabled:border-transparent";

/** ช่องปริมาณ — เก็บข้อความที่พิมพ์ไว้เองระหว่างแก้ ไม่งั้นลบจนว่างแล้ว qty = 0 → React เติม "0" กลับทันที (ลบ 0 ไม่ออก / พิมพ์ต่อเป็น "05")
 *  ว่างระหว่างพิมพ์ = คิดเป็น 0 · ออกจากช่องแล้วแสดงค่าจริง · คลิกเข้าช่อง = เลือกทั้งหมด พิมพ์ทับได้เลย */
function QtyInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <input type="number" min={0} step="any" inputMode="decimal" className={`${input} text-right tabular-nums`}
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

export default function BoqCategorySection({ category, lines, calc, optional = false, readOnly, onChange, onRemove, onRefresh, onPick, onAddManual, onRemoveAddon }: {
  category: B2bCategory;
  lines: BoqLine[];
  calc: CalcResult;
  /** หมวดเสริมที่เสนอเป็นทางเลือก (ไม่รวมในยอด) */
  optional?: boolean;
  readOnly: boolean;
  onChange: (key: string, patch: Partial<BoqLine>) => void;
  onRemove: (key: string) => void;
  onRefresh: (key: string) => void;
  onPick: () => void;
  onAddManual: () => void;
  onRemoveAddon?: () => void;
}) {
  const sum = calc.categories[category.id];
  const empty = lines.length === 0;

  return (
    <section id={`cat-${category.id}`} className="scroll-mt-24 rounded-xl border border-gray-300 bg-white overflow-hidden">
      <div className={`flex flex-wrap items-center gap-2 px-4 ${empty ? "py-2" : "py-3 border-b border-gray-200"}`}>
        <h3 className={`text-sm font-bold ${empty ? "text-gray-400" : "text-gray-900"}`}>{category.id}. {category.name}</h3>
        {category.is_addon && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xxs font-bold uppercase tracking-wide text-amber-700">ส่วนเพิ่มเติม{optional ? " · ทางเลือก (ไม่รวมในยอด)" : ""}</span>}
        {!empty && <span className="text-xs text-gray-500 tabular-nums">ต้นทุน {money(sum.cost)} · ขาย <span className="font-medium text-gray-800">{money(sum.sale)}</span></span>}
        {!readOnly && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={onPick} style={{ minHeight: 0 }}
              className="h-8 rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-semibold text-primary hover:bg-primary/10">+ เลือกจาก Master</button>
            {category.is_addon && (
              <button type="button" onClick={onAddManual} style={{ minHeight: 0 }}
                className="h-8 rounded-lg border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-700 hover:bg-amber-100">+ ใส่ราคาเอง</button>
            )}
            {onRemoveAddon && empty && (
              <button type="button" onClick={onRemoveAddon} style={{ minHeight: 0 }} className="text-xs text-gray-400 hover:text-red-600">เอาหมวดนี้ออก</button>
            )}
          </div>
        )}
      </div>

      {!empty && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1140px] table-fixed text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs text-gray-500">
                <th className={`${cell} w-[32px] text-right`}>#</th>
                <th className={cell}>รายการ</th>
                <th className={`${cell} w-[90px]`}>ยี่ห้อ</th>
                <th className={`${cell} w-[140px]`}>รุ่น / ขนาด</th>
                <th className={`${cell} w-[86px] text-right`}>ปริมาณ</th>
                <th className={`${cell} w-[64px]`}>หน่วย</th>
                <th className={`${cell} w-[108px] text-right`}>ต้นทุน/หน่วย</th>
                <th className={`${cell} w-[112px] text-right`}>ต้นทุนรวม</th>
                <th className={`${cell} w-[100px] text-right`}>ขาย/หน่วย</th>
                <th className={`${cell} w-[116px] text-right`}>ราคาขายรวม</th>
                <th className={`${cell} w-[32px]`} />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => {
                const r = calc.lines[l.key];
                const manual = l.line_type === "manual";
                const pct = l.price_basis === "pct_category" || l.price_basis === "pct_sale";
                const changed = !manual && l.current_unit_price != null && l.unit_cost != null && l.current_unit_price !== l.unit_cost;
                // รอราคาแต่ Purchase ใส่ราคาใน Master แล้ว (หน้านี้เปิดค้างไว้ตอน Purchase บันทึก) — กดใช้ได้เลย
                const arrived = !manual && l.unit_cost == null && l.current_unit_price != null;
                return (
                  <tr key={l.key} className={`border-t border-gray-100 align-top ${l.unit_cost == null ? "bg-red-50/40" : changed ? "bg-amber-50/50" : ""}`}>
                    <td className={`${cell} text-right tabular-nums text-gray-400`}>{i + 1}</td>
                    <td className={cell}>
                      {manual && !readOnly ? (
                        <input className={input} value={l.name} placeholder="ชื่อรายการ" onChange={(e) => onChange(l.key, { name: e.target.value })} />
                      ) : (
                        <div className="text-gray-900 break-words">{l.name}</div>
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
                    </td>
                    <td className={cell}>
                      {manual && !readOnly ? <input className={input} value={l.brand ?? ""} onChange={(e) => onChange(l.key, { brand: e.target.value || null })} />
                        : <span className="text-gray-600 break-words">{l.brand ?? ""}</span>}
                    </td>
                    <td className={cell}>
                      {manual && !readOnly ? <input className={input} value={l.model ?? ""} onChange={(e) => onChange(l.key, { model: e.target.value || null })} />
                        : <span className="text-gray-600 break-words">{l.model ?? ""}{l.spec_watt && !wattInModel(l.model, l.spec_watt) ? <span className="text-gray-400"> · {l.spec_watt} W</span> : null}</span>}
                    </td>
                    <td className={`${cell} text-right`}>
                      {l.price_basis === "system_wp" ? (
                        <span className="tabular-nums text-gray-600" title="ค่าต่อ Wp ใช้ขนาดระบบเป็นปริมาณ">{formatNumber(r?.eff_qty ?? 0)}</span>
                      ) : readOnly ? (
                        <span className="tabular-nums">{formatNumber(l.qty)}</span>
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
                        <input type="number" min={0} step="any" inputMode="decimal" className={`${input} text-right`}
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
                    <td className={`${cell} text-right tabular-nums text-gray-600`}>{r && l.unit_cost != null ? money(r.sale_unit) : "—"}</td>
                    <td className={`${cell} text-right tabular-nums font-medium`}>{r ? money(r.sale) : "—"}</td>
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
