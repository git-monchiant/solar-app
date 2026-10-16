"use client";

// 1 แถวใน Activity Log ของโครงการ B2B — ★ 16 ต.ค. 69 ผู้ใช้สั่ง "รูปแบบเหมือนงาน B2C" ⇒ ยกหน้าตา ActivityItem ของหน้าลีดมาทั้งชุด
//   (แบบเดียวกับ om/JobHistoryItem) จุดกลมสีทึบ + ไอคอนขาว · หัว "ชนิด" + "· บันทึกเมื่อ …" สีเทา · ชิปขั้นเดิม → ใหม่
//   · เนื้อความ · "โดย …" บรรทัดล่าง · กลุ่มวัน/เส้นเชื่อมมาจากเปลือก ui/Timeline
// ★ ActivityItem ผูกกับชนิดข้อมูลของ lead ทั้งก้อน ยกมาใช้ตรง ๆ ไม่ได้ — path ไอคอนชุดเดียวกับ JobHistoryItem / ActivityItem

import { formatThaiDate } from "@/lib/utils/formatters";
import { B2B_STAGE, stageLabel, type B2bActivity } from "@/lib/b2b/project";

export const B2B_ACTIVITY_LABEL: Record<string, string> = {
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

// path ไอคอน — ชุดเดียวกับ typeConfig ของ ActivityItem (ฝั่งขาย)
const I = {
  plus: "M12 4.5v15m7.5-7.5h-15",
  note: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z",
  status: "M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 7.5m0 0L12 12m4.5-4.5V21",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  visit: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
  doc: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  quote: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5V5.25A2.25 2.25 0 0012.375 3h-6.75a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 005.625 21h6.75a2.25 2.25 0 002.25-2.25v-1.5m4.875-3l2.25 2.25m0 0l-2.25 2.25m2.25-2.25H9",
  pay: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  alert: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
  done: "M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  cancel: "M6 18L18 6M6 6l12 12",
};

// ไอคอน + สีจุดตามชนิด — โทนเดียวกับฝั่งขาย (โน้ต เทา · เปลี่ยนสถานะ ฟ้าอ่อน · เอกสาร/ใบเสนอราคา เขียวน้ำทะเล · เงิน เหลือง/เขียว · แพ้/ยกเลิก แดง)
const TYPE: Record<string, { icon: string; color: string }> = {
  created: { icon: I.plus, color: "bg-amber-500" },
  stage: { icon: I.status, color: "bg-sky-500" },
  reopened: { icon: I.status, color: "bg-sky-500" },
  note: { icon: I.note, color: "bg-gray-500" },
  edited: { icon: I.note, color: "bg-gray-500" },
  survey_scheduled: { icon: I.calendar, color: "bg-amber-500" },
  survey_done: { icon: I.visit, color: "bg-purple-500" },
  boq_created: { icon: I.doc, color: "bg-teal-600" },
  boq_revision: { icon: I.doc, color: "bg-teal-600" },
  boq_priced: { icon: I.doc, color: "bg-teal-600" },
  quote_created: { icon: I.quote, color: "bg-cyan-600" },
  quote_submitted: { icon: I.quote, color: "bg-cyan-600" },
  quote_revision: { icon: I.quote, color: "bg-cyan-600" },
  quote_sent: { icon: I.quote, color: "bg-cyan-600" },
  quote_approved: { icon: I.quote, color: "bg-emerald-600" },
  quote_returned: { icon: I.quote, color: "bg-red-500" },
  won: { icon: I.done, color: "bg-emerald-600" },
  contract: { icon: I.doc, color: "bg-emerald-600" },
  installment_due: { icon: I.pay, color: "bg-amber-500" },
  installment_submitted: { icon: I.pay, color: "bg-amber-500" },
  installment_paid: { icon: I.pay, color: "bg-emerald-600" },
  installment_rejected: { icon: I.alert, color: "bg-red-500" },
  milestone: { icon: I.visit, color: "bg-purple-500" },
  milestone_edited: { icon: I.visit, color: "bg-purple-500" },
  milestone_undone: { icon: I.cancel, color: "bg-gray-500" },
  permit: { icon: I.doc, color: "bg-amber-500" },
  files_added: { icon: I.doc, color: "bg-gray-500" },
  file_removed: { icon: I.cancel, color: "bg-gray-500" },
  closed: { icon: I.done, color: "bg-emerald-600" },
  om_contract: { icon: I.doc, color: "bg-teal-600" },
  lost: { icon: I.cancel, color: "bg-red-500" },
  cancelled: { icon: I.cancel, color: "bg-red-500" },
};

/** สีชิปขั้น — เปิดอยู่ ม่วง (สีขั้นของแอป) · ปิดโครงการ เขียว · แพ้/ยกเลิก แดง */
const chipTone = (s: number) =>
  s === B2B_STAGE.lost || s === B2B_STAGE.cancelled ? "bg-red-50 text-red-700 border-red-200"
  : s === B2B_STAGE.closed ? "bg-emerald-50 text-emerald-700 border-emerald-200"
  : "bg-active-light text-active-dark border-violet-200";

export default function B2bActivityItem({ a, isLast }: { a: B2bActivity; isLast?: boolean }) {
  const cfg = TYPE[a.kind] ?? (a.kind.startsWith("quote_") ? TYPE.quote_created : TYPE.note);
  const isRed = a.kind === "lost" || a.kind === "cancelled" || a.kind === "quote_returned" || a.kind === "installment_rejected";
  const moved = a.from_stage != null && a.to_stage != null && a.from_stage !== a.to_stage;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${cfg.color}`}>
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d={cfg.icon} />
          </svg>
        </div>
        {!isLast && <div className="w-px flex-1 bg-gray-200 mt-1" />}
      </div>
      <div className="flex-1 pb-4 min-w-0">
        <div className={`font-semibold text-sm ${isRed ? "text-red-600" : "text-gray-900"}`}>
          {B2B_ACTIVITY_LABEL[a.kind] ?? a.kind}
          {/* time: true = อ่านเป็นเวลาเต็ม (ไม่ตัดเหลือวันที่ UTC — เหตุการณ์ 00:00–06:59 น. เคยขึ้นเป็นเมื่อวาน) */}
          <span className="ml-1 text-xs font-normal text-gray-400">· บันทึกเมื่อ {formatThaiDate(a.created_at, { time: true }).replace(", ", " ")}</span>
        </div>
        {moved && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${chipTone(a.from_stage!)}`}>{stageLabel(a.from_stage!)}</span>
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${chipTone(a.to_stage!)}`}>{stageLabel(a.to_stage!)}</span>
          </div>
        )}
        {a.message && (
          <div className={`text-sm mt-1 whitespace-pre-wrap break-words ${isRed ? "text-red-600" : "text-gray-700"}`}>{a.message}</div>
        )}
        <div className="text-xs text-gray-400 mt-1">โดย {a.created_by_name ?? "—"}</div>
      </div>
    </div>
  );
}
