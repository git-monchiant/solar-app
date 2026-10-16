"use client";

import { formatTHB } from "@/lib/utils/formatters";
import { perWp, type AddonMode, type Amount, type CalcResult } from "@/lib/b2b/boq-calc";
import type { B2bCategory } from "@/lib/b2b/materials";

// ตารางสรุปของใบ BOQ — เรียงตามแถว 10–40 ของ sheet "EPCL - BOQS"
// หมวดมาตรฐาน 1–18 แสดงครบเสมอ (แบบไฟล์) · ส่วนเพิ่มเติมแสดงเฉพาะที่ใส่ในใบ พร้อมตัวเลือก รวมในราคา / ทางเลือก
// ท้ายตาราง: ค่าวัสดุ + ค่าแรง + ส่วนเพิ่มเติมที่รวม = ยอดก่อน VAT เสมอ (ไฟล์เดิมขาดส่วนเสริม)

const money = (n: number) => formatTHB(n, { decimals: 2 });
// มีเงินแต่น้อยกว่าที่ 2 ตำแหน่งแสดงได้ → "<0.01" ไม่ใช่ "0.00" (ดูเหมือนไม่มีค่าใช้จ่าย)
const wp = (n: number, cap: number) => {
  if (cap <= 0) return "—";
  const v = perWp(n, cap);
  return v > 0 && v < 0.005 ? "<0.01" : v.toFixed(2);
};

export default function BoqSummary({ categories, calc, addonIds, addonModes, readOnly, vatPct, onMode, onJump }: {
  categories: B2bCategory[];
  calc: CalcResult;
  addonIds: number[];
  addonModes: Record<number, AddonMode>;
  readOnly: boolean;
  vatPct: number;
  onMode: (categoryId: number, mode: AddonMode) => void;
  onJump: (categoryId: number) => void;
}) {
  const cap = calc.capacity_wp;
  const th = "px-3 py-2 font-semibold text-right";
  const row = (c: B2bCategory) => {
    const r = calc.categories[c.id];
    const empty = !r || r.lines === 0;
    return (
      <tr key={c.id} className={`border-t border-gray-100 ${empty ? "text-gray-400" : "text-gray-800"}`}>
        <td className="px-3 py-1.5 w-10 text-right tabular-nums">{c.id}</td>
        <td className="px-3 py-1.5">
          <button type="button" onClick={() => onJump(c.id)} style={{ minHeight: 0 }} className={`text-left hover:underline ${empty ? "" : "text-gray-900"}`}>{c.name}</button>
          {r?.pending ? <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xxs font-semibold text-red-600">รอราคา {r.pending}</span> : null}
          {c.is_addon && (
            <select disabled={readOnly} value={addonModes[c.id] ?? "included"} onChange={(e) => onMode(c.id, e.target.value as AddonMode)}
              className="ml-2 h-7 rounded-md border border-gray-200 bg-white px-1.5 text-xs text-gray-700 disabled:bg-gray-50">
              <option value="included">รวมในราคา</option>
              <option value="optional">เสนอเป็นทางเลือก</option>
            </select>
          )}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums">{empty ? "—" : wp(r.cost, cap)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{empty ? "—" : money(r.cost)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums">{empty ? "—" : wp(r.sale, cap)}</td>
        {/* medium ไม่ใช่ semibold — ฟอนต์ไม่มี 600 จะกลายเป็นตัวหนา 700 (แบบหน้ารายการ BOQ) */}
        <td className="px-3 py-1.5 text-right tabular-nums font-medium">{empty ? "—" : money(r.sale)}</td>
      </tr>
    );
  };
  const total = (label: string, a: Amount, strong = false, note = "") => (
    <tr className={`border-t border-gray-200 ${strong ? "bg-slate-50 font-bold text-gray-900" : "text-gray-700"}`}>
      <td />
      <td className="px-3 py-2">{label}{note && <span className="ml-2 text-xxs font-normal text-gray-400">{note}</span>}</td>
      <td className="px-3 py-2 text-right tabular-nums">{wp(a.cost, cap)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{money(a.cost)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{wp(a.sale, cap)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{money(a.sale)}</td>
    </tr>
  );
  const std = categories.filter((c) => !c.is_addon);
  const addons = categories.filter((c) => c.is_addon && addonIds.includes(c.id));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="bg-gray-50 text-xs text-gray-500">
            <th className="px-3 py-2 w-10" />
            <th className="px-3 py-2 text-left font-semibold">หมวด</th>
            <th className={th}>ต้นทุน/Wp</th>
            <th className={th}>ต้นทุน (บาท)</th>
            <th className={th}>ราคาขาย/Wp</th>
            <th className={th}>ราคาขาย (บาท)</th>
          </tr>
        </thead>
        <tbody>
          {std.map(row)}
          {addons.length > 0 && (
            <tr className="border-t border-gray-200"><td /><td colSpan={5} className="px-3 py-2 text-xs font-bold text-amber-700">ส่วนเพิ่มเติมจากการเสนอราคาแบบมาตรฐาน (Optional Add-on Services)</td></tr>
          )}
          {addons.map(row)}
          {total("ราคาค่าวัสดุอุปกรณ์", calc.material)}
          {total("ราคาค่าแรงติดตั้ง", calc.labor)}
          {addons.length > 0 && total("ส่วนเพิ่มเติมที่รวมในราคา", calc.addon_included)}
          {total("รวมเป็นเงิน (ก่อน VAT)", calc.subtotal, true)}
          {total(`ภาษีมูลค่าเพิ่ม ${vatPct}%`, calc.vat)}
          {total("รวมเงินสุทธิ (รวม VAT)", calc.grand, true)}
          {calc.addon_optional.cost > 0 && total("ราคาทางเลือก (ไม่รวมในยอด)", calc.addon_optional, false, "ส่วนเพิ่มเติมที่เสนอให้ลูกค้าเลือก · ก่อน VAT")}
        </tbody>
      </table>
    </div>
  );
}
