"use client";

// 1 แถวในไทม์ไลน์ประวัติงานบริการ — ★ 2 ต.ค. 69 ผู้ใช้สั่ง "รูปแบบเหมือนฝั่งขาย" ⇒ ยกหน้าตา ActivityItem มาทั้งชุด
//   จุดกลมมีไอคอนตามชนิด · หัว "ป้าย · วันที่" + "· บันทึกเมื่อ …" สีเทา · ป้ายผลติดต่อ · ชิปสถานะเดิม → ใหม่
//   · เนื้อความ · นัดติดตามครั้งถัดไป (สีเหลือง) · "โดย …" บรรทัดล่าง
// ★ เนื้อในยังเป็นของ O&M เอง เพราะ ActivityItem ผูกกับชนิดข้อมูลของ lead ทั้งก้อน
//   (old_status/new_status/contact_result + STATUS_CONFIG ของงานขาย) ยกมาใช้ตรง ๆ ไม่ได้
//   ไอคอน/สี/รูปแบบวันที่ก๊อบจาก lead/detail/ActivityItem.tsx — แก้ฝั่งนั้นแล้วตามมาแก้ที่นี่ด้วย

import { CALL_OUTCOME, statusLabel } from "@/lib/om/booking";
import type { HistoryRow } from "@/lib/om/service-view";

// path ไอคอน — ชุดเดียวกับ typeConfig ของ ActivityItem
const I = {
  call: "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z",
  visit: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z",
  line: "M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  other: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z",
  note: "M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z",
  status: "M3 7.5L7.5 3m0 0L12 7.5M7.5 3v13.5m13.5-4.5L16.5 7.5m0 0L12 12m4.5-4.5V21",
  calendar: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  doc: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z",
  quote: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5V5.25A2.25 2.25 0 0012.375 3h-6.75a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 005.625 21h6.75a2.25 2.25 0 002.25-2.25v-1.5m4.875-3l2.25 2.25m0 0l-2.25 2.25m2.25-2.25H9",
  pay: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z",
  alert: "M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z",
  done: "M9 12.75l2.25 2.25L15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  cancel: "M6 18L18 6M6 6l12 12",
  plus: "M12 4.5v15m7.5-7.5h-15",
  // ไอคอนแท็บ Equipment - Serial (ชุดเดียวกับหน้า lead)
  device: "M3.75 7.5l16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0012 6.75zM7.5 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z",
};

// ไอคอน + สีจุดตาม action — โทนเดียวกับฝั่งขาย (โทร ฟ้า · โน้ต เทา · เปลี่ยนสถานะ ฟ้าอ่อน · ยกเลิก แดง)
const TYPE: Record<string, { icon: string; color: string }> = {
  call: { icon: I.call, color: "bg-blue-500" },
  note: { icon: I.note, color: "bg-gray-500" },
  create: { icon: I.calendar, color: "bg-amber-500" },
  reschedule: { icon: I.calendar, color: "bg-amber-500" },
  confirm: { icon: I.status, color: "bg-sky-500" },
  start: { icon: I.status, color: "bg-sky-500" },
  assign_team: { icon: I.status, color: "bg-sky-500" },
  assign_owner: { icon: I.status, color: "bg-sky-500" },
  reorder: { icon: I.status, color: "bg-sky-500" },
  check: { icon: I.doc, color: "bg-teal-600" },
  done: { icon: I.done, color: "bg-emerald-600" },
  cancel: { icon: I.cancel, color: "bg-red-500" },
  no_show: { icon: I.cancel, color: "bg-red-500" },
  quote: { icon: I.quote, color: "bg-cyan-600" },
  quote_edit: { icon: I.quote, color: "bg-cyan-600" },
  quote_submit: { icon: I.quote, color: "bg-cyan-600" },
  quote_revise: { icon: I.quote, color: "bg-cyan-600" },
  quote_send: { icon: I.quote, color: "bg-cyan-600" },
  quote_approve: { icon: I.quote, color: "bg-emerald-600" },
  quote_return: { icon: I.quote, color: "bg-red-500" },
  pay_submit: { icon: I.pay, color: "bg-amber-500" },
  paid: { icon: I.pay, color: "bg-emerald-600" },
  pay_reject: { icon: I.alert, color: "bg-red-500" },
  pay_cheque: { icon: I.pay, color: "bg-amber-500" },
  pay_cheque_bounced: { icon: I.alert, color: "bg-red-500" },
  repair_open: { icon: I.plus, color: "bg-orange-500" },
  device: { icon: I.device, color: "bg-violet-500" },
};
// บันทึกการติดตามทางอื่น (ปุ่ม Follow-up) — ไอคอนตามช่องทางแบบฝั่งขาย
const CHANNEL: Record<string, { icon: string; color: string }> = {
  visit: { icon: I.visit, color: "bg-purple-500" },
  line: { icon: I.line, color: "bg-green-500" },
  other: { icon: I.other, color: "bg-teal-500" },
};
// ผลติดต่อ — ป้ายเขียว (ติดต่อได้) / แดง (ติดต่อไม่ได้ · ปฏิเสธ) / เทา แบบป้ายผลติดต่อฝั่งขาย
const OUTCOME_FAIL = new Set(["no_answer", "wrong_number", "declined"]);

const formatTime = (d: string) => new Date(d).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
const formatThaiDate = (d: string) => new Date(String(d).slice(0, 10) + "T12:00:00")
  .toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });
const jsonStr = (json: string | null | undefined, key: string) =>
  new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(json ?? "")?.[1] ?? null;
const chipTone = (s: string) =>
  s === "cancelled" || s === "no_show" ? "bg-red-50 text-red-700 border-red-200"
  : s === "closed" ? "bg-teal-50 text-teal-700 border-teal-200"
  : "bg-gray-50 text-gray-700 border-gray-200";

export default function JobHistoryItem({ h, isLast }: { h: HistoryRow; isLast?: boolean }) {
  const channel = h.action === "call" ? jsonStr(h.to_json, "channel") : null;
  const cfg = (channel && CHANNEL[channel]) || TYPE[h.action] || TYPE.note;
  const outcome = h.outcome ? CALL_OUTCOME[h.outcome]?.t ?? h.outcome : null;
  // วันที่ติดตามจริงที่เลือกย้อนหลังในปุ่ม Follow-up (1 ต.ค. 69) — API จดใน to_json เฉพาะตอนไม่ใช่วันบันทึก
  //   หัวแถวใช้วันนั้นแทนวันบันทึก แบบ followup_date ของฝั่งขาย
  const contactOn = jsonStr(h.to_json, "contact_date");
  const fromStatus = jsonStr(h.from_json, "status");
  const toStatus = jsonStr(h.to_json, "status");
  const isRed = h.action === "cancel" || h.action === "no_show";

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
          {h.action_label ?? h.action} · {formatThaiDate(contactOn ?? h.created_at)}
          <span className="ml-1 text-xs font-normal text-gray-400">
            · บันทึกเมื่อ {formatThaiDate(h.created_at)} {formatTime(h.created_at)}
          </span>
        </div>
        {outcome && (
          <span className={`inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${
            h.outcome === "other" ? "bg-gray-50 text-gray-600 border-gray-200"
            : OUTCOME_FAIL.has(h.outcome ?? "") ? "bg-red-50 text-red-700 border-red-200"
            : "bg-green-50 text-green-700 border-green-200"}`}>
            {outcome}
          </span>
        )}
        {fromStatus && toStatus && fromStatus !== toStatus && (
          <div className="flex items-center gap-1.5 mt-1 text-xs">
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${chipTone(fromStatus)}`}>{statusLabel(fromStatus)}</span>
            <svg className="w-3 h-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <span className={`px-2 py-0.5 rounded-full border font-semibold ${chipTone(toStatus)}`}>{statusLabel(toStatus)}</span>
          </div>
        )}
        {h.reason && (
          <div className={`text-sm mt-1 whitespace-pre-wrap break-words ${isRed ? "text-red-600" : "text-gray-700"}`}>{h.reason}</div>
        )}
        {h.next_action_date && (
          <div className="text-xs text-amber-700 font-semibold mt-1">นัดติดตามครั้งถัดไป {formatThaiDate(h.next_action_date)}</div>
        )}
        <div className="text-xs text-gray-400 mt-1">
          โดย {h.actor_name ?? "—"}
          {h.booking_id && <> · ใบงาน #{h.booking_id}</>}
        </div>
      </div>
    </div>
  );
}
