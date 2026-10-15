"use client";

import { useState } from "react";
import { formatThaiDate } from "@/lib/utils/formatters";
import { stageLabel, type B2bActivity } from "@/lib/b2b/project";

// timeline ของโครงการ — ใหม่ก่อน · ช่องบันทึกข้อความอยู่บนสุด (แบบ Activity Log ของหน้าลีด)
const KIND: Record<string, string> = {
  created: "สร้างโครงการ", stage: "เปลี่ยนขั้น", survey_scheduled: "นัดสำรวจ", survey_done: "บันทึกผลสำรวจ",
  boq_created: "เพิ่ม BOQ", boq_revision: "BOQ Revision ใหม่", lost: "แพ้งาน", cancelled: "ยกเลิก", reopened: "เปิดกลับ",
  edited: "แก้ข้อมูล", note: "บันทึก",
};

export default function ActivityList({ activities, onNote, readOnly }: {
  activities: B2bActivity[];
  onNote?: (message: string) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!onNote || !text.trim()) return;
    setBusy(true);
    if (await onNote(text.trim())) setText("");
    setBusy(false);
  };
  return (
    <div>
      {onNote && !readOnly && (
        <div className="flex gap-2 px-4 py-3 border-b border-gray-100">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            placeholder="บันทึกการคุย / ความคืบหน้า…" className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()}
            className="h-9 px-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40">บันทึก</button>
        </div>
      )}
      {activities.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">ยังไม่มีความเคลื่อนไหว</div>
      ) : (
        <ul>
          {activities.map((a) => (
            <li key={a.id} className="px-4 py-2.5 border-b border-gray-100 text-sm">
              <div className="text-xs text-gray-400">{formatThaiDate(a.created_at, { time: true })}{a.created_by_name ? ` · ${a.created_by_name}` : ""}</div>
              <div className="font-semibold text-gray-800">{KIND[a.kind] ?? a.kind}</div>
              {a.message && <div className="text-gray-600 whitespace-pre-line break-words">{a.message}</div>}
              {a.from_stage != null && a.to_stage != null && a.from_stage !== a.to_stage && (
                <span className="mt-1 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{stageLabel(a.from_stage)} → {stageLabel(a.to_stage)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
