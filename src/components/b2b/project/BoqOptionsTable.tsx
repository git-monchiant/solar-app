"use client";

import Link from "next/link";
import { formatThaiDate, formatTHB } from "@/lib/utils/formatters";
import { perWp } from "@/lib/b2b/boq-calc";
import type { B2bProjectBoq } from "@/lib/b2b/project";

// BOQ ของโครงการ — 1 แถว = 1 ตัวเลือกขนาด (Rev ล่าสุดของเลขที่นั้น) · กดแถวไปหน้าทำ BOQ
// คอลัมน์ตัวเลขแบบหน้ารายการ BOQ (ก่อน VAT · บาท/Wp จากยอดขาย)
// canView = role ดู BOQ ได้ — ไม่ได้ (บัญชี) ไม่มีคอลัมน์ต้นทุน/Margin (API ไม่ส่งมาอยู่แล้ว) และชื่อตัวเลือกไม่เป็นลิงก์
export default function BoqOptionsTable({ boqs, onAdd, canAdd, canView }: { boqs: B2bProjectBoq[]; onAdd?: () => void; canAdd: boolean; canView: boolean }) {
  const num = "px-3 py-2 text-right tabular-nums whitespace-nowrap";
  const name = (b: B2bProjectBoq) => b.option_label || "ไม่ระบุชื่อตัวเลือก";
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <h3 className="text-sm font-bold text-gray-900 whitespace-nowrap">BOQ ของโครงการ</h3>
        {/* มือถือซ่อนคำอธิบาย — แถวหัวแคบ ตัวหนังสือตัดหลายบรรทัดดันปุ่มเบี้ยว */}
        <span className="max-md:hidden text-xs text-gray-400">เลือกได้หลายขนาด · แต่ละตัวมี Rev ของตัวเอง</span>
        {canAdd && onAdd && (
          <button type="button" onClick={onAdd} className="ml-auto h-8 px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 whitespace-nowrap">+ BOQ ขนาดใหม่</button>
        )}
      </div>
      {boqs.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มี BOQ{canAdd ? " — กด \"+ BOQ ขนาดใหม่\" เพื่อเริ่มทำราคา" : ""}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="px-3 py-2 font-semibold">ตัวเลือก</th>
                <th className="px-3 py-2 font-semibold whitespace-nowrap">เลขที่ · Rev</th>
                <th className={`${num} font-semibold`}>kWp</th>
                {canView && <th className={`${num} font-semibold`}>ต้นทุน</th>}
                <th className={`${num} font-semibold`}>ราคาขาย (ก่อน VAT)</th>
                {canView && <th className={`${num} font-semibold`}>Margin</th>}
                <th className={`${num} font-semibold`}>ขาย บาท/Wp</th>
                <th className="px-3 py-2 font-semibold">บันทึกล่าสุด</th>
              </tr>
            </thead>
            <tbody>
              {boqs.map((b) => (
                <tr key={b.id} className="border-t border-gray-100 hover:bg-primary/5">
                  <td className="px-3 py-2 min-w-[12rem]">
                    {canView
                      ? <Link href={`/b2b/boq/${b.id}`} className="font-semibold text-gray-900 hover:text-primary">{name(b)}</Link>
                      : <span className="font-semibold text-gray-900">{name(b)}</span>}
                    {b.pending_lines > 0 && <span className="ml-2 rounded-full bg-red-50 px-2 py-0.5 text-xxs font-semibold text-red-600">รอราคา {b.pending_lines}</span>}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-600">{b.doc_no} <span className="text-gray-400">Rev {b.revision}</span></td>
                  <td className={num}>{b.capacity_wp ? formatTHB(b.capacity_wp / 1000, { decimals: 2 }) : "—"}</td>
                  {canView && <td className={num}>{b.total_cost ? formatTHB(b.total_cost, { decimals: 0 }) : "—"}</td>}
                  <td className={`${num} font-medium`}>{b.total_sale ? formatTHB(b.total_sale, { decimals: 0 }) : "—"}</td>
                  {canView && <td className={num}>{b.margin_pct != null ? `${b.margin_pct}%` : "—"}</td>}
                  <td className={num}>{b.capacity_wp && b.total_sale ? perWp(b.total_sale, b.capacity_wp).toFixed(2) : "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-gray-500">{formatThaiDate(b.updated_at)}{b.updated_by_name ? <div className="text-xs text-gray-400">{b.updated_by_name}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
