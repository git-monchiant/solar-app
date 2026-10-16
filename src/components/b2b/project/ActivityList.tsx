"use client";

import { useState } from "react";
import { formatThaiDate, formatThaiTime } from "@/lib/utils/formatters";
import { stageLabel, type B2bActivity } from "@/lib/b2b/project";

// timeline ของโครงการ — ใหม่ก่อน · ช่องบันทึกข้อความอยู่บนสุด (แบบ Activity Log ของหน้าลีด)
// แผน 20261016-01: จัดกลุ่มตามวัน · ไอคอนตามประเภท · ตัวกรอง (บันทึก / เปลี่ยนขั้น / เอกสาร / เงิน / หน้างาน)
const KIND: Record<string, string> = {
  created: "สร้างโครงการ", stage: "เปลี่ยนขั้น", survey_scheduled: "นัดสำรวจ", survey_done: "บันทึกผลสำรวจ",
  boq_created: "เพิ่ม BOQ", boq_revision: "BOQ Revision ใหม่", lost: "แพ้งาน", cancelled: "ยกเลิก", reopened: "เปิดกลับ",
  edited: "แก้ข้อมูล", note: "บันทึก",
  quote_created: "สร้างใบเสนอราคา", quote_submitted: "ส่งอนุมัติใบเสนอราคา", quote_approved: "อนุมัติใบเสนอราคา",
  quote_returned: "ส่งกลับแก้ใบเสนอราคา", quote_revision: "ใบเสนอราคา Rev ใหม่", quote_sent: "ส่งใบเสนอราคาให้ลูกค้า",
  won: "ได้งาน", contract: "บันทึกสัญญา", installment_due: "งวดถึงกำหนด", installment_submitted: "แนบหลักฐานรับเงิน",
  installment_rejected: "บัญชีตีกลับหลักฐาน", installment_paid: "บัญชียืนยันรับเงิน",
  milestone: "บันทึกหน้างาน", milestone_edited: "แก้บันทึกหน้างาน", milestone_undone: "ยกเลิกบันทึกหน้างาน",
  permit: "ขออนุญาต", closed: "ปิดโครงการ", om_contract: "สัญญา O&M", files_added: "แนบไฟล์", file_removed: "ลบไฟล์", boq_priced: "ราคาเข้า BOQ",
};

type Group = "note" | "stage" | "doc" | "money" | "site";
/** ไอคอน + สีวง + กลุ่มตัวกรอง (ไม่มี group = เห็นเฉพาะ "ทั้งหมด") */
const LOOK: Record<string, { icon: string; tone: string; group?: Group }> = {
  created: { icon: "✦", tone: "bg-amber-50", group: "stage" },
  stage: { icon: "➜", tone: "bg-active-light text-active-dark", group: "stage" },
  reopened: { icon: "↺", tone: "bg-active-light text-active-dark", group: "stage" },
  won: { icon: "🏆", tone: "bg-emerald-50", group: "stage" },
  closed: { icon: "✅", tone: "bg-emerald-50", group: "stage" },
  lost: { icon: "✕", tone: "bg-red-50 text-red-600", group: "stage" },
  cancelled: { icon: "⊘", tone: "bg-gray-100 text-gray-500", group: "stage" },
  note: { icon: "💬", tone: "bg-sky-50", group: "note" },
  edited: { icon: "✎", tone: "bg-gray-100 text-gray-500" },
  survey_scheduled: { icon: "📅", tone: "bg-blue-50", group: "site" },
  survey_done: { icon: "🔍", tone: "bg-emerald-50", group: "site" },
  milestone: { icon: "🔧", tone: "bg-blue-50", group: "site" },
  milestone_edited: { icon: "🔧", tone: "bg-gray-100", group: "site" },
  milestone_undone: { icon: "↩", tone: "bg-gray-100 text-gray-500", group: "site" },
  boq_created: { icon: "🧮", tone: "bg-gray-100", group: "doc" },
  boq_revision: { icon: "🧮", tone: "bg-gray-100", group: "doc" },
  boq_priced: { icon: "🧮", tone: "bg-gray-100", group: "doc" },
  contract: { icon: "✍", tone: "bg-gray-100", group: "doc" },
  permit: { icon: "📑", tone: "bg-gray-100", group: "doc" },
  files_added: { icon: "📎", tone: "bg-gray-100", group: "doc" },
  file_removed: { icon: "📎", tone: "bg-gray-100", group: "doc" },
  om_contract: { icon: "⚡", tone: "bg-yellow-50", group: "doc" },
  installment_due: { icon: "💰", tone: "bg-amber-50", group: "money" },
  installment_submitted: { icon: "💰", tone: "bg-amber-50", group: "money" },
  installment_rejected: { icon: "💰", tone: "bg-red-50", group: "money" },
  installment_paid: { icon: "💰", tone: "bg-emerald-50", group: "money" },
};
const QUOTE_LOOK = { icon: "📄", tone: "bg-active-light", group: "doc" as Group };
const OTHER_LOOK = { icon: "•", tone: "bg-gray-100" };
const lookOf = (kind: string) => LOOK[kind] ?? (kind.startsWith("quote_") ? QUOTE_LOOK : OTHER_LOOK);

const FILTERS: { key: "all" | Group; label: string }[] = [
  { key: "all", label: "ทั้งหมด" }, { key: "note", label: "บันทึก" }, { key: "stage", label: "เปลี่ยนขั้น" },
  { key: "doc", label: "เอกสาร" }, { key: "money", label: "เงิน" }, { key: "site", label: "หน้างาน" },
];

const isMove = (a: B2bActivity) => a.from_stage != null && a.to_stage != null && a.from_stage !== a.to_stage;

export default function ActivityList({ activities, onNote, readOnly }: {
  activities: B2bActivity[];
  onNote?: (message: string) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | Group>("all");
  // ป้าย "วันนี้" — จับครั้งเดียวตอนแสดง (render ต้องให้ผลเดิมทุกครั้ง)
  const [today] = useState(() => formatThaiDate(new Date()));
  const send = async () => {
    if (!onNote || !text.trim()) return;
    setBusy(true);
    if (await onNote(text.trim())) setText("");
    setBusy(false);
  };

  // ตัวกรองเปลี่ยนขั้นนับทุกแถวที่ขยับขั้นด้วย (บันทึกผลสำรวจ · บันทึกหน้างานที่ขยับขั้น · ได้งาน)
  const shown = filter === "all" ? activities : activities.filter((a) => lookOf(a.kind).group === filter || (filter === "stage" && isMove(a)));
  const days: { day: string; items: B2bActivity[] }[] = [];
  for (const a of shown) {
    const day = formatThaiDate(a.created_at);
    if (days[days.length - 1]?.day !== day) days.push({ day, items: [] });
    days[days.length - 1].items.push(a);
  }

  return (
    <div>
      {onNote && !readOnly && (
        <div className="flex gap-2 px-4 pt-3 pb-2">
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void send(); }}
            placeholder="บันทึกการคุย / ความคืบหน้า…" className="flex-1 min-w-0 h-9 px-3 rounded-lg border border-gray-200 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10" />
          <button type="button" onClick={() => void send()} disabled={busy || !text.trim()}
            className="h-9 px-3 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-40">บันทึก</button>
        </div>
      )}
      <div className="flex flex-wrap gap-1 px-4 pt-1 pb-2.5 border-b border-gray-100">
        {FILTERS.map((f) => (
          <button key={f.key} type="button" onClick={() => setFilter(f.key)} style={{ minHeight: 0 }}
            className={`rounded-full border px-2 text-xxs whitespace-nowrap ${filter === f.key ? "border-gray-800 bg-gray-800 text-white" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
            {f.label}
          </button>
        ))}
      </div>
      {days.length === 0 ? (
        <div className="px-4 py-6 text-center text-sm text-gray-400">{filter === "all" ? "ยังไม่มีความเคลื่อนไหว" : "ไม่มีรายการในหมวดนี้"}</div>
      ) : (
        days.map((d) => (
          <div key={d.day}>
            <div className="px-4 pt-3 pb-1 text-xxs font-bold text-gray-400">{d.day === today ? `วันนี้ · ${d.day}` : d.day}</div>
            <ul>
              {d.items.map((a, i) => {
                const look = lookOf(a.kind);
                return (
                  <li key={a.id} className="relative flex gap-2.5 px-4 pt-1.5 pb-2.5">
                    {/* เส้นต่อระหว่างรายการในวันเดียวกัน */}
                    {i < d.items.length - 1 && <span className="absolute left-[30px] top-10 bottom-0 w-0.5 bg-gray-100" />}
                    <span className={`relative w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs ${look.tone}`}>{look.icon}</span>
                    <div className="flex-1 min-w-0 text-sm leading-snug">
                      <span className="font-bold text-gray-800">{KIND[a.kind] ?? a.kind}</span>
                      {a.message && <span className="text-gray-600 whitespace-pre-line break-words"> {a.message}</span>}
                      <div className="text-xxs text-gray-400">{formatThaiTime(a.created_at)}{a.created_by_name ? ` · ${a.created_by_name}` : ""}</div>
                      {isMove(a) && (
                        <span className="mt-1 inline-block rounded-md bg-active-light px-2 text-xxs text-active-dark">{stageLabel(a.from_stage!)} → {stageLabel(a.to_stage!)}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))
      )}
    </div>
  );
}
