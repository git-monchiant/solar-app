"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { XIcon } from "@/components/ui/icons";
import { formatThaiDate } from "@/lib/utils/formatters";
import { formatPrice, priceSuffix, type B2bMaterial, type B2bPriceHistory } from "@/lib/b2b/materials";

// ประวัติราคาของรายการ Master — ล่าสุดก่อน (ราคาเดิม → ราคาใหม่ · ใคร · เมื่อไร · หมายเหตุ)
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
          <button type="button" onClick={onClose} className="w-9 h-9 shrink-0 rounded-full hover:bg-gray-100 flex items-center justify-center transition-colors">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2 pr-3 font-semibold">วันที่</th>
                  <th className="py-2 pr-3 font-semibold text-right">ราคาเดิม</th>
                  <th className="py-2 pr-3 font-semibold text-right">ราคาใหม่</th>
                  <th className="py-2 pr-3 font-semibold">โดย</th>
                  <th className="py-2 font-semibold">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className="border-b border-gray-100 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-gray-600">{formatThaiDate(h.changed_at, { time: true })}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-gray-400">{formatPrice(h.old_price)}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums font-semibold text-gray-900">{formatPrice(h.new_price)}</td>
                    <td className="py-2 pr-3 text-gray-600">{h.changed_by_name ?? "—"}</td>
                    <td className="py-2 text-gray-500">{h.note ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-3 text-xs text-gray-400">หน่วยราคา: {suffix}</p>
        </div>
      </div>
    </div>
  );
}
