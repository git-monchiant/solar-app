"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { XIcon } from "@/components/ui/icons";
import { formatThaiDate } from "@/lib/utils/formatters";
import { formatPrice, priceSuffix, type B2bMaterial, type B2bPriceHistory } from "@/lib/b2b/materials";

// ประวัติราคาของรายการ Master — ล่าสุดก่อน (ราคาเดิม → ราคาใหม่ · ส่วนต่าง · ใคร · เมื่อไร · หมายเหตุ)
// ราคาเป็นต้นทุน: ขึ้น = แดง · ลง = เขียว

const fmtPct = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });

function Change({ from, to }: { from: number | null; to: number | null }) {
  if (from == null || to == null) return <span className="text-xs text-gray-400">ราคาแรก</span>;
  const diff = to - from;
  if (diff === 0) return <span className="text-gray-300">—</span>;
  const up = diff > 0;
  return (
    <span className={`font-mono tabular-nums whitespace-nowrap ${up ? "text-red-600" : "text-emerald-600"}`}>
      {up ? "▲" : "▼"} {formatPrice(Math.abs(diff))}
      {from !== 0 && <span className="text-xs opacity-80"> ({up ? "+" : "−"}{fmtPct.format(Math.abs(diff / from) * 100)}%)</span>}
    </span>
  );
}

export default function PriceHistoryModal({ material, onClose }: { material: B2bMaterial; onClose: () => void }) {
  const [rows, setRows] = useState<B2bPriceHistory[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch(`/api/b2b/materials/${material.id}/prices`)
      .then((r: B2bPriceHistory[]) => setRows(r))
      .catch((e) => setErr(e instanceof Error ? e.message : "โหลดประวัติราคาไม่สำเร็จ"));
  }, [material.id]);

  const suffix = priceSuffix(material.price_basis, material.unit);

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[1px] z-50 flex items-start justify-center p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl shadow-slate-900/20 w-full max-w-2xl my-2">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between rounded-t-2xl">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">ประวัติราคา</h2>
            <p className="text-xs text-gray-400 mt-0.5 truncate">{material.code} · {material.name}{material.model ? ` · ${material.model}` : ""}</p>
          </div>
          <button type="button" onClick={onClose} style={{ minHeight: 0 }} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
            <XIcon className="w-5 h-5 text-gray-500" strokeWidth={2} />
          </button>
        </div>
        <div className="p-4 md:p-6">
          {err ? (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>
          ) : rows == null ? (
            <div className="py-8 text-center text-sm text-gray-400">กำลังโหลด…</div>
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-gray-400">ยังไม่เคยใส่ราคา</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                    <th className="py-2 pr-4 font-semibold">วันที่</th>
                    <th className="py-2 pr-4 font-semibold text-right">ราคาเดิม</th>
                    <th className="py-2 pr-4 font-semibold text-right">ราคาใหม่</th>
                    <th className="py-2 pr-4 font-semibold text-right">เปลี่ยน</th>
                    <th className="py-2 pr-4 font-semibold">โดย</th>
                    <th className="py-2 font-semibold">หมายเหตุ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((h) => (
                    <tr key={h.id} className="border-b border-gray-100 last:border-b-0 align-top">
                      <td className="py-2 pr-4 whitespace-nowrap text-gray-600">{formatThaiDate(h.changed_at, { time: true })}</td>
                      <td className="py-2 pr-4 text-right font-mono tabular-nums text-gray-400 whitespace-nowrap">{formatPrice(h.old_price)}</td>
                      {/* ตัวเลข + หน่วยเล็กสีเทา แบบเดียวกับช่องราคาในตารางหลัก */}
                      <td className="py-2 pr-4 text-right whitespace-nowrap">
                        <span className="font-mono tabular-nums font-semibold text-gray-900">{formatPrice(h.new_price)}</span>
                        {h.new_price != null && <span className="text-xxs text-gray-400"> {suffix}</span>}
                      </td>
                      <td className="py-2 pr-4 text-right"><Change from={h.old_price} to={h.new_price} /></td>
                      {/* ไม่มีชื่อผู้แก้ = สคริปต์นำเข้า (ทาง API ต้องล็อกอินเสมอ) */}
                      <td className="py-2 pr-4 whitespace-nowrap text-gray-600">{h.changed_by_name ?? <span className="text-gray-400">ระบบ</span>}</td>
                      <td className="py-2 text-gray-500 break-words">{h.note ?? ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
