"use client";

// การ์ด 1 ใบของงานบริการ O&M — ใช้ร่วมกันระหว่างหน้ารายการ (/om/services) กับหน้า Today
// (แยกออกมาตอนเฟส 4 แผน 20260922-01 · เดิมอยู่ในไฟล์เดียวกับหน้ารายการ)
// ★ เปลือกการ์ดยกจาก LeadCard ของฝั่งขายทั้งก้อน (เงา/ขอบ/สี hover/กดด้วยคีย์บอร์ด)
//   เนื้อในเป็นข้อมูล O&M เฉพาะทาง

import { CALL_OUTCOME } from "@/lib/om/booking";
import {
  BUCKET_LABEL, FLOW, TONE, monthsAgo, thD, thDT,
  type Item,
} from "@/lib/om/service-view";

const I = ({ d, c, fill }: { d: string; c: string; fill?: boolean }) => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill={fill ? c : "none"} stroke={fill ? "none" : c} strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);
const D = {
  house: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
  phone: "M3 5a2 2 0 012-2h3.28a1 1 0 01.95.68l1.5 4.5a1 1 0 01-.5 1.2l-2.26 1.13a11.04 11.04 0 005.52 5.52l1.13-2.26a1 1 0 011.2-.5l4.5 1.5a1 1 0 01.68.95V19a2 2 0 01-2 2h-1C9.72 21 3 14.28 3 6V5z",
  pin: "M15 10.5a3 3 0 11-6 0 3 3 0 016 0zM19.5 10.5c0 7.14-7.5 11.25-7.5 11.25S4.5 17.64 4.5 10.5a7.5 7.5 0 1115 0z",
  bolt: "M13 10V3L4 14h7v7l9-11h-7z",
};

/** วงกลม 5 ขั้นในการ์ด (โผล่บนจอกว้าง)
 *  ★ แก้ 23 ก.ย. 69: เดิม `if (idx < 0) idx = 0` ทำให้ทุกสถานะที่ไม่อยู่ใน FLOW
 *    (รอลูกค้ายืนยัน · ยกเลิก · ไม่อยู่บ้าน) แสดงจุดกลับไปขั้นแรก "ติดตาม" เหมือนงานยังไม่เริ่ม
 *    - checked (รอลูกค้ายืนยัน) = ทำเสร็จแล้วรอปิด → ให้ยืนที่ "เข้า O&M" เหลือแค่ขั้นปิดงาน
 *      (คงแถบ 5 ขั้นตามที่ผู้ใช้เคาะ 9 ก.ย. mockup 20260909_04 — ไม่เพิ่มขั้นที่ 6)
 *    - cancelled / no_show = ออกนอกเส้นไปแล้ว ไม่มีความคืบหน้าให้แสดง → ซ่อนแถบทั้งอัน
 *      (ป้ายสถานะสีแดงบนการ์ดบอกอยู่แล้วว่าเกิดอะไรขึ้น)
 */
const FLOW_AT: Record<string, number> = { checked: 3 };   // 3 = ตำแหน่ง "เข้า O&M"
const FLOW_HIDDEN = ["cancelled", "no_show"];

function Flow({ status }: { status: string }) {
  if (FLOW_HIDDEN.includes(status)) return null;
  const found = FLOW.findIndex((f) => f.k === status);
  const idx = found >= 0 ? found : (FLOW_AT[status] ?? 0);
  return (
    <div className="hidden xl:flex items-start pt-1 shrink-0">
      {FLOW.map((f, i) => {
        const cur = i === idx, past = i < idx;
        return (
          <div key={f.k} className="flex items-start">
            <div className="flex flex-col items-center w-14">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${past ? "bg-success" : cur ? "bg-primary ring-2 ring-primary/20" : "bg-gray-200"}`}>
                {past ? <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : cur ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <span className={`text-xxs mt-1 leading-tight whitespace-nowrap ${cur ? "font-bold text-primary-dark" : past ? "text-green-700" : "text-gray-400"}`}>{f.t}</span>
            </div>
            {i < FLOW.length - 1 && <div className={`h-0.5 w-1.5 mt-2.5 ${past ? "bg-green-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function JobCard({ r, onOpen }: { r: Item; onOpen: () => void }) {
  const m = monthsAgo(r.last_wash);
  // เปลือกการ์ดยกจาก LeadCard ทั้งก้อน (กติกา ui-rules) — เงา/สี hover/การกดด้วยคีย์บอร์ด
  // ต้องเหมือนกันทุกโมดูล · ข้างในเป็นข้อมูล O&M เฉพาะทาง คงไว้ตามเดิม
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="block rounded-2xl bg-white border border-gray-300 shadow-sm hover:border-gray-400 hover:shadow-md transition-all cursor-pointer overflow-hidden">
      <div className="flex gap-4 px-4 pt-3 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5 min-w-0">
            <I d={D.house} c="#0ea5e9" />
            <span className="text-base font-bold text-gray-900 truncate">{r.house_number} · {r.customer_name || "ไม่มีชื่อในฐาน"}</span>
            <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-semibold shrink-0 ${TONE[r.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</span>
            {!r.booking_id && r.bucket === "follow" && (
              <span className="text-xxs px-2 py-0.5 rounded-full bg-active-light text-active-dark font-bold shrink-0 max-md:hidden">ยังไม่มีแถวงาน · คำนวณสด</span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0">
            <I d={D.pin} c="#f43f5e" /><span className="truncate">{r.project_name}</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <I d={D.phone} c={r.phone ? "#10b981" : "#9ca3af"} />
            {r.phone ? <span className="tabular-nums">{r.phone}</span> : <span className="text-gray-400">ไม่มีเบอร์ในฐาน</span>}
            {r.kwp_list && <span className="text-xs text-gray-400 max-md:hidden">· {r.kwp_list} kW</span>}
          </div>
          <div className="text-sm text-gray-700">
            {r.balance > 0 ? <>สิทธิ์เหลือ <b className="text-primary-dark">{r.balance}</b> ครั้ง</> : <span className="text-amber-600 font-bold">สิทธิ์หมด</span>}
            {" · "}
            {r.last_wash ? <>ล้างล่าสุด <b>{thD(r.last_wash)}</b> <span className="text-xxs text-gray-400">({m} เดือน)</span></>
              : <span className="text-amber-600 font-bold">ยังไม่เคยล้างเลย</span>}
            {r.scheduled_at && <> · นัด <b>{thDT(r.scheduled_at)}</b></>}
          </div>
        </div>
        <Flow status={r.job_status ?? "follow"} />
      </div>
      <div className="border-t border-black/5 px-4 py-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-400 bg-gray-50/60">
        {r.last_outcome ? (
          <span className="text-green-700 font-semibold">
            โทรล่าสุด <b>{r.last_by ?? "—"}</b> · <i className="not-italic text-gray-500 font-normal">
              ครั้งที่ {r.calls} {CALL_OUTCOME[r.last_outcome]?.t ?? r.last_outcome} {thDT(r.last_call_at)}</i>
          </span>
        ) : <span>ยังไม่มีใครโทร</span>}
        {r.team_name && <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">ทีม {r.team_name}</span>}
        {r.next_call && <span className="ml-auto font-semibold text-gray-500">นัดโทรใหม่ {thD(r.next_call)}</span>}
        {!r.next_call && r.no_answer > 0 && <span className="ml-auto font-bold text-danger">ไม่รับสายแล้ว {r.no_answer} ครั้ง</span>}
      </div>
    </div>
  );
}

// ── ใบงานเต็มหน้า — โครงเดียวกับใบงานฝั่งขาย (rail ขั้นตอน + แผงงานของขั้นนั้น) ──
