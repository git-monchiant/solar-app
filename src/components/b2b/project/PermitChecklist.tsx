"use client";

import { formatThaiDate } from "@/lib/utils/formatters";
import { PERMITS, PERMIT_STATUS_LABEL, PERMIT_STATUS_TONE, type B2bPermit, type PermitKind } from "@/lib/b2b/execution";

// เช็กลิสต์ขออนุญาต 3 อย่าง (แผน 20261015-07 เฟส 4) — ทำคู่ขนานกับจัดซื้อ/ติดตั้ง · only = แสดงเฉพาะบางอย่าง (การ์ดขนานไฟ = ผลพิจารณาการไฟฟ้า)
export default function PermitChecklist({ permits, only, canEdit, onEdit, onFile }: {
  permits: B2bPermit[];
  only?: PermitKind[];
  canEdit: boolean;
  onEdit: (p: B2bPermit) => void;
  onFile: (p: B2bPermit) => void;
}) {
  const rows = PERMITS.filter((d) => !only || only.includes(d.kind));
  const done = permits.filter((p) => p.status === "approved" || p.status === "not_required").length;
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {!only && (
        <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
          <h3 className="text-sm font-bold text-gray-900">ขออนุญาต</h3>
          <span className="ml-auto text-xs text-gray-500">เรียบร้อย <b className="text-gray-800 tabular-nums">{done}</b> / {PERMITS.length}</span>
        </div>
      )}
      <ul className="divide-y divide-gray-100">
        {rows.map((d) => {
          const p = permits.find((x) => x.kind === d.kind);
          if (!p) return null;
          return (
            <li key={d.kind} className="flex gap-3 px-3 py-2.5">
              <div className="flex-1 min-w-0">
                <div className="text-sm text-gray-800">{d.label}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                  <span className={`inline-flex rounded-full px-2 py-0.5 font-semibold ${PERMIT_STATUS_TONE[p.status]}`}>{PERMIT_STATUS_LABEL[p.status]}</span>
                  {p.submitted_date && <span>ยื่น {formatThaiDate(p.submitted_date)}</span>}
                  {p.approved_date && <span>ได้ {formatThaiDate(p.approved_date)}</span>}
                  {p.has_file && (
                    <button type="button" onClick={() => onFile(p)} style={{ minHeight: 0 }} className="max-w-[14rem] truncate text-primary hover:underline">📄 {p.file_label ?? "เอกสาร"}</button>
                  )}
                </div>
                {p.note && <div className="text-xs text-gray-500 break-words">{p.note}</div>}
              </div>
              {canEdit && (
                <button type="button" onClick={() => onEdit(p)}
                  className="h-8 px-3 shrink-0 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 whitespace-nowrap">อัปเดต</button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
