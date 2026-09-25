"use client";

// หน้ารายละเอียดงานบริการของบ้าน 1 หลัง (เฟส 3 แผน 20260922-01)
// ★ ย้ายออกจาก om/services/page.tsx มาเป็นไฟล์ของตัวเอง เพราะตอนนี้มี URL จริงแล้ว
//   (/om/services/[house]) หน้ารายการกับ route ใหม่ต้อง import ตัวเดียวกัน
// ★ ประวัติรับมาทาง prop — หน้าเป็นคนโหลดพร้อมข้อมูลบ้านในคำขอเดียว
//   เดิมยิง /api/om/bookings/[id] แยกอีกรอบ และได้เฉพาะงานที่มีใบงานแล้ว
//   บ้านที่เพิ่งโทร (ยังไม่มีใบงาน) จึงไม่เห็นประวัติตัวเองเลย
// ★ โครงหน้ายกมาจาก /leads/[id] ทั้งก้อน (กติกา ui-rules: ยกบล็อกเดิม ไม่ประดิษฐ์ใหม่)
//   header [คอลัมน์ avatar กว้างเท่าราง STEPS] · แถบแท็บ · ราง STEPS ซ้าย · การ์ดขั้น · Activity Log ขวา
//   คลาสของราง/การ์ด/ปุ่มเลือก ก๊อปจาก StepCard + PreSurveyForm — แก้ฝั่งนั้นแล้วตามมาแก้ที่นี่ด้วย

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { CALL_OUTCOME, EXIT_STATUS, statusLabel, statusTone } from "@/lib/om/booking";
import Timeline from "@/components/ui/Timeline";
import { CheckIcon, ChevronLeftIcon, ClockIcon, PhoneIcon } from "@/components/ui/icons";
import NotificationBell from "@/components/layout/NotificationBell";
import JobHistoryItem from "@/components/om/JobHistoryItem";
import JobFormPanel from "@/components/om/JobFormPanel";
import OmQuotationPanel from "@/components/om/OmQuotationPanel";
import OmPaymentPanel from "@/components/om/OmPaymentPanel";
import AssignOwnerButton from "@/components/lead/AssignOwnerButton";
import {
  BUCKET_LABEL, FLOW, TONE, flowIndex, skipsPaidSteps, thD, thDT,
  type HistoryRow, type Item, type Team,
} from "@/lib/om/service-view";

type StepState = "active" | "done" | "skipped" | "upcoming";

// ไอคอนหัวการ์ดของแต่ละขั้น (heroicons outline) — ลำดับเดียวกับ FLOW
const STEP_ICON = [
  // ติดตาม
  "M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z",
  // เสนอราคา
  "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  // ชำระเงิน
  "M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z",
  // นัดหมาย
  "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5",
  // เข้างาน
  "M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z",
  // รอปิด
  "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75m-7.5-10.5h6.375c.621 0 1.125.504 1.125 1.125v9.375m-8.25-3l1.5 1.5 3-3.75",
  // ปิดงาน
  "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
];

// ชุดคลาสเดียวกับ PreSurveyForm (ฝั่งขาย) — กล่องย่อยในการ์ด · ป้ายช่อง · ปุ่มเลือก · ช่องกรอก
const SECTION = "rounded-lg bg-white/60 border border-active/15 p-3";
const FIELD_LABEL = "text-xs text-gray-500 block mb-1.5";
const INPUT = "w-full h-8 px-3 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-active";
const chipBtn = (selected: boolean) =>
  `h-8 px-3 rounded-lg text-xxs font-semibold border transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
    selected
      ? "bg-active text-white border-active shadow-sm shadow-active/20"
      : "bg-white text-gray-600 border-gray-200 hover:border-active/40 hover:text-active"
  }`;
// ปุ่มหลักของการ์ด = ปุ่ม "ถัดไป" ของฝั่งขาย · ปุ่มรอง = "ย้อนกลับ"
const PRIMARY_BTN = "h-11 px-6 rounded-lg text-sm font-semibold text-white bg-active hover:brightness-110 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50";
const SECONDARY_BTN = "h-11 px-5 rounded-lg text-sm font-semibold border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 transition-colors flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50";

export default function JobDetail({ item, history, onBack, onDone, onSaved, onReload }: {
  item: Item;
  /** ประวัติของบ้านหลังนี้ — หน้าเรียกใช้เป็นคนโหลด (มาพร้อม /api/om/follow?house=) */
  history: HistoryRow[];
  /** ปุ่ม ‹ กลับรายการ — ไม่ส่งมา (โหมด focus/แท็บใหม่) = ซ่อนปุ่ม เหมือนหน้า lead */
  onBack?: () => void;
  /** หลังบันทึกการโทร/เปลี่ยนสถานะสำเร็จ — ปกติกลับรายการ · โหมด focus โหลดใหม่อยู่หน้าเดิม */
  onDone: () => void;
  onSaved: (m: string) => void;
  /** โหลดข้อมูลบ้านใหม่โดยไม่ออกจากหน้า (ใช้ตอนเปลี่ยนเจ้าของงาน) */
  onReload?: () => void;
}) {
  const cur = item.job_status ?? "follow";
  // ★ ตำแหน่งบนแถบมาจาก flowIndex ที่เดียวกับการ์ด (แผน 20260924-02 เฟส 1)
  //   เดิม findIndex เอง ใบงาน "รอลูกค้ายืนยัน" (checked) ไม่อยู่ใน FLOW เลยเปิดมาที่ขั้น 01
  const at = flowIndex(cur);
  const skip = skipsPaidSteps(item);
  const isExit = (EXIT_STATUS.map((x) => x.k) as string[]).includes(cur);
  const [step, setStep] = useState(at);
  const [outcome, setOutcome] = useState<string>("agreed");
  const [note, setNote] = useState("");
  const [when, setWhen] = useState("");
  const [nextDate, setNextDate] = useState("");
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    apiFetch("/api/om/teams").then((d) => setTeams(d.teams ?? [])).catch(() => {});
  }, []);
  // ชื่อแท็บ = บ้านเลขที่ - ชื่อลูกค้า เหมือนหน้า lead — เปิดหลายแท็บแล้วยังแยกออกว่าแท็บไหนบ้านไหน
  useEffect(() => {
    const prev = document.title;
    const name = item.customer_name || "ไม่มีชื่อในฐาน";
    document.title = item.house_number ? `${item.house_number} - ${name}` : name;
    return () => { document.title = prev; };
  }, [item.house_number, item.customer_name]);

  // สถานะของแต่ละขั้น — ใช้ทั้งราง STEPS และหัวการ์ด
  // เสนอราคา/ชำระเงิน ของงานใช้สิทธิ์ฟรี = ข้าม · ยังกดเข้าไปอ่านได้ว่าทำไมข้าม
  const stepState = (i: number): StepState => {
    const f = FLOW[i];
    if (skip && "paid" in f && f.paid) return "skipped";
    if (i < at || cur === "closed") return "done";
    if (i === at) return "active";
    return "upcoming";
  };

  const saveCall = async () => {
    if (outcome === "agreed" && !when) { setErr("ตกลงนัดแล้วต้องระบุวันและเวลา"); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch("/api/om/follow", {
        method: "POST",
        body: JSON.stringify({
          house_id: item.house_id, booking_id: item.booking_id, outcome,
          note: note || null, next_date: nextDate || null,
          scheduled_at: outcome === "agreed" ? when : null,
          phone: item.phone,
        }),
      });
      onSaved("บันทึกการโทรแล้ว"); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const patchJob = async (patch: Record<string, unknown>, msg: string) => {
    if (!item.booking_id) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/bookings/${item.booking_id}`, { method: "PATCH", body: JSON.stringify(patch) });
      onSaved(msg); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  // ช่องเบอร์อาจมีหลายเบอร์คั่นกัน — ปุ่มโทรใช้เบอร์แรก
  const telNo = item.phone?.split(/[,/\s]+/).find(Boolean) ?? null;

  const historyTimeline = (
    <Timeline
      items={history}
      renderItem={(h, isLast) => <JobHistoryItem h={h} isLast={isLast} />}
      labels={{ today: "วันนี้", yesterday: "เมื่อวาน", locale: "th-TH",
                empty: "ยังไม่มีประวัติ", emptyHint: "บันทึกการโทรหรือสร้างนัดแล้วจะขึ้นที่นี่" }}
    />
  );

  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      {/* Header — [คอลัมน์ avatar กว้างเท่าราง STEPS] | [‹ ชื่อ+ป้าย / meta] [ปุ่มขวา] เหมือนหน้า lead */}
      <div className="bg-white border-b border-gray-200 shrink-0">
        <div className="flex items-stretch">
          {onBack && (
            <button type="button" onClick={onBack} className="md:hidden self-center ml-1 p-1.5 rounded-full text-gray-600 hover:bg-gray-200 transition-colors shrink-0" style={{ minHeight: 0 }}>
              <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
            </button>
          )}
          <div className="max-md:hidden w-20 shrink-0 border-r border-gray-200 flex items-center justify-center py-2">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-gray-600 shrink-0">
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
          <div className="flex-1 min-w-0 flex items-center gap-2 pl-1.5 md:pl-3 pr-4 md:pr-5 py-2.5">
            {onBack && (
              <button type="button" onClick={onBack} title="กลับรายการ" className="max-md:hidden p-2 -ml-1 rounded-full text-gray-600 hover:bg-gray-200 transition-colors shrink-0" style={{ minHeight: 0 }}>
                <ChevronLeftIcon className="w-5 h-5" strokeWidth={2.5} />
              </button>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-lg md:text-xl font-bold tracking-tight leading-tight text-gray-900 truncate">
                  {item.house_number ? `${item.house_number} - ` : ""}{item.customer_name || "ไม่มีชื่อในฐาน"}
                </h1>
                <span className={`hidden sm:inline-flex shrink-0 text-xxs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${TONE[item.bucket] ?? "bg-gray-400"}`}>
                  {BUCKET_LABEL[item.bucket] ?? item.bucket}
                </span>
                {isExit && (
                  <span className={`hidden sm:inline-flex shrink-0 text-xxs font-bold tracking-wide px-2 py-0.5 rounded-full text-white ${statusTone(cur)}`}>
                    งานล่าสุด {statusLabel(cur)}
                  </span>
                )}
              </div>
              {/* Meta — บรรทัดเดียว truncate ใต้ชื่อ */}
              <div className="mt-0.5 text-xs text-gray-600 leading-tight flex items-center gap-1.5 min-w-0">
                <svg className="w-3.5 h-3.5 text-gray-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="truncate">
                  {item.project_name && <span className="font-bold text-gray-900">{item.project_name}</span>}
                  <span className="text-gray-300 mx-1.5">·</span>
                  <span className="font-mono tabular-nums">{item.phone || "ไม่มีเบอร์"}</span>
                  <span className="text-gray-300 mx-1.5">·</span>
                  สิทธิ์เหลือ <b className="text-gray-900">{Math.max(0, item.balance)}</b> ครั้ง
                  <span className="text-gray-300 mx-1.5">·</span>
                  {item.last_wash
                    ? <>ล้างล่าสุด <b className="text-gray-900">{thD(item.last_wash)}</b></>
                    : <span className="font-semibold text-amber-600">ยังไม่เคยล้าง</span>}
                  {item.booking_id && <><span className="text-gray-300 mx-1.5">·</span>ใบงาน #{item.booking_id}</>}
                  {item.team_name
                    ? <><span className="text-gray-300 mx-1.5">·</span>ทีม {item.team_name}</>
                    // เตือนจ่ายทีมเฉพาะงานที่ถึงขั้นนัดหมายแล้ว — ขั้นเสนอราคา/ชำระเงินยังไม่ถึงเวลาจ่ายทีม
                    : item.booking_id && at >= 3 && <><span className="text-gray-300 mx-1.5">·</span><span className="font-semibold text-amber-600">⚠ ยังไม่จ่ายทีม</span></>}
                </span>
              </div>
            </div>
            <NotificationBell />
            {/* เจ้าของเคส (เฟส 4) — ปุ่มตัวเดียวกับฝั่งขาย ต่างแค่ endpoint ที่บันทึกกับ role ที่ดึงมาเลือก
                ★ ว่างไว้ได้ ไม่ใช่ประตูล็อก — ใครเปิดหน้านี้ก็ยังทำงานต่อได้ (ผู้ใช้เคาะ 10 ก.ย.)
                มีไว้ให้หน้า Today ตอบได้ว่า "งาน O&M ของฉัน" คืออะไร */}
            {item.booking_id && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="max-md:hidden text-xxs text-gray-500 whitespace-nowrap">เจ้าของงาน</span>
                <AssignOwnerButton
                  size="md"
                  usersRole="solar"
                  title="เจ้าของงานบริการ"
                  assignedUserId={item.owner_user_id}
                  assignedName={item.owner_name}
                  onAssign={async (userId) => {
                    await apiFetch(`/api/om/bookings/${item.booking_id}`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ owner_user_id: userId }),
                    });
                  }}
                  onChanged={onReload}
                />
              </div>
            )}
            {telNo && (
              <a
                href={`tel:${telNo}`}
                className="shrink-0 w-9 h-9 md:w-11 md:h-11 rounded-full bg-primary text-white shadow-lg shadow-primary/40 flex items-center justify-center hover:bg-primary-dark active:scale-95 transition-all"
                aria-label="โทร"
                style={{ minHeight: 0, minWidth: 0 }}
              >
                <PhoneIcon className="w-5 h-5" width="20" height="20" />
              </a>
            )}
          </div>
        </div>

        {/* แถบแท็บ + หัวราง STEPS (desktop) + หัว Activity Log — เรียงคอลัมน์ตรงกับแผงด้านล่าง */}
        <div className="flex">
          <div className="hidden md:flex w-20 border-r border-gray-200 px-2 items-center justify-center py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
            <span className="text-[10px]">Steps</span>
          </div>
          <div className="flex-1 flex px-5 gap-1 min-w-0">
            <div className="py-3 px-4 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px inline-flex items-center gap-1.5 text-active border-active">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6h16.5M3.75 12h16.5m-16.5 6h16.5" />
              </svg>
              Workflow
            </div>
          </div>
          <div className="hidden md:flex w-80 border-l border-gray-200 px-4 items-center py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 gap-1.5">
            <ClockIcon className="w-4 h-4" strokeWidth={2} />
            Activity Log <span className="ml-1 text-gray-400 normal-case">{history.length}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ราง STEPS — ทึบม่วง = ขั้นที่เปิดดูอยู่ · ขอบม่วง = ขั้นที่งานอยู่จริง · ✓ = ผ่านแล้ว
            ★ ต่างจากหน้า lead ตรงที่โชว์บนมือถือด้วย เพราะหน้านี้เปิดการ์ดทีละขั้น ไม่มีทางอื่นให้สลับขั้น */}
        <aside className="w-20 border-r border-gray-200 bg-gray-50/40 flex flex-col py-3 px-1.5 gap-1.5 shrink-0 overflow-y-auto">
          {FLOW.map((f, i) => {
            const st = stepState(i);
            const cls = i === step
              ? "bg-active text-white"
              : st === "active"
              ? "bg-white text-active border-2 border-active hover:bg-active/5"
              : st === "done"
              ? "bg-white text-gray-700 border border-gray-200 hover:border-active hover:text-active"
              : st === "skipped"
              ? "bg-white text-gray-300 border border-dashed border-gray-200 hover:text-gray-500"
              : "bg-white text-gray-500 border border-gray-200 hover:border-active hover:text-active";
            return (
              <button key={f.k} type="button" onClick={() => setStep(i)}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition-colors cursor-pointer ${cls}`}>
                <span className="text-xxs font-bold tabular-nums leading-none">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[10px] font-semibold leading-tight text-center px-1">{f.t}</span>
                {st === "done" && <CheckIcon className={`w-3 h-3 ${i === step ? "text-white" : "text-emerald-500"}`} strokeWidth={3} />}
                {st === "skipped" && <span className="text-[9px] leading-none">ข้าม</span>}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 overflow-y-auto pb-20 md:pb-4 min-w-0" style={{ overscrollBehaviorY: "contain" }}>
          {/* pt-3 = ระยะเดียวกับ py-3 ของราง STEPS ให้ขอบบนเริ่มเท่ากัน */}
          <div className="px-4 pb-4 pt-3 space-y-3">
            {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}

            {step === 0 && (
              <StepCard n={0} state={stepState(0)} title="ติดตาม — บันทึกการโทร">
                <div className={SECTION}>
                  <label className={FIELD_LABEL}>ผลการโทรครั้งนี้ <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                    {Object.entries(CALL_OUTCOME).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => setOutcome(k)} className={chipBtn(outcome === k)}>
                        {v.t}
                      </button>
                    ))}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 mt-3">
                    {outcome === "agreed" && (
                      <div>
                        <label className={FIELD_LABEL}>วันและเวลานัด <span className="text-red-500">*</span></label>
                        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className={INPUT} />
                      </div>
                    )}
                    {(outcome === "postponed" || outcome === "no_answer") && (
                      <div>
                        <label className={FIELD_LABEL}>นัดโทรใหม่</label>
                        <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} className={INPUT} />
                        <span className="block mt-1 text-xxs text-gray-400">ไม่ใส่ = ระบบตั้งให้ตามกติกาในหน้าตั้งค่า</span>
                      </div>
                    )}
                    <div>
                      <label className={FIELD_LABEL}>โน้ต</label>
                      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ลูกค้าไม่อยู่บ้านช่วงเช้า" className={INPUT} />
                    </div>
                  </div>

                  <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-600">
                    {outcome === "agreed" && <>กดบันทึกแล้ว <b>สร้างใบงาน</b> ขั้น <b>นัดหมาย</b> (รอยืนยันนัด) พร้อมวันเวลาที่เลือก การ์ดจะย้ายออกจากแท็บติดตาม</>}
                    {outcome === "postponed" && <>สร้างใบงานขั้น <b>ติดตาม</b> พร้อมวันนัดโทรใหม่ ยังอยู่แท็บเดิมแต่จะไม่โผล่ซ้ำจนถึงวันนัด</>}
                    {outcome === "no_answer" && <><b>ไม่สร้างใบงาน</b> บันทึกประวัติอย่างเดียว · ครบจำนวนครั้งที่ตั้งไว้จะย้ายไปแท็บติดต่อไม่ได้</>}
                    {outcome === "declined" && <><b>ไม่สร้างใบงาน</b> ย้ายไปแท็บไม่เอา · <b>สิทธิ์ไม่ถูกตัด</b> ยังใช้ได้ถ้าเปลี่ยนใจ</>}
                    {outcome === "wrong_number" && <>ทำเครื่องหมายเบอร์นี้ว่า <b>ใช้ไม่ได้</b> ถ้าไม่เหลือเบอร์อื่นจะตกไปแท็บติดต่อไม่ได้</>}
                  </div>
                </div>

                <div className="mt-3 flex md:justify-end">
                  <button type="button" disabled={busy} onClick={saveCall} className={`${PRIMARY_BTN} flex-1 md:flex-none md:w-64`}>
                    {busy ? "กำลังบันทึก…" : "บันทึกการโทร"}
                  </button>
                </div>
              </StepCard>
            )}

            {/* ★ ขั้น 02–03 เป็นของงานเสียเงิน (แผน 20260924-02)
                เฟส 2: ออก/แก้ใบเสนอราคาได้แล้ว (OmQuotationPanel) · ส่งอนุมัติเฟส 3 · รับเงินเฟส 4 */}
            {step === 1 && (
              <StepCard n={1} state={stepState(1)} title="เสนอราคา">
                <div className={SECTION}>
                  <OmQuotationPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} />
                </div>
              </StepCard>
            )}

            {/* เฟส 4: แนบสลิป → Account ยืนยันในคิวเดิม → เติมสิทธิ์ที่ซื้อ → โทรนัดได้ */}
            {step === 2 && (
              <StepCard n={2} state={stepState(2)} title="ชำระเงิน">
                <div className={SECTION}>
                  <OmPaymentPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} />
                </div>
              </StepCard>
            )}

            {/* ★ นัดหมาย = รวมขั้น "ทำนัด" กับ "รอ O&M" เดิม (ขั้นย่อย 2410 รอยืนยันนัด · 2420 นัดแล้ว)
                ปุ่มโผล่เฉพาะสถานะที่กดได้จริง — เดิมโผล่ตลอด กดผิดสถานะแล้วค่อยโดน API ปฏิเสธ */}
            {step === 3 && (
              <StepCard n={3} state={stepState(3)} title="นัดหมาย — ยืนยันนัด · จ่ายทีมช่าง">
                <div className="space-y-3">
                  <div className={SECTION}>
                    <div className={FIELD_LABEL}>ยืนยันนัด</div>
                    {item.scheduled_at ? (
                      <>
                        <div className="text-sm">นัดไว้ <b>{thDT(item.scheduled_at)}</b>
                          {cur !== "pending" && at >= 3 && <span className="ml-2 text-emerald-600 font-semibold">✓ ลูกค้ายืนยันแล้ว</span>}
                        </div>
                        {cur === "pending" && (
                          <div className="mt-3 flex gap-2 flex-wrap">
                            <button type="button" disabled={busy || !item.booking_id}
                              onClick={() => patchJob({ status: "confirmed" }, "ยืนยันนัดแล้ว")}
                              className={PRIMARY_BTN}>ลูกค้ายืนยันแล้ว</button>
                            <button type="button" disabled={busy || !item.booking_id}
                              onClick={() => patchJob({ status: "follow" }, "ย้ายกลับไปติดตาม")}
                              className={SECONDARY_BTN}>กลับไปติดตาม</button>
                          </div>
                        )}
                      </>
                    ) : <div className="text-sm text-gray-500">ยังไม่มีวันนัด — กลับไปขั้นติดตามเพื่อบันทึกการโทร</div>}
                  </div>

                  <div className={SECTION}>
                    <div className={FIELD_LABEL}>จ่ายทีมช่าง</div>
                    <div className="text-xs text-gray-500 mb-2">ปกติจ่ายงานด้วยการลากวางในปฏิทิน ตรงนี้เป็นทางลัดสำหรับงานเดี่ยว</div>
                    <div className="grid grid-cols-2 md:grid-cols-7 gap-2">
                      {teams.map((t) => (
                        <button key={t.id} type="button" disabled={busy || !item.booking_id}
                          onClick={() => patchJob({ team_id: t.id }, `จ่ายงานให้ทีม ${t.name} แล้ว`)}
                          className={chipBtn(item.team_id === t.id)}>
                          ทีม {t.name} <span className={`font-normal ${item.team_id === t.id ? "text-white/70" : "text-gray-400"}`}>· ค้าง {t.open_jobs}</span>
                        </button>
                      ))}
                    </div>
                    {!teams.length && <span className="text-sm text-gray-400">ยังไม่มีทีมช่างในระบบ</span>}
                  </div>

                  {item.team_id && cur === "confirmed" && (
                    <div className="flex md:justify-end">
                      <button type="button" disabled={busy}
                        onClick={() => patchJob({ status: "progress" }, "เริ่มงานแล้ว")}
                        className={`${PRIMARY_BTN} flex-1 md:flex-none md:w-64`}>ช่างถึงหน้างานแล้ว</button>
                    </div>
                  )}
                </div>
              </StepCard>
            )}

            {step === 4 && (
              <StepCard n={4} state={stepState(4)} title="เข้างาน — ช่างทำงานหน้างาน">
                {item.booking_id ? (
                  <div className={SECTION}>
                    {/* ★ เฟส 3: ใบตรวจรับงานฝังมาเลย ไม่ต้องเด้งออกไปหน้าอื่นแล้ว
                        ใบเดียวกับ /om/field/[id] เป๊ะ (components/om/JobFormPanel) แก้ที่เดียวได้ทั้งสองที่
                        wrapClass ตัด h-full/overflow ทิ้ง กันเกิด scroll ซ้อนในกล่องนี้ */}
                    <div className="text-sm text-gray-600 mb-3">
                      ช่างกรอกจากหน้าช่างบนมือถือได้เหมือนเดิม · ตรงนี้คือใบเดียวกัน
                      <a href={`/om/field/${item.booking_id}`}
                        className="ml-2 text-active font-semibold no-underline hover:underline">เปิดเต็มจอ ›</a>
                    </div>
                    <div className="-mx-3 -mb-3 rounded-b-lg overflow-hidden">
                      <JobFormPanel jobId={String(item.booking_id)} wrapClass="bg-gray-50" embedded />
                    </div>
                  </div>
                ) : (
                  <div className={`${SECTION} text-sm text-gray-500`}>ยังไม่มีใบงาน — ใบตรวจรับงานจะขึ้นเมื่อสร้างนัดแล้ว</div>
                )}
              </StepCard>
            )}

            {/* ★ ขั้นใหม่ (เดิมไม่มีบนแถบ) — ช่างทำเสร็จแล้ว รอลูกค้าตรวจรับก่อนปิด */}
            {step === 5 && (
              <StepCard n={5} state={stepState(5)} title="รอปิด — ลูกค้าตรวจรับ">
                <div className={`${SECTION} text-sm text-gray-600 leading-relaxed`}>
                  ช่างทำงานเสร็จแล้ว รอลูกค้า<b>เซ็นรับที่หน้างาน</b>หรือ<b>ยืนยันทาง LINE</b> · ปิดงานทำที่ใบตรวจรับงาน
                  {item.booking_id && (
                    <a href={`/om/field/${item.booking_id}`}
                      className="ml-2 text-active font-semibold no-underline hover:underline">เปิดใบตรวจรับงาน ›</a>
                  )}
                </div>
              </StepCard>
            )}

            {step === 6 && (
              <StepCard n={6} state={stepState(6)} title="ปิดงาน">
                <div className={`${SECTION} text-sm text-gray-600`}>
                  {cur === "closed" ? <b className="text-emerald-600">ปิดงานแล้ว</b> : "ปิดงานทำที่หน้าช่าง หลังลูกค้าเซ็นรับหรือยืนยันทาง LINE"}
                  {skip
                    ? <> · ปิดแล้วระบบ{cur === "closed" ? "ตัด" : "จะตัด"}<b>สิทธิ์ล้าง 1 ครั้ง</b>{cur !== "closed" && <> เหลือ {Math.max(0, item.balance - 1)} ครั้ง</>}</>
                    : <> · งานเสียเงิน <b>ไม่ตัดสิทธิ์</b></>}
                </div>
              </StepCard>
            )}

            {/* มือถือไม่มีแผง Activity Log ด้านขวา — แสดงประวัติต่อท้ายการ์ดแทน */}
            <div className="md:hidden pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4" strokeWidth={2} />
                Activity Log <span className="ml-1 text-gray-400 normal-case">{history.length}</span>
              </div>
              {historyTimeline}
            </div>
          </div>
        </div>

        {/* แผงขวา Activity Log (desktop) — เปลือกกลาง ui/Timeline ตัวเดียวกับหน้า lead */}
        <aside className="hidden md:flex w-80 border-l border-gray-200 bg-gray-50/30 flex-col min-h-0 shrink-0">
          <div className="flex-1 overflow-y-auto p-4">{historyTimeline}</div>
        </aside>
      </div>
    </div>
  );
}

// การ์ดขั้น — หน้าตาเดียวกับ StepCard ของหน้า lead (ไอคอน · STEP nn · O&M · ชื่อขั้น · ป้าย Active/Done)
// ★ ต่างตรงที่ขั้นที่ยังไม่ถึงยังแสดงเนื้อใน — หน้านี้กดราง STEPS เข้าไปอ่านได้ทุกขั้น
function StepCard({ n, state, title, children }: {
  n: number; state: StepState; title: string; children: React.ReactNode;
}) {
  const muted = state === "upcoming" || state === "skipped";
  const container = state === "active"
    ? "bg-active-light border border-active shadow-sm shadow-active/10 ring-1 ring-active/20"
    : state === "done"
    ? "bg-white border border-gray-300"
    : "bg-gray-50 border border-dashed border-gray-200";
  const iconBox = state === "active"
    ? "bg-active text-white"
    : state === "done"
    ? "bg-emerald-500 text-white"
    : "bg-white text-gray-300 ring-1 ring-inset ring-gray-200";

  return (
    <div className={`rounded-2xl overflow-hidden transition-all ${container}`}>
      <div className="flex items-center gap-3 px-5 py-4">
        <div className={`w-10 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBox}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={STEP_ICON[n]} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold tracking-wider uppercase leading-none ${muted ? "text-gray-300" : "text-gray-400"}`}>
            Step {String(n + 1).padStart(2, "0")} · O&amp;M
          </div>
          <div className={`text-base font-bold leading-tight tracking-tight mt-1 ${muted ? "text-gray-500" : "text-gray-900"}`}>{title}</div>
        </div>
        {state === "active" && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-active shrink-0">
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-active opacity-60 animate-ping" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-active" />
            </span>
            Active
          </span>
        )}
        {state === "done" && (
          <span className={`inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider shrink-0 ${n === 2 ? "text-blue-600" : "text-teal-600"}`}>
            ✓ {n === 2 ? "Paid" : "Done"}
          </span>
        )}
        {state === "skipped" && (
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 shrink-0">ข้าม</span>
        )}
      </div>
      <div className="px-5 pb-5 pt-3 border-t border-gray-100">{children}</div>
    </div>
  );
}
