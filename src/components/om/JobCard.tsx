"use client";

// การ์ด 1 ใบของงานบริการ O&M — ใช้ร่วมกันระหว่างหน้ารายการ (/om/services) กับหน้า Today
// (แยกออกมาตอนเฟส 4 แผน 20260922-01 · เดิมอยู่ในไฟล์เดียวกับหน้ารายการ)
// ★ เปลือกการ์ดยกจาก LeadCard ของฝั่งขายทั้งก้อน (เงา/ขอบ/สี hover/กดด้วยคีย์บอร์ด)
//   เนื้อในเป็นข้อมูล O&M เฉพาะทาง

import { CALL_OUTCOME, EXIT_STATUS, statusLabel, statusTone } from "@/lib/om/booking";
import {
  BUCKET_LABEL, FLOW, TONE, flowIndex, monthsAgo, skipsPaidSteps, thD, thDT,
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

/** แถบ 7 ขั้นในการ์ด (โผล่ตั้งแต่จอ lg — 7 ขั้นกว้างเกินจอ md ที่มีเมนูซ้าย · มือถือดูป้ายสถานะแทน)
 *  ★ 24 ก.ย. 69 แผน 20260924-02 เฟส 1: เดิม 5 ขั้นไม่มี "รอปิด" งานที่ทำเสร็จแล้วรอปิดจึงยืนที่
 *    "เข้า O&M" เหมือนยังทำไม่เสร็จ · ตำแหน่งมาจาก flowIndex ที่เดียวกับหน้ารายละเอียด
 *  ★ เสนอราคา/ชำระเงิน = ขั้นของงานเสียเงิน — งานใช้สิทธิ์ฟรีวาดเป็นวงเส้นประ "ข้าม"
 *    ความกว้างทุกใบเท่ากัน แนวตรงกันทั้งหน้า และมองออกทันทีว่าบ้านไหนต้องเสนอราคา
 *  ★ ยกเลิก/ไม่อยู่บ้าน ไม่ซ่อนแถบแล้ว (เดิมซ่อน) — บ้านกลับมาแท็บติดตาม แถบยืนที่ติดตาม
 *    ส่วนเหตุผลบอกด้วยป้ายแดงข้างขวา
 */
function Flow({ r }: { r: Item }) {
  const idx = flowIndex(r.job_status);
  const skip = skipsPaidSteps(r);
  return (
    <div className="hidden lg:flex items-start mt-1 shrink-0" aria-label="Flow progress">
      {FLOW.map((f, i) => {
        const skipped = skip && "paid" in f && f.paid;
        const cur = i === idx, past = i < idx;
        return (
          <div key={f.k} className="flex items-start" title={skipped ? `${f.t} — ข้าม (ใช้สิทธิ์ฟรี)` : f.t}>
            <div className="flex flex-col items-center w-11 xl:w-14">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                skipped ? "border-2 border-dashed border-gray-300 bg-white"
                : past ? "bg-success" : cur ? "bg-primary ring-2 ring-primary/20" : "bg-gray-200"}`}>
                {skipped ? null
                  : past ? <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : cur ? <span className="w-1.5 h-1.5 rounded-full bg-white" /> : null}
              </div>
              <span className={`text-xxs mt-1 leading-tight whitespace-nowrap ${
                skipped ? "text-gray-300" : cur ? "font-bold text-primary-dark" : past ? "text-green-700" : "text-gray-400"}`}>{f.t}</span>
            </div>
            {i < FLOW.length - 1 && <div className={`h-0.5 w-1.5 mt-2.5 ${past ? "bg-green-300" : "bg-gray-200"}`} />}
          </div>
        );
      })}
    </div>
  );
}

/** ใบงานล่าสุดจบแบบออกนอกเส้น — บ้านกลับมาอยู่แท็บติดตาม/ทางออก ต้องบอกให้คนโทรรู้ก่อนยกหู */
const EXIT_KEYS: string[] = EXIT_STATUS.map((s) => s.k);

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
      {/* ★ 24 ก.ย. 69 ผู้ใช้สั่ง "จัดให้เป็นระเบียบ" — ยกผังแถวหัวจาก LeadCard ทั้งก้อน:
            [ชื่อ+เบอร์ คอลัมน์กว้างคงที่] [แถบขั้นตอนชิดถัดไป] [ป้ายสถานะชิดขวา]
            เดิมแถบขั้นตอนลอยอยู่ขวาสุด ตรงกลางการ์ดโล่ง และป้ายต่อท้ายชื่อทำให้แต่ละใบไม่ตรงแนวกัน */}
      <div className="px-4 pt-3 pb-2.5">
        <div className="flex items-start gap-3 mb-1.5">
          <div className="flex-1 min-w-0 md:w-56 md:flex-none xl:w-72">
            <div className="flex items-center gap-1.5 min-w-0 leading-tight">
              <I d={D.house} c="#0ea5e9" />
              <span className="text-base font-bold text-gray-900 truncate">{r.house_number} · {r.customer_name || "ไม่มีชื่อในฐาน"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mt-0.5 min-w-0">
              <I d={D.phone} c={r.phone ? "#10b981" : "#9ca3af"} />
              {r.phone ? <span className="tabular-nums">{r.phone}</span> : <span className="text-gray-400">ไม่มีเบอร์ในฐาน</span>}
              {r.kwp_list && <span className="text-xs text-gray-400 truncate">· {r.kwp_list} kW</span>}
            </div>
          </div>
          <Flow r={r} />
          <div className="ml-auto shrink-0 flex flex-col items-end gap-1">
            <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full text-white ${TONE[r.bucket] ?? "bg-gray-400"}`}>{BUCKET_LABEL[r.bucket] ?? r.bucket}</span>
            {!r.booking_id && r.bucket === "follow" && (
              <span className="text-xxs px-2 py-0.5 rounded-full bg-active-light text-active-dark font-bold max-md:hidden">คำนวณสด</span>
            )}
            {r.job_status && EXIT_KEYS.includes(r.job_status) && (
              <span className={`text-xxs px-2 py-0.5 rounded-full text-white font-bold ${statusTone(r.job_status)}`}
                title="ใบงานล่าสุดของบ้านนี้จบแบบนี้ — บ้านกลับมารอติดตามใหม่">งานล่าสุด {statusLabel(r.job_status)}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500 min-w-0 mb-1.5">
          <I d={D.pin} c="#f43f5e" /><span className="truncate">{r.project_name}</span>
        </div>
        {/* ข้อมูลสิทธิ์/การล้าง/นัด เป็นชิปเรียงแถวเดียว อ่านเทียบกันข้ามการ์ดได้ */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {r.balance > 0
            ? <span className="px-2 py-0.5 rounded-md bg-teal-50 text-gray-700">สิทธิ์เหลือ <b className="text-primary-dark">{r.balance}</b> ครั้ง</span>
            : <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">สิทธิ์หมด</span>}
          {r.last_wash
            ? <span className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700">ล้างล่าสุด <b>{thD(r.last_wash)}</b> <span className="text-gray-400">({m} เดือน)</span></span>
            : <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold">ยังไม่เคยล้าง</span>}
          {r.scheduled_at && <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800">นัด <b>{thDT(r.scheduled_at)}</b></span>}
        </div>
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
