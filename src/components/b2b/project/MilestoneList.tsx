"use client";

import { formatThaiDate } from "@/lib/utils/formatters";
import { MILESTONES, milestoneDef, type B2bMilestone, type MilestoneFile, type MilestoneKind } from "@/lib/b2b/execution";

// milestone หน้างานของการ์ดขั้น 06–09 (แผน 20261015-07 เฟส 4) — แถวละเหตุการณ์ตามลำดับใน MILESTONES
//   บันทึกได้เมื่อตัวก่อนหน้า (requires) บันทึกแล้ว · แก้วันที่/หมายเหตุได้ตลอด · ยกเลิกได้เฉพาะรายการล่าสุด (API ตรวจซ้ำ)
export default function MilestoneList({ step, milestones, stage, canEdit, onRecord, onEdit, onUndo, onFile }: {
  step: number;
  /** ทั้งโครงการ เรียงตามเวลาบันทึก (ตัวท้าย = ล่าสุด) */
  milestones: B2bMilestone[];
  stage: number;
  canEdit: boolean;
  onRecord: (kind: MilestoneKind) => void;
  onEdit: (m: B2bMilestone) => void;
  onUndo: (m: B2bMilestone) => void;
  onFile: (m: B2bMilestone, f: MilestoneFile) => void;
}) {
  const defs = MILESTONES.filter((d) => d.step === step);
  const byKind = new Map(milestones.map((m) => [m.kind, m]));
  const latest = milestones[milestones.length - 1];
  const btn = "h-8 px-3 rounded-lg text-xs font-semibold whitespace-nowrap";
  return (
    <ul className="rounded-xl border border-gray-200 bg-white divide-y divide-gray-100">
      {defs.map((d) => {
        const m = byKind.get(d.kind);
        const blocked = d.requires && !byKind.has(d.requires) ? milestoneDef(d.requires)!.label : null;
        return (
          <li key={d.kind} className="flex gap-3 px-3 py-2.5">
            <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${m ? "bg-emerald-500 text-white" : "ring-1 ring-inset ring-gray-300 text-transparent"}`}>✓</span>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className={`text-sm font-semibold ${m ? "text-gray-900" : "text-gray-600"}`}>{d.label}</span>
                {m && <span className="text-sm text-gray-700">{formatThaiDate(m.done_date)}</span>}
              </div>
              {m ? (
                <>
                  {m.note && <div className="text-xs text-gray-600 whitespace-pre-line break-words">{m.note}</div>}
                  <div className="text-xs text-gray-400">บันทึกโดย {m.created_by_name ?? "—"}</div>
                  {m.files.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {m.files.map((f) => (
                        <button key={f.file} type="button" onClick={() => onFile(m, f)} style={{ minHeight: 0 }}
                          className="max-w-[14rem] truncate rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-primary hover:bg-gray-100">
                          {f.mime === "application/pdf" ? "📄" : "🖼"} {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xs text-gray-400">{blocked ? `ต้องบันทึก "${blocked}" ก่อน` : d.hint ?? "ยังไม่บันทึก"}</div>
              )}
            </div>
            {canEdit && (
              <div className="flex flex-col items-end gap-1.5 shrink-0">
                {!m && !blocked && <button type="button" onClick={() => onRecord(d.kind)} className={`${btn} border border-active text-active hover:bg-active-light`}>บันทึก</button>}
                {m && <button type="button" onClick={() => onEdit(m)} className={`${btn} border border-gray-200 text-gray-600 hover:bg-gray-50`}>แก้</button>}
                {m && latest?.id === m.id && stage === m.stage_after && (
                  <button type="button" onClick={() => onUndo(m)} style={{ minHeight: 0 }} className="text-xs font-semibold text-red-600 hover:underline">ยกเลิกการบันทึก</button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
