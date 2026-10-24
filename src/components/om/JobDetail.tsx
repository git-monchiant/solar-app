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

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { hasRole, useActiveRoles } from "@/lib/roles";
import { formatTHB } from "@/lib/utils/formatters";
import { CALL_OUTCOME, EXIT_STATUS, statusLabel, statusTone } from "@/lib/om/booking";
import Timeline from "@/components/ui/Timeline";
import { CheckIcon, ChevronLeftIcon, ClockIcon, DocumentIcon, PhoneIcon } from "@/components/ui/icons";
import NotificationBell from "@/components/layout/NotificationBell";
import JobHistoryItem from "@/components/om/JobHistoryItem";
import JobFormPanel from "@/components/om/JobFormPanel";
import OmQuotationPanel, { openQuotationPdf } from "@/components/om/OmQuotationPanel";
import OmPaymentPanel, { OmReceiptHead } from "@/components/om/OmPaymentPanel";
import OmRescheduler from "@/components/om/OmRescheduler";
import OmSlotPicker from "@/components/om/OmSlotPicker";
import OmFollowupModal from "@/components/om/OmFollowupModal";
import OmCustomerModal from "@/components/om/OmCustomerModal";
import ServiceDocButton from "@/components/om/ServiceDocButton";
import { HouseEquipmentTab, HouseInfoTab, JobPhotosTab } from "@/components/om/HouseTabs";
import JobTimelineTab, { StageEvents, bookingStages, type Row, type StageKey } from "@/components/om/JobTimelineTab";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
// ★ เนื้อในการ์ดที่ปิดแล้วใช้ของกลางฝั่งขายตรง ๆ (แผน 20260929-02) — StepLayout โหมด done + กล่อง DoneSection
//   สองตัวนี้เป็น component กลางของทุกขั้นฝั่งขาย ไม่ใช่ไฟล์หน้า lead (ใบตรวจ JobFormPanel ก็ใช้ StepLayout อยู่แล้ว)
import StepLayout from "@/components/lead/detail/StepLayout";
import DoneSection from "@/components/lead/detail/steps/DoneSection";
import JobReportSummary from "@/components/om/JobReportSummary";
import ModalBase from "@/components/ui/ModalBase";
import {
  BUCKET_LABEL, FLOW, OM_REPAIR_ENABLED, QUOTE_STATUS, TONE, jobAt, skipsPaidSteps, thD, thAppt,
  type BookingSummary, type HistoryRow, type Item, type Team,
} from "@/lib/om/service-view";

// ★ 29 ก.ย. 69 (แผน 20260929-02): 3 สถานะแบบ cardState ของหน้า lead (active · done · locked) + ข้าม (งานใช้สิทธิ์ฟรี)
//   เดิมขั้นที่ยังไม่ถึง (upcoming) เปิดดูเนื้อในได้และกดปุ่มได้ · ขั้นที่ปิดแล้วยังเป็นฟอร์มเต็ม
type StepState = "active" | "done" | "skipped" | "locked";

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
  // ปิดงาน (★ 28 ก.ย. 69 ตัดขั้นรอปิดออกแล้ว — ไอคอนลำดับเดียวกับ FLOW 6 ขั้น)
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

// ผลการโทรในการ์ดขั้นติดตาม — เฉพาะ "ติดต่อได้" ที่ทำให้งานเดินหน้า (แถวแบบ modal Follow-up ฝั่งขาย)
// ★ 1 ต.ค. 69 (ผู้ใช้เคาะ "ตามแนะนำ"): ติดต่อไม่ได้ (ไม่รับสาย / เบอร์ผิด) ย้ายไปปุ่ม Follow-up ข้าง Note แบบหน้า lead
//   (OmFollowupModal) · ยุบ "ขอเลื่อน" ไปก่อนหน้านี้แล้ว — ลูกค้าขอเลื่อน = ตกลงนัดวันที่สะดวก
//   API ยังรับทุกผล (ประวัติเก่ายังแสดงป้ายจาก CALL_OUTCOME)
const CALL_ROWS = [
  { value: "agreed", label: "ตกลงรับบริการ" },   // ขั้น 01 ไม่เลือกวันแล้ว — วันนัดเลือกที่ขั้น 04
  { value: "declined", label: "ปฏิเสธไม่รับบริการ" },   // 15 ต.ค. 69 ผู้ใช้สั่งเปลี่ยนจาก "ปฏิเสธ ไม่เอา"
] as const;

export default function JobDetail({ item, history, bookings = [], rules, onBack, onDone, onSaved, onReload }: {
  item: Item;
  /** ประวัติของบ้านหลังนี้ — หน้าเรียกใช้เป็นคนโหลด (มาพร้อม /api/om/follow?house=) */
  history: HistoryRow[];
  /** ใบงานทุกใบของบ้าน — หัวกลุ่มของแท็บ Timeline (มาพร้อม /api/om/follow?house= · แผน 20260928-05) */
  bookings?: BookingSummary[];
  /** ค่าในหน้าตั้งค่า O&M (call.* · booking.*) — มาพร้อม /api/om/follow?house= (แผน 20260929-03) */
  rules?: Record<string, unknown>;
  /** ปุ่ม ‹ กลับรายการ — ไม่ส่งมา (โหมด focus/แท็บใหม่) = ซ่อนปุ่ม เหมือนหน้า lead */
  onBack?: () => void;
  /** หลังบันทึกการโทร/เปลี่ยนสถานะสำเร็จ — ปกติกลับรายการ · โหมด focus โหลดใหม่อยู่หน้าเดิม */
  onDone: () => void;
  onSaved: (m: string) => void;
  /** โหลดข้อมูลบ้านใหม่โดยไม่ออกจากหน้า (ใช้ตอนเปลี่ยนเจ้าของงาน) */
  onReload?: () => void;
}) {
  const cur = item.job_status ?? "follow";
  // ★ ตำแหน่งบนแถบมาจาก jobAt ที่เดียวกับการ์ด (แผน 20260924-02 เฟส 1)
  //   เดิม findIndex เอง ใบงานที่ status ไม่อยู่ใน FLOW เลยเปิดมาที่ขั้น 01 · checked (ไม่มีขั้นแล้ว) ยืนที่เข้างาน
  // ★ 29 ก.ย. 69 (แผน 20260929-02): ชำระเงินครบแล้ว (รอโทรนัด) ยืนที่ขั้นนัดหมาย — ฟอร์มโทรตกลงวันนัดอยู่การ์ดนั้น
  //   (เดิมให้ย้อนไปบันทึกการโทรที่ขั้น 01 ซึ่งตอนนี้ปิดขั้นแล้วเป็นอ่านอย่างเดียว)
  const at = jobAt(item);
  const paidWaiting = at === 3 && cur === "payment";
  const skip = skipsPaidSteps(item);
  const isExit = (EXIT_STATUS.map((x) => x.k) as string[]).includes(cur);
  // ★ บ้านสิทธิ์หมด นัดตรงไม่ได้ ต้องเสนอราคาก่อน (ผู้ใช้เคาะ 28 ก.ย. 69 · API /api/om/follow กันอีกชั้น)
  //   งานถัดไป = ยังไม่มีใบ / ใบล่าสุดจบแล้ว → ใบล้างใหม่ (กินสิทธิ์) · ใบค้างขั้นติดตาม → ดูชนิดงานของใบนั้น
  const nextJob = !item.booking_id || cur === "closed" || isExit;
  const needQuote = item.balance <= 0 && (nextJob || (cur === "follow" && item.consumes_quota === 1));
  // ★ บ้านสิทธิ์หมด: ออกใบเสนอราคา (ขั้น 02) ได้ตั้งแต่ยังอยู่ขั้นติดตาม — ขั้น 02 จึงเปิดคู่กับขั้น 01 เฉพาะกรณีนี้
  //   ไม่งั้นล็อกขั้นที่ยังไม่ถึงแล้ว บ้านสิทธิ์หมดจะไปต่อไม่ได้เลย (ตกลงนัดตรงไม่ได้ · ออกใบก็ไม่ได้)
  const quoteOpen = needQuote && at === 0 && !skip;
  // ★ แผน 20261014-06: Account (ไม่มี role ทีม O&M) เปิดหน้านี้จากคิว "รอยืนยันรับเงิน" แบบฝั่งขายเปิดหน้า lead
  //   ทำได้แค่ขั้น 03 (ยืนยันเงิน · แนบใบเสร็จ) ที่เหลืออ่านอย่างเดียว · API ทางเขียนกันอีกชั้น (OM_WORK_ROLES)
  //   role ยังไม่โหลด = ถือว่าไม่ใช่ (กันทีม O&M เห็นหน้าอ่านอย่างเดียวแวบหนึ่ง)
  const { activeRoles } = useActiveRoles();
  const viewOnly = activeRoles.length > 0 && !hasRole(activeRoles, ...OM_WORK_ROLES);
  // คิวตั้ง omFocusPay_<บ้าน> = เลขใบงาน ก่อนเปิดหน้า (แบบ leadFocusStep_ ฝั่งขาย) → เปิดการ์ดขั้น 03 แทนขั้นปัจจุบัน
  //   (รับเช็คแล้ว/ชำระแล้ว ขั้นปัจจุบันเลยไปนัดหมาย) · ใบงานที่หน้านี้แสดงไม่ตรง (บ้านมีใบใหม่กว่า) = เปิดขั้นปัจจุบันตามปกติ
  //   หน้านี้ขึ้นหลังโหลดข้อมูลบ้านเสร็จเท่านั้น (ไม่ render ฝั่ง server) จึงอ่านตอนตั้งค่าเริ่มได้ · ลบคีย์ใน effect ด้านล่าง
  const [focusPay] = useState(() => typeof window !== "undefined" && !!item.booking_id
    && localStorage.getItem(`omFocusPay_${item.house_id}`) === String(item.booking_id));
  const [step, setStep] = useState(focusPay ? 2 : at);
  // การ์ดขั้นที่ปิดแล้วกาง/พับ — เปิดขั้นไหนจากราง กางให้เลยแบบโหมด focus ของหน้า lead (ดูทีละขั้นอยู่แล้ว)
  // ★ แผน 20260929-03 ข้อ 4: มือถือเรียงทุกการ์ดต่อกัน ⇒ แยกพับ/กางรายการ์ด (เดิมตัวเดียวใช้ร่วม)
  //   เริ่มกางเฉพาะขั้นที่เปิดมา — ขั้นก่อนหน้าบนมือถือพับเหลือบรรทัดสรุป ขั้นที่ทำอยู่เลยอยู่บนสุดเอง
  const [openDone, setOpenDone] = useState<Set<number>>(() => new Set([focusPay ? 2 : at]));
  // ★ 2 ต.ค. 69: งานเดินหน้าหลังโหลดใหม่ (เช่นอนุมัติใบเสนอราคาครบ) ขณะเปิดดูขั้นเดิมอยู่ → ไปขั้นใหม่ให้เอง
  //   แบบโหมด focus ของหน้า lead (visibleStep = focusedStep ?? currentStep) · เดิม step ตั้งครั้งเดียวตอนเปิดหน้า ค้างขั้นที่ปิดแล้ว
  //   เปิดดูขั้นอื่นค้างไว้ = ไม่ดึงไป · ปรับ state ระหว่าง render ตามแนวทาง React (ไม่ต้องรอ effect แล้วกระพริบ)
  //   Account ไม่ดึงไป — ยืนยันเงินแล้วต้องแนบใบเสร็จต่อที่ขั้น 03 (ขั้นนัดหมายไม่ใช่งานของ Account)
  const [prevAt, setPrevAt] = useState(at);
  if (at !== prevAt) {
    setPrevAt(at);
    if (step === prevAt && !viewOnly) {
      setStep(at);
      setOpenDone((s) => new Set(s).add(at));
    }
  }
  // แท็บบนหน้าแบบ lead ฝั่งขาย (แผน 20260928-04 ข้อ 6) — Workflow · ข้อมูลบ้าน · อุปกรณ์ · รูป
  const [tab, setTab] = useState<"workflow" | "info" | "equipment" | "photos" | "timeline">("workflow");
  // ปุ่ม Note (ข้อ 7) · เลื่อนนัดในขั้นนัดหมาย (ข้อ 8)
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteErr, setNoteErr] = useState("");
  // ★ แผน 20261023-01 รอบ 5: แท็บย่อย Reschedule ของขั้น 05 พากลับมาเลื่อนนัดที่การ์ดขั้น 04 (true = กำลังเลื่อนนัด)
  const [resched, setResched] = useState(false);
  // ★ ไม่เลือกผลไว้ก่อน แบบ Follow-up ฝั่งขาย (แผน 20260929-03 ข้อ 2 · เดิมเลือก "ตกลงนัด" ไว้ให้)
  const [outcome, setOutcome] = useState<string>("");
  // ★ 23 ต.ค. 69 (แผน 20261023-01 รอบ 4) ถอด schedNow — งานฟรีกด "ยืนยันรับบริการ" ที่ขั้น 01 แล้วบันทึกทันที (agreeNow)
  //   เดิม 1 ต.ค. 69 ไม่บันทึกจนเลือกวันเสร็จที่ขั้น 04 · ออกจากหน้ากลางทางแล้วหาย (บ้าน 146/11)
  const [note, setNote] = useState("");
  // วันนัด + เวลาเริ่มของช่วง (om_slot_config) — เดิมช่อง datetime-local ช่องเดียว
  const [apDate, setApDate] = useState("");
  // ช่องที่จอง (JSON array แบบนัดสำรวจ) — แผน 20261001-01 เฟส 3 · เดิมเวลาเริ่มของช่วงเดียว
  const [apSlot, setApSlot] = useState("");
  // โครงการของบ้าน — ตัวเลือกวันนัดขั้น 04 / Reschedule ขั้น 05 ไฮไลต์วันที่ทีมเข้าโครงการนี้อยู่แล้ว (แผน 20261021-02)
  const project = { id: item.project_id, name: item.project_name };
  // ปุ่ม Follow-up — บันทึกติดต่อไม่ได้ (OmFollowupModal)
  const [followOpen, setFollowOpen] = useState(false);
  // กด avatar หัวหน้า — modal ข้อมูลลูกค้า (OmCustomerModal ตัวเดียวกับหน้า /om/customers)
  const [profileOpen, setProfileOpen] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  // ── ใบงานซ่อม (เฟส 5 แผน 20260924-02) ──
  // ในประกัน: ระบบเลือกให้ก่อนเมื่อมีวันหมดประกันจากใบรับประกันฝั่งขาย (ผู้ใช้เคาะ 28 ก.ย.)
  //   ยังไม่หมด = ในประกัน · หมดแล้ว = นอกประกัน · ไม่มีข้อมูล (บ้าน REM) = ไม่เลือกให้ ทีมต้องเลือกเอง
  const today = new Date().toLocaleDateString("sv-SE");   // YYYY-MM-DD ตามเวลาเครื่อง
  const num = (k: string, d: number) => (rules?.[k] != null && !Number.isNaN(Number(rules[k])) ? Number(rules[k]) : d);
  const [rpOpen, setRpOpen] = useState(item.repair_needed === 1 && !item.repair_cancel_id);
  const [rpDetail, setRpDetail] = useState(item.repair_detail ?? "");
  const [rpWarranty, setRpWarranty] = useState<boolean | null>(
    item.warranty_end ? item.warranty_end >= today : null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const isRepairJob = !!item.parent_booking_id && item.in_warranty != null;
  // ── ลูกค้าไม่เอา — ยกเลิกใบงานก่อนนัด พร้อมใบเสนอราคา (POST /api/om/bookings/[id]/cancel) ──
  // ใบซ่อมยกเลิกได้ตั้งแต่ขั้นติดตาม · ใบงานทั่วไปเฉพาะขั้นเสนอราคา/ชำระเงิน (ขั้นติดตามบันทึกโทร "ปฏิเสธ" อยู่แล้ว)
  // มีใบเสนอราคาแล้ว = เฉพาะ Sale · เงินเข้าแล้ว/สลิปรอตรวจ = ไม่มีปุ่ม ต้องผ่าน Account ก่อน (API กันซ้ำอีกชั้น)
  const canIssue = hasRole(activeRoles, "admin", "sales", "sales_sup");
  const moneyIn = item.pay_state === "verifying" || item.pay_state === "paid";
  const canDecline = !viewOnly && !!item.booking_id && !moneyIn
    && (isRepairJob ? ["follow", "quote", "payment"] : ["quote", "payment"]).includes(cur)
    && (!item.q_id || canIssue);

  useEffect(() => {
    apiFetch("/api/om/teams").then((d) => setTeams(d.teams ?? [])).catch(() => {});
  }, []);
  // ชื่อแท็บ = บ้านเลขที่ - ชื่อลูกค้า เหมือนหน้า lead — เปิดหลายแท็บแล้วยังแยกออกว่าแท็บไหนบ้านไหน
  useEffect(() => {
    const prev = document.title;
    const name = item.customer_name || "ไม่มีชื่อ";
    document.title = item.house_number ? `${item.house_number} - ${name}` : name;
    return () => { document.title = prev; };
  }, [item.house_number, item.customer_name]);

  // สถานะของแต่ละขั้น — ใช้ทั้งราง STEPS และการ์ด (แบบ cardState ของหน้า lead)
  // เสนอราคา/ชำระเงิน ของงานใช้สิทธิ์ฟรี = ข้าม · ยังกดเข้าไปอ่านได้ว่าทำไมข้าม
  // ★ ยังไม่ถึง = locked แบบฝั่งขาย: รางกดไม่ได้ · การ์ดไม่มีเนื้อใน (แผน 20260929-02 ผู้ใช้เคาะ "แบบฝั่งขาย")
  // ตกลงรับบริการแล้วแต่ยังไม่มีวันนัด — เลือกวันที่ขั้น 04 (แท็บยืนยันนัดหมาย · การ์ดขึ้น "ยังไม่มีวันนัด")
  //   ★ 23 ต.ค. 69 ทางหลักของงานฟรี: ยืนยันรับบริการที่ขั้น 01 → ใบ pending ไม่มีวัน (API /api/om/follow)
  //   confirmed ไม่มีวันรับไว้ด้วย กันข้อมูลที่หลุดมา (เลือกวันแล้วเป็น confirmed เหมือนกัน)
  const pendingNoDate = at === 3 && (cur === "pending" || cur === "confirmed") && !item.scheduled_at;
  // ★ แผน 20261023-01 รอบ 5: ยืนยันนัดหมายแล้ว (รวมใบเก่าที่ค้างรอยืนยันนัดแต่มีวัน) — อยู่ขั้น 05 ยังเลื่อนนัดได้
  //   (API เลื่อนนัดรับเฉพาะ pending / confirmed — ช่างเริ่มกรอกใบตรวจแล้วเป็น progress เลื่อนไม่ได้)
  const apptSet = at === 4 && (cur === "pending" || cur === "confirmed") && !!item.scheduled_at;
  // ★ รอบ 8 (ผู้ใช้สั่งเปิดล็อก): เลื่อนนัดได้ทุกใบที่อยู่ขั้น 05 และยังไม่ปิด — รวมใบที่ช่างเริ่มงานแล้ว (API reschedule รับแล้ว)
  const canResched = at === 4 && cur !== "closed" && !!item.scheduled_at;
  const stepState = (i: number): StepState => {
    const f = FLOW[i];
    if (skip && "paid" in f && f.paid) return "skipped";
    // ★ แผน 20261014-03: เช็คเด้งหลังถึงหน้างาน — ขั้นชำระเงินกลับเป็นงานค้าง (ไม่ใช่ ✓ Paid)
    //   การ์ดโชว์แถวเช็คเด้ง + ฟอร์มแนบหลักฐานใหม่ทันที แบบขั้นเสนอราคาที่เปิดค้างได้ (quoteOpen)
    if (i === 2 && item.pay_state === "bounced") return "active";
    // กำลังเลื่อนนัด — การ์ดขั้น 04 เปิดเป็นงานค้างอีกครั้ง (ปฏิทินเลื่อนนัด)
    if (i === 3 && resched && canResched) return "active";
    if (i < at || cur === "closed") return "done";
    if (i === at || (i === 1 && quoteOpen)) return "active";
    return "locked";
  };
  // ไปขั้นอื่นจากราง = เลิกเลื่อนนัดที่ค้างไว้ (แท็บ Reschedule ตั้ง resched หลังเรียก go)
  const go = (i: number) => { setStep(i); setTab("workflow"); setResched(false); setOpenDone((s) => new Set(s).add(i)); };
  // แท็บย่อย Reschedule ของขั้น 05 → กลับมาการ์ดขั้น 04 เปิดปฏิทินเลื่อนนัด
  const openResched = () => { go(3); setResched(true); scrollToCard(3); };
  const toggleDone = (i: number) => setOpenDone((s) => {
    const n = new Set(s);
    if (n.has(i)) n.delete(i); else n.add(i);
    return n;
  });
  // desktop เปิดทีละการ์ดจากราง · มือถือ (ไม่มีราง) เรียงทุกการ์ดต่อกันแบบหน้า lead — แผน 20260929-03 ข้อ 4
  const cardWrap = (i: number) => (i === step ? "" : "md:hidden");

  // เหตุการณ์ของใบงานนี้แบ่งตามขั้น — เนื้อในการ์ดที่ปิดแล้ว (ชุดเดียวกับแท็บ Timeline ป้ายไม่เพี้ยนสองที่)
  const stages = useMemo(
    () => (item.booking_id ? bookingStages(bookings, history, teams, item.booking_id) : new Map<StageKey, Row[]>()),
    [bookings, history, teams, item.booking_id]);
  const rowsOf = (k: StageKey) => stages.get(k) ?? [];
  // ใบตรวจ/ใบตัดสิทธิ์ของใบงานนี้ (ผลตรวจ · เลขใบบริการ · เวลาปิด) — มาพร้อม bookings ของแท็บ Timeline
  const report = bookings.find((b) => b.id === item.booking_id) ?? null;

  // มือถือเรียงการ์ดต่อกัน — ข้ามไปขั้นอื่นแล้วเลื่อนจอไปการ์ดนั้น (หาตัวที่เลื่อนได้จริงตอนกด ไม่ใช้ค่า fix · ui-rules)
  const scrollToCard = (n: number) => {
    if (typeof window === "undefined" || !window.matchMedia("(max-width: 767px)").matches) return;
    setTimeout(() => {
      const el = document.getElementById(`om-step-${n}`);
      if (!el) return;
      let p = el.parentElement;
      while (p && !(p.scrollHeight > p.clientHeight && /(auto|scroll)/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
      if (p) p.scrollTo({ top: el.getBoundingClientRect().top - p.getBoundingClientRect().top + p.scrollTop - 12, behavior: "smooth" });
      else el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };
  // คีย์จากคิวรอยืนยันรับเงินใช้ครั้งเดียว (แบบ leadFocusStep_) · มือถือเรียงการ์ดต่อกัน → เลื่อนไปการ์ดขั้น 03
  useEffect(() => {
    localStorage.removeItem(`omFocusPay_${item.house_id}`);
    if (focusPay) scrollToCard(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ครั้งเดียวตอนเปิดหน้า
  }, []);
  // Account อ่านอย่างเดียว — ขั้นที่ไม่ใช่ชำระเงินบอกแค่ว่ารอทีมไหนอยู่ (แผน 20261014-06)
  const waitNote = (text: React.ReactNode) => <div className={`${SECTION} text-sm text-gray-600`}>{text}</div>;
  // ขั้น 01 ลูกค้าตกลง — งานเสียเงิน (สิทธิ์หมด) ไปขั้น 02 เสนอราคา · งานฟรีบันทึกทันทีแล้วเลือกวันนัดที่ขั้น 04
  // ★ 23 ต.ค. 69 ผู้ใช้สั่ง "กดยืนยัน step 1 แล้วสถานะไปแสดงที่ยืนยันนัดหมายเลย" (แผน 20261023-01 รอบ 4)
  //   บันทึกการโทร "ตกลงรับบริการ" ไม่มีวัน → API สร้างใบ pending (ช่างยังไม่เห็น) → แท็บยืนยันนัดหมาย · ราง/การ์ดอยู่ขั้น 04
  const agreeNow = async () => {
    setBusy(true); setErr("");
    try {
      await apiFetch("/api/om/follow", {
        method: "POST",
        body: JSON.stringify({ house_id: item.house_id, booking_id: item.booking_id, outcome: "agreed", note: note || null, phone: item.phone }),
      });
      setNote("");   // หมายเหตุไปกับการโทรครั้งนี้แล้ว — ช่องที่ขั้น 04 เริ่มว่าง
      onSaved("บันทึกแล้ว — ลูกค้าตกลงรับบริการ · เลือกวันนัดต่อที่ขั้น 04");
      if (onReload) onReload(); else onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const goAgree = () => {
    if (needQuote) { go(1); scrollToCard(1); return; }
    agreeNow();
  };
  // ★ 23 ต.ค. 69 ผู้ใช้สั่ง: เลือก "ตกลงรับบริการ" = เลือกเฉย ๆ แล้วกดปุ่ม "ยืนยันรับบริการ" ด้านล่างถึงไปขั้นถัดไป
  //   (เดิมเลือกแล้วพาไปขั้น 04 / 02 ทันที ปุ่มล่างไม่เคยได้กด)
  const pickOutcome = (k: string) => {
    setOutcome(k); setErr("");
  };
  const resetCall = () => { setOutcome(""); setNote(""); setApDate(""); setApSlot(""); setErr(""); };

  // oc = ผลที่จะบันทึก — การ์ดนัดหมายหลังชำระเงินเป็น "ตกลงนัด" เสมอ (ไม่มีให้เลือก)
  // confirm = ปุ่ม "ยืนยันนัดหมาย" ขั้น 04 — บันทึกเป็นยืนยันนัดหมาย แล้วไปขั้น 05 ทันที (แผน 20261023-01 รอบ 5 ผู้ใช้สั่ง)
  const saveCall = async (oc: string, confirm = false) => {
    if (!oc) return;
    if (oc === "agreed" && (!apDate || !apSlot)) { setErr("กรุณาเลือกวันและช่วงเวลานัด"); return; }
    setBusy(true); setErr("");
    try {
      await apiFetch("/api/om/follow", {
        method: "POST",
        body: JSON.stringify({
          house_id: item.house_id, booking_id: item.booking_id, outcome: oc,
          note: note || null,
          scheduled_at: oc === "agreed" ? apDate : null,
          time_slot: oc === "agreed" ? apSlot : null,
          confirm: oc === "agreed" && confirm,
          phone: item.phone,
        }),
      });
      if (confirm) go(4);
      onSaved(confirm ? "ยืนยันนัดหมายแล้ว" : "บันทึกการโทรแล้ว"); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };


  // เปิดใบงานซ่อมจากใบนี้ (ปิดแล้ว) — ใบใหม่เริ่มขั้นติดตาม (ในประกัน) หรือเสนอราคา (นอกประกัน)
  const openRepair = async () => {
    if (!item.booking_id) return;
    if (!rpDetail.trim()) { setErr("กรุณาระบุอาการ / สิ่งที่ต้องซ่อม"); return; }
    if (rpWarranty === null) { setErr("กรุณาเลือกว่างานซ่อมนี้อยู่ในประกันหรือนอกประกัน"); return; }
    setBusy(true); setErr("");
    try {
      const d = await apiFetch(`/api/om/bookings/${item.booking_id}/repair`, {
        method: "POST", body: JSON.stringify({ in_warranty: rpWarranty, detail: rpDetail.trim() }),
      });
      onSaved(`เปิดใบงานซ่อมเลขที่ ${d.id} แล้ว`); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const declineJob = async () => {
    if (!item.booking_id || !cancelReason.trim()) return;
    setBusy(true); setErr("");
    try {
      await apiFetch(`/api/om/bookings/${item.booking_id}/cancel`, {
        method: "POST", body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      onSaved(isRepairJob ? "ยกเลิกใบงานซ่อมแล้ว" : "ลูกค้าปฏิเสธบริการ — ยกเลิกใบงานแล้ว"); onDone();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  // ช่องเหตุผล + ปุ่มยืนยัน — แถบใบซ่อมบนสุด
  // ★ 2 ต.ค. 69 ผู้ใช้สั่งเอาแถบ "ลูกค้าไม่เอา — ยกเลิกงานนี้" ท้ายการ์ดขั้น 02/03 ของใบงานทั่วไปออก (แผน 20261002-09/10)
  //   ใบงานทั่วไปจึงไม่มีปุ่มยกเลิกบนหน้านี้แล้ว · API /api/om/bookings/[id]/cancel ยังอยู่
  const cancelForm = (
    <div className="mt-3 flex gap-2 flex-wrap items-center">
      <input value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} autoFocus
        placeholder={isRepairJob ? "เหตุผล เช่น ลูกค้าไม่ซ่อม / ซ่อมเองแล้ว" : "เหตุผล เช่น ราคาสูงเกินไป / ไม่สะดวกช่วงนี้"}
        className={`${INPUT} flex-1 min-w-[220px]`} />
      <button type="button" disabled={busy || !cancelReason.trim()} style={{ minHeight: 0 }} onClick={declineJob}
        className="h-8 px-4 rounded-lg text-xs font-semibold text-white bg-red-600 hover:brightness-110 cursor-pointer disabled:opacity-50">ยืนยันยกเลิก</button>
      <button type="button" onClick={() => setCancelOpen(false)} style={{ minHeight: 0 }}
        className="h-8 px-3 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-600 cursor-pointer">ไม่ยกเลิก</button>
    </div>
  );

  // โน้ตลงไทม์ไลน์ของบ้าน — ผูกใบงานล่าสุดด้วยถ้ามี (POST /api/om/houses/[id]/note)
  const saveNote = async () => {
    if (!noteText.trim()) return;
    setBusy(true); setNoteErr("");
    try {
      await apiFetch(`/api/om/houses/${item.house_id}/note`, {
        method: "POST", body: JSON.stringify({ text: noteText.trim(), booking_id: item.booking_id }),
      });
      setNoteOpen(false); setNoteText("");
      onSaved("บันทึกหมายเหตุแล้ว"); onReload?.();
    } catch (e) { setNoteErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  // ใบงานทุกใบของบ้าน (แท็บรูป) — จากไทม์ไลน์ที่ดึงทั้งบ้านมาแล้ว ไม่ต้องยิง API เพิ่ม
  const bookingIds = [...new Set([item.booking_id, ...history.map((h) => h.booking_id)].filter((x): x is number => !!x))];

  // ช่องเบอร์อาจมีหลายเบอร์คั่นกัน — ปุ่มโทรใช้เบอร์แรก
  const telNo = item.phone?.split(/[,/\s]+/).find(Boolean) ?? null;

  const historyTimeline = (
    <Timeline
      items={history}
      renderItem={(h, isLast) => <JobHistoryItem h={h} isLast={isLast} />}
      // หัวกลุ่มวันใช้ค่าเดิมของฝั่งขาย (Today · Yesterday · AUG 6) — 2 ต.ค. 69 ผู้ใช้สั่งรูปแบบเหมือนฝั่งขาย
      labels={{ empty: "ยังไม่มีประวัติ", emptyHint: "การโทร การนัดหมาย และการแก้ไขข้อมูลของบ้านนี้จะแสดงที่นี่" }}
    />
  );

  // ── การ์ดขั้นที่ปิดแล้ว (แผน 20260929-02) — StepLayout โหมด done ของฝั่งขาย: บรรทัดสรุป + ลูกศร · กางแล้วอ่านอย่างเดียว ──
  const doneView = (i: number, head: React.ReactNode, body: () => React.ReactNode) => (
    <StepLayout state="done" expanded={openDone.has(i)} onToggle={() => toggleDone(i)} doneHeader={head} renderDone={body} />
  );
  // เหตุการณ์ของขั้นในกล่อง DoneSection — ชุดเดียวกับแท็บ Timeline
  const events = (k: StageKey, color: React.ComponentProps<typeof DoneSection>["color"], title: string) => (
    <DoneSection color={color} title={title}>
      {rowsOf(k).length
        ? <StageEvents stage={k} rows={rowsOf(k)} />
        : <div className="text-sm text-gray-400">ไม่มีบันทึกในขั้นนี้</div>}
    </DoneSection>
  );
  // ตัดสิทธิ์ไหม — ★ เฟส 5: ซ่อม (ในประกัน) เป็นงานฟรีที่ไม่ใช้สิทธิ์ล้าง ดูจาก consumes_quota ไม่ใช่ skip อย่างเดียว
  //   ★ แผน 20260929-02: การ์ดปิดงานล็อกจนกว่าจะปิด ⇒ ก่อนปิดบอกที่การ์ดเข้างานแทน
  const quotaNote = skip && item.consumes_quota !== 0
    ? (cur === "closed" ? <>หัก<b>สิทธิ์ล้าง 1 ครั้ง</b></> : <>เมื่อปิดงาน ระบบจะหัก<b>สิทธิ์ล้าง 1 ครั้ง</b> คงเหลือ {Math.max(0, item.balance - 1)} ครั้ง</>)
    : skip
    ? <>งาน{item.service_type ?? "นี้"}ฟรี <b>ไม่หักสิทธิ์ล้าง</b></>
    : <>งานมีค่าบริการ <b>ไม่หักสิทธิ์</b></>;

  // ── แถบสรุปการโทรรอบนี้ (แผน 20260929-03 ข้อ 3) — ข้อมูลชุดเดียวกับการ์ดในรายการ (JobCard) ──
  //   เดิม API ส่งมาแล้วแต่การ์ดไม่แสดง ต้องไล่ Activity Log เอง · ไม่รู้ว่าอีกกี่ครั้งจะตกแท็บติดต่อไม่ได้
  //   "รอบนี้" = หลังล้างล่าสุด (follow-sql ②) — Activity Log ขวามือเห็นทุกรอบ ป้ายต้องบอกให้ชัด
  const maxTry = num("call.max_attempts", 3);
  const lastDay = item.last_call_at ? new Date(item.last_call_at).toLocaleDateString("sv-SE") : null;
  // นัดโทรใหม่ที่ยังค้าง — โทรตั้งแต่วันนัดไปแล้ว (เช่น ตกลงนัด) ถือว่าตามแล้ว แบบ "✓ ติดตามแล้ว" หน้า lead
  const pendingNext = item.next_call && (!lastDay || item.next_call > lastDay) ? item.next_call : null;
  const callSummary = (schedule: boolean) => {
    // กติกาครบ N ครั้งย้ายแท็บติดต่อไม่ได้ ใช้เฉพาะบ้านที่ยังไม่มีใบงานเดินหน้า (follow-sql bucket)
    // ใบซ่อมในประกันค้างติดตาม · ใบที่ชำระเงินแล้ว ยึดสถานะใบงาน ไม่ตกแท็บ
    const unreachRule = !schedule && !(cur === "follow" && !!item.in_warranty);
    const lastLeft = unreachRule && maxTry > 1 && item.no_answer === maxTry - 1;
    const reached = unreachRule && item.no_answer >= maxTry;
    const nextTone = !pendingNext ? "" : pendingNext < today ? "text-red-600" : pendingNext === today ? "text-amber-700" : "text-gray-600";
    const out = item.last_outcome ? CALL_OUTCOME[item.last_outcome] : null;
    return (
      <div className={`mb-3 px-3 py-2 rounded-lg border text-xs text-gray-600 flex flex-wrap items-center gap-x-2 gap-y-1 ${lastLeft ? "bg-amber-50 border-amber-200" : "bg-white border-gray-200"}`}>
        <ClockIcon className="w-4 h-4 text-gray-400 shrink-0" strokeWidth={2} />
        {!item.calls ? <span>ยังไม่เคยโทรรอบนี้</span> : <>
          <span>ติดตามรอบนี้ <b className="text-gray-900">{item.calls}</b> ครั้ง</span>
          <span className="text-gray-300">·</span>
          <span>ไม่รับสาย <b className="text-gray-900">{item.no_answer}/{maxTry}</b></span>
          {lastLeft && <><span className="text-gray-300">·</span><b className="text-amber-700">ไม่รับสายอีก 1 ครั้งจะย้ายไปแท็บติดต่อไม่ได้</b></>}
          {reached && <><span className="text-gray-300">·</span><b className="text-red-600">ครบ {maxTry} ครั้ง — อยู่แท็บติดต่อไม่ได้</b></>}
          {!lastLeft && item.last_call_at && (
            <span className="inline-flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-300">·</span>ล่าสุด
              {out && <span className={`text-xxs font-bold px-2 rounded-full text-white ${out.tone}`}>{out.t}</span>}
              {thD(item.last_call_at)}{item.last_by && <> โดย {item.last_by}</>}
            </span>
          )}
        </>}
        {pendingNext && (
          <b className={`md:ml-auto ${nextTone}`}>
            นัดโทรใหม่ {pendingNext === today ? "วันนี้" : thD(pendingNext)}{pendingNext < today && " (เลยกำหนด)"}
          </b>
        )}
      </div>
    );
  };

  // ── ฟอร์มบันทึกการโทร — ก้อนเดียว ใช้ 3 แบบ (แผน 20260929-02 · 1 ต.ค. 69) ──
  //   "follow" = การ์ดขั้น 01: ลูกค้าตกลงรับบริการไหม (ตกลง / ปฏิเสธ) — ไม่มีปฏิทิน
  //   "free"   = การ์ดขั้น 04 ใบที่ตกลงแล้วแต่ยังไม่มีวัน — เลือกวันนัดแล้วยืนยัน (ไม่มีปุ่มยกเลิก)
  //   "paid"   = การ์ดขั้น 04 หลังชำระเงินครบ — โทรตกลงวันนัด
  //   (ลูกค้าจ่ายเงินแล้ว — ไม่เอาไม่ใช่ทางของขั้นนี้ ยกเลิกหลังรับเงินต้องผ่าน Account)
  // ★ 1 ต.ค. 69 ผู้ใช้เคาะ "ตามแนะนำ": เลือกวันนัดที่ขั้น 04 ที่เดียว ทั้งงานฟรีและงานเสียเงิน
  //   ★ 23 ต.ค. 69 งานฟรีบันทึกตั้งแต่กด "ยืนยันรับบริการ" ที่ 01 (ใบ pending ไม่มีวัน) — เดิมบันทึกครั้งเดียวตอนเลือกวันเสร็จ
  //   ติดต่อไม่ได้ / ยังไม่ได้ข้อสรุป → ปุ่ม Follow-up (OmFollowupModal)
  // ★ ส่วนเลือกวันนัดเหมือน "เลื่อนนัดสำรวจ" ฝั่งขาย (AppointmentRescheduler) ทั้งก้อน
  //   หัวข้อ → ปฏิทิน 3 เดือน → ช่วงเวลา → แถบ "นัดเป็น" → ยกเลิก/✓ยืนยัน วางบนพื้นการ์ดตรง ๆ
  const callForm = (mode: "follow" | "paid" | "free") => {
    const schedule = mode !== "follow";
    const oc = schedule ? "agreed" : outcome;
    const needSlot = schedule && (!apDate || !apSlot);
    // ★ 21 ต.ค. 69 ผู้ใช้สั่งเพิ่มช่องหมายเหตุที่ขั้น 01 (ทุกผล · เดิมโผล่เฉพาะปฏิเสธ) และให้ขึ้นที่ขั้น 04 ด้วย
    //   state เดียวกัน — งานฟรีพิมพ์ที่ 01 แล้วกดตกลง ข้อความตามไปอยู่ในช่องขั้น 04 แก้ต่อได้
    //   บันทึกพร้อมการโทรเป็น reason ในประวัติ (ขึ้นใน Activity Log) · ยาวสุด 300 ตามคอลัมน์
    const noteField = (
      <div>
        <label className="block text-xs font-semibold tracking-wider uppercase text-gray-400 mb-1.5">หมายเหตุ</label>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={300}
          placeholder="เช่น ลูกค้าไม่อยู่บ้านช่วงเช้า"
          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-active resize-none" />
      </div>
    );
    return (
    <>
      {mode !== "free" && callSummary(schedule)}
      {/* ★ 1 ต.ค. 69 ผู้ใช้สั่งเอากล่องคำอธิบาย + โน้ตออกจากขั้น 04 — การ์ดเลือกวันนัดเหลือแถบหัว → ปฏิทิน → ปุ่ม
          งานชำระแล้วคงบรรทัดชี้ปุ่ม Follow-up ไว้ (โทรตกลงวันนัด อาจโทรไม่ติด)
          ★ 21 ต.ค. 69 ผู้ใช้สั่งเอาช่องหมายเหตุกลับมาที่ขั้น 04 (noteField ใต้ปฏิทิน) */}
      {mode !== "free" && <div className={SECTION}>
        {mode === "follow" && <>
          {/* หัว + แถวผล ยกจาก modal Follow-up ฝั่งขาย (จุดเขียว = ติดต่อได้) */}
          <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
            <svg className="w-3.5 h-3.5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
            </svg>
            <span>ติดต่อได้ — ผลการโทรครั้งนี้ <span className="text-red-500">*</span></span>
          </div>
          <div className="space-y-1.5">
            {CALL_ROWS.map((o) => {
              const selected = outcome === o.value;
              return (
                <button key={o.value} type="button" onClick={() => pickOutcome(o.value)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border text-sm transition-colors flex items-center gap-3 cursor-pointer ${
                    selected ? "border-gray-800 bg-gray-50 text-gray-900 font-semibold" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"}`}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${selected ? "bg-emerald-500" : "bg-emerald-300"}`} />
                  <span className="flex-1">{o.label}</span>
                  {selected && <CheckIcon className="w-4 h-4 text-gray-700" strokeWidth={3} />}
                </button>
              );
            })}
          </div>
        </>}
        {/* ทางไปบันทึกติดต่อไม่ได้ — คนที่ชินกับปุ่มเดิมในการ์ดจะได้ไม่หลง
            ★ 21 ต.ค. 69 ผู้ใช้สั่งเอาออกจากขั้น 01 (ปุ่ม Follow-up บนหัวการ์ดมีอยู่แล้ว) — เหลือเฉพาะงานชำระแล้วที่ขั้น 04 */}
        {mode === "paid" && <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
          <span>หากยังไม่ได้ข้อสรุปหรือติดต่อไม่ได้ บันทึกที่ปุ่ม</span>
          <button type="button" onClick={() => setFollowOpen(true)} style={{ minHeight: 0 }}
            className="inline-flex items-center gap-1 px-2 h-6 rounded-md bg-amber-50 text-amber-700 border border-amber-200 font-semibold hover:bg-amber-100 cursor-pointer">
            <ClockIcon className="w-3.5 h-3.5" strokeWidth={2} />Follow-up
          </button>
        </div>}

        {/* ผลของตัวเลือก — บอกก่อนกด */}
        {mode === "follow" && oc === "agreed" && (needQuote ? (
          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs leading-relaxed text-amber-900">
            บ้านนี้<b>ไม่มีสิทธิ์ล้างคงเหลือ</b> — ออกใบเสนอราคาที่ขั้น <b>02</b> และรับชำระเงินก่อนนัดหมาย
            · หากจำนวนสิทธิ์ไม่ถูกต้อง แก้ไขที่หน้าบ้าน / ระบบติดตั้ง
          </div>
        ) : (
          <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-600">
            กดยืนยันแล้ว<b>บันทึกทันที</b> ย้ายไปแท็บยืนยันนัดหมาย — เลือกวันนัดต่อที่ขั้น <b>04 นัดหมาย</b>
          </div>
        ))}
        {mode === "follow" && oc === "declined" && (
          <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-600">
            <b>ไม่สร้างใบงาน</b> ย้ายไปแท็บปฏิเสธ · <b>ไม่หักสิทธิ์</b>
          </div>
        )}

        {mode === "follow" && <div className="mt-3">{noteField}</div>}
      </div>}

      {/* ส่วนเลือกวันนัด = "เลื่อนนัดสำรวจ" ฝั่งขาย: หัวข้อตัวเทา → ปฏิทิน/ช่วงเวลา → แถบ "นัดเป็น" (อยู่ใน OmSlotPicker) */}
      {schedule && (
        <div className={`${mode === "free" ? "" : "mt-4 "}space-y-3`}>
          <div className="text-xs font-semibold tracking-wider uppercase text-gray-400">นัดเข้าบริการ</div>
          <OmSlotPicker date={apDate} slot={apSlot} excludeId={item.booking_id} rules={rules} pickedLabel="นัดเป็น" project={project}
            onDateChange={setApDate} onSlotChange={setApSlot} />
          {noteField}
        </div>
      )}

      {/* ปุ่มคู่ ยกเลิก / ✓ยืนยัน เต็มแถว — ยกจาก AppointmentRescheduler ฝั่งขาย
          ขั้น 01: ยกเลิก = ล้างที่เลือก · ตกลงแล้วปุ่มหลักพาไปขั้นถัดไป
          ขั้น 04 งานชำระแล้ว: ยกเลิก = ล้างวันที่เลือก
          ★ 21 ต.ค. 69 ขั้น 04 งานฟรีไม่มีปุ่มซ้ายแล้ว (เดิม "‹ กลับขั้น 01") — ผู้ใช้สั่งเอาออก ปุ่มยืนยันเต็มแถว */}
      <div className="mt-3 flex gap-2 pt-1">
        {mode !== "free" && (
          <button type="button"
            disabled={busy || (mode === "follow" && !outcome) || (mode === "paid" && !apDate && !apSlot)}
            onClick={resetCall}
            className="flex-1 h-11 rounded-lg text-sm font-semibold bg-white border border-gray-200 text-gray-700 hover:border-gray-400 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
            ยกเลิก
          </button>
        )}
        {mode === "follow" && oc === "agreed" ? (
          // ★ 23 ต.ค. 69 ผู้ใช้สั่ง: เลือก "ตกลงรับบริการ" แล้วปุ่มนี้ = "ยืนยันรับบริการ" (เดิม "ไปเลือกวันนัด ›" / "ไปขั้น 02 เสนอราคา ›")
          //   กดแล้วไปขั้นถัดไปเหมือนเดิม — งานฟรีขั้น 04 เลือกวันนัด · งานเสียเงินขั้น 02 เสนอราคา (กล่องเทาด้านบนบอกปลายทาง)
          <button type="button" onClick={goAgree}
            className="flex-[2] h-11 rounded-lg text-sm font-bold text-white bg-active hover:bg-active-dark shadow-sm shadow-active/30 flex items-center justify-center gap-2 cursor-pointer">
            <CheckIcon className="w-4 h-4" strokeWidth={2.5} />ยืนยันรับบริการ
          </button>
        ) : (
          <button type="button" disabled={busy || !oc || needSlot} onClick={() => saveCall(oc, schedule)}
            className="flex-[2] h-11 rounded-lg text-sm font-bold text-white bg-active hover:bg-active-dark disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-active/30 flex items-center justify-center gap-2 cursor-pointer">
            {/* ★ 1 ต.ค. 69 ผู้ใช้ตั้งชื่อปุ่มขั้น 04 = "ยืนยันและเข้างาน" ทุกสถานะ (ยังไม่เลือกช่วงเวลา = ปุ่มจาง กดไม่ได้)
                → 22 ต.ค. 69 "ยืนยันนัดหมาย" ตรงกับชื่อสถานะที่ได้หลังกด (ขั้น 05 เปลี่ยนชื่อเป็นปฏิบัติงาน)
                ขั้น 01 (ปฏิเสธ) ยังเป็นบันทึกการโทร */}
            {busy ? "กำลังบันทึก…" : !oc ? "เลือกผลการโทร" : (
              <><CheckIcon className="w-4 h-4" strokeWidth={2.5} />{schedule ? "ยืนยันนัดหมาย" : "บันทึกการโทร"}</>
            )}
          </button>
        )}
      </div>
    </>
    );
  };

  // ── เลื่อนนัด (แผน 20261023-01 รอบ 5/7) — แท็บย่อย "วันนัด" ของขั้น 05 → ปุ่ม Reschedule พามาการ์ดขั้น 04 ──
  //   แถบนัด (ยกจากขั้นย่อย "นัด" ของ Install ฝั่งขาย แผน 20260928-04 ข้อ 8 · ปุ่ม Reschedule ชิดขวาบนแถบ) + ปฏิทินเลื่อนนัด
  //   ยกเลิก = กลับขั้น 05 · เลื่อนสำเร็จ = โหลดใหม่ (ใบยังมีวันนัด อยู่ขั้น 05 เหมือนเดิม)
  //   ★ ถอดปุ่ม "ช่างถึงหน้างาน" (ผู้ใช้สั่ง "ยืนยันนัดหมายเสร็จให้ไป step ต่อไปเลย")
  //     ช่างเริ่มกรอกใบตรวจ (บันทึกร่าง / กดถัดไปจากตรวจ) = กำลังปฏิบัติงานเอง — JobFormPanel markStarted
  //   สีม่วง = รอยืนยันนัด (ใบเก่า) · สีเขียว = ยืนยันแล้ว (รวมใบที่ช่างเริ่มงานแล้ว)
  const confirmedNow = cur !== "pending";
  const apptBar = (withResched: boolean) => (
    <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border ${confirmedNow ? "bg-emerald-50 border-emerald-600/15" : "bg-active-light border-active/20"}`}>
      <svg className={`w-4 h-4 shrink-0 ${confirmedNow ? "text-emerald-600" : "text-active"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25" />
      </svg>
      <div className="flex-1 flex items-baseline gap-1.5 flex-wrap min-w-0">
        <span className={`text-xs font-semibold tracking-wider uppercase ${confirmedNow ? "text-emerald-700/70" : "text-active/70"}`}>
          {confirmedNow ? "ยืนยันแล้ว" : "นัดหมายแล้ว"}
        </span>
        <span className={`text-sm font-bold ${confirmedNow ? "text-emerald-900" : "text-active"}`}>{thAppt(item.scheduled_at, item.time_slot)}</span>
      </div>
      {withResched && (
        <button type="button" onClick={openResched} style={{ minHeight: 0 }}
          className={`shrink-0 text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border transition-colors cursor-pointer ${confirmedNow ? "border-emerald-600/20 text-emerald-700 hover:bg-emerald-100" : "border-active/30 text-active hover:bg-active/10"}`}>
          Reschedule
        </button>
      )}
    </div>
  );
  // แท็บย่อยแรก "วันนัด" ของขั้น 05 (รอบ 7 ผู้ใช้สั่ง) — วันนัดที่ยืนยันแล้ว + Reschedule
  //   ★ รอบ 8 เปิดล็อก: ใบที่ช่างเริ่มงานแล้วก็เลื่อนได้ (เดิมขึ้น "ช่างเริ่มปฏิบัติงานแล้ว — เลื่อนนัดไม่ได้")
  const apptTab = item.scheduled_at ? apptBar(canResched) : undefined;
  const reschedBlock = item.booking_id ? (
    <div className="space-y-3">
      {apptBar(false)}
      <OmRescheduler bookingId={item.booking_id} currentAt={item.scheduled_at} currentSlot={item.time_slot} rules={rules} project={project}
        onCancel={() => go(4)}
        onSaved={(m) => { onSaved(m); onDone(); }} />
    </div>
  ) : null;

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
            {/* กดเปิดข้อมูลลูกค้า แบบ avatar หน้า lead เปิด ProfileModal (2 ต.ค. 69) — บ้านที่ยังไม่ผูกลูกค้ากดไม่ได้ */}
            {/* Account อ่านอย่างเดียว — modal นี้แก้ข้อมูลลูกค้า/เบอร์ได้ จึงกดไม่ได้ (แผน 20261014-06) */}
            <button type="button" onClick={() => setProfileOpen(true)} disabled={!item.customer_id || viewOnly}
              title={viewOnly ? undefined : item.customer_id ? "ข้อมูลลูกค้า" : "ยังไม่ระบุลูกค้า"}
              className="w-14 h-14 rounded-full flex items-center justify-center text-gray-600 shrink-0 hover:opacity-80 transition-colors cursor-pointer disabled:cursor-default disabled:hover:opacity-100"
              style={{ minHeight: 0 }}>
              <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0012 15.75a7.488 7.488 0 00-5.982 2.975m11.963 0a9 9 0 10-11.963 0m11.963 0A8.966 8.966 0 0112 21a8.966 8.966 0 01-5.982-2.275M15 9.75a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
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
                  {item.house_number ? `${item.house_number} - ` : ""}{item.customer_name || "ไม่มีชื่อ"}
                </h1>
                <span className={`hidden sm:inline-flex shrink-0 text-xxs font-bold uppercase tracking-wide px-2 py-0.5 rounded-full text-white ${TONE[item.bucket] ?? "bg-gray-400"}`}>
                  {BUCKET_LABEL[item.bucket] ?? item.bucket}
                </span>
                {isExit && (
                  <span className={`hidden sm:inline-flex shrink-0 text-xxs font-bold tracking-wide px-2 py-0.5 rounded-full text-white ${statusTone(cur)}`}>
                    ใบงานล่าสุด {statusLabel(cur)}
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
                  <span className="font-mono tabular-nums">{item.phone || "ไม่มีเบอร์โทร"}</span>
                  {/* ★ 24 ต.ค. 69 ผู้ใช้สั่งเพิ่มขนาด kW — ต่อจากเบอร์แบบการ์ดในรายการ (JobCard) · หลายระบบ = "2.00 + 3.00" */}
                  {item.kwp_list && <><span className="text-gray-300 mx-1.5">·</span>ขนาด <b className="text-gray-900">{item.kwp_list}</b> kW</>}
                  <span className="text-gray-300 mx-1.5">·</span>
                  สิทธิ์คงเหลือ <b className="text-gray-900">{Math.max(0, item.balance)}</b> ครั้ง
                  <span className="text-gray-300 mx-1.5">·</span>
                  {item.last_wash
                    ? <>ล้างล่าสุด <b className="text-gray-900">{thD(item.last_wash)}</b></>
                    : <span className="font-semibold text-amber-600">ยังไม่เคยล้าง</span>}
                  {item.booking_id && <><span className="text-gray-300 mx-1.5">·</span>ใบงานเลขที่ {item.booking_id}</>}
                  {/* ★ 1 ต.ค. 69 เลิกใช้ทีม A/B/C (แผน 20261001-01 เฟส 4) — เอาชื่อทีม / "⚠ ยังไม่จ่ายทีม" ออกจากหัว */}
                </span>
              </div>
            </div>
            <NotificationBell />
            {/* ★ 15 ต.ค. 69 ผู้ใช้สั่งเอาช่อง "เจ้าของงาน" (ปุ่มเลือกคนแบบฝั่งขาย) ออกจากหัวหน้างานบริการ
                เดิม (เฟส 4) ใช้ตั้งเจ้าของเคสให้ "งานของฉัน" / เตือนก่อนวันนัด — ข้อมูล owner_user_id เดิมยังอยู่ในฐาน */}
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
          {/* ★ แท็บยกจากหน้า lead ทั้งก้อน (คลาสปุ่ม · ไอคอน · มือถือโชว์ชื่อแค่แท็บที่เลือก) — แผน 20260928-04 ข้อ 6
              ปุ่ม Note ชิดขวาของแถบแท็บแบบ Follow-up/Note ของหน้า lead (ข้อ 7) */}
          <div className="flex-1 flex px-5 gap-1 min-w-0 overflow-x-auto scrollbar-hide">
            {([
              ["workflow", "Workflow", "M3.75 6h16.5M3.75 12h16.5m-16.5 6h16.5"],
              ["info", "House Info", "M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"],
              // ★ แผน 20261021-03: ชื่อเดียวกับหน้า lead — จอกว้าง "Equipment - Serial" · มือถือ "Equipment"
              ["equipment", "Equipment - Serial", "M3.75 7.5l16.5-4.125M12 6.75c-2.708 0-5.363.224-7.948.655C2.999 7.58 2.25 8.507 2.25 9.574v9.176A2.25 2.25 0 004.5 21h15a2.25 2.25 0 002.25-2.25V9.574c0-1.067-.75-1.994-1.802-2.169A48.329 48.329 0 0012 6.75zM7.5 12.75a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm6.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm3 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z", "Equipment"],
              ["photos", "Photos", "M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"],
              // ★ แผน 20260928-05 — ไอคอนเดียวกับแท็บ Timeline ของหน้า lead
              ["timeline", "Timeline", "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25"],
            ] as [typeof tab, string, string, string?][]).map(([k, t, d, short]) => (
              <button key={k} type="button" onClick={() => setTab(k)} title={t}
                className={`py-3 text-xs font-semibold uppercase tracking-wider border-b-2 -mb-px transition-colors inline-flex items-center gap-1.5 shrink-0 cursor-pointer ${tab === k ? "px-4 text-active border-active" : "px-3 md:px-4 text-gray-500 border-transparent hover:text-gray-700"}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={d} />
                </svg>
                <span className={tab === k ? "" : "hidden md:inline"}>
                  {short ? <><span className="md:hidden">{short}</span><span className="hidden md:inline">{t}</span></> : t}
                </span>
              </button>
            ))}
            {/* มือถือย้ายไปแถบล่างติดจอ (แผน 20260929-03) — เดิมโดนตัดขอบขวาของแถบแท็บ · Account ไม่มี (อ่านอย่างเดียว) */}
            {!viewOnly && <div className="max-md:hidden ml-auto flex items-center gap-2 pb-2 self-end pl-2 shrink-0">
              {/* Follow-up = บันทึกติดต่อไม่ได้ (1 ต.ค. 69) — คู่กับ Note แบบหน้า lead ทั้งคลาสและไอคอน */}
              <button type="button" onClick={() => setFollowOpen(true)} title="บันทึกการติดตาม — ยังไม่ได้ข้อสรุป / ติดต่อไม่ได้"
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-amber-50 text-amber-700 text-sm font-semibold border border-amber-200 hover:bg-amber-100 transition-colors cursor-pointer" style={{ minHeight: 0 }}>
                <ClockIcon className="w-4 h-4" strokeWidth={2} />
                Follow-up
              </button>
              <button type="button" onClick={() => { setNoteErr(""); setNoteOpen(true); }} title="บันทึกหมายเหตุลง Activity Log"
                className="flex items-center gap-1.5 px-3 h-8 rounded-lg bg-gray-100 text-gray-700 text-sm font-semibold border border-gray-200 hover:bg-gray-200 transition-colors cursor-pointer" style={{ minHeight: 0 }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
                <span className="max-md:hidden">Note</span>
              </button>
            </div>}
          </div>
          <div className="hidden md:flex w-80 border-l border-gray-200 px-4 items-center py-3 text-xs font-semibold uppercase tracking-wider text-gray-500 gap-1.5">
            <ClockIcon className="w-4 h-4" strokeWidth={2} />
            Activity Log <span className="ml-1 text-gray-400 normal-case">{history.length}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* ราง STEPS — ทึบม่วง = ขั้นที่เปิดดูอยู่ · ขอบม่วง = ขั้นที่งานอยู่จริง · ✓ = ผ่านแล้ว · จาง = ยังไม่ถึง (กดไม่ได้)
            ★ แผน 20260929-03 ข้อ 4: ซ่อนบนมือถือแบบหน้า lead — เดิมกิน 80px การ์ดแคบจนชื่อขั้นตกบรรทัด
              มือถือเรียงการ์ดทุกขั้นต่อกันแทน (cardWrap) · desktop ยังเปิดทีละการ์ดจากราง */}
        <aside className="hidden md:flex w-20 border-r border-gray-200 bg-gray-50/40 flex-col py-3 px-1.5 gap-1.5 shrink-0 overflow-y-auto">
          {FLOW.map((f, i) => {
            const st = stepState(i);
            const locked = st === "locked";
            const cls = i === step
              ? "bg-active text-white"
              : st === "active"
              ? "bg-white text-active border-2 border-active hover:bg-active/5"
              : st === "done"
              ? "bg-white text-gray-700 border border-gray-200 hover:border-active hover:text-active"
              : st === "skipped"
              ? "bg-white text-gray-300 border border-dashed border-gray-200 hover:text-gray-500"
              // ★ ยังไม่ถึง — คลาสเดียวกับรางหน้า lead (แผน 20260929-02) เดิมกดเข้าไปกรอก/กดปุ่มได้ทุกขั้น
              : "text-gray-300 cursor-not-allowed";
            return (
              <button key={f.k} type="button" disabled={locked} onClick={() => go(i)}
                title={locked ? `${f.t} — ยังไม่ถึงขั้นนี้` : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 rounded-lg transition-colors ${locked ? "" : "cursor-pointer"} ${cls}`}>
                <span className="text-xxs font-bold tabular-nums leading-none">{String(i + 1).padStart(2, "0")}</span>
                <span className="text-[10px] font-semibold leading-tight text-center px-1">{f.t}</span>
                {st === "done" && <CheckIcon className={`w-3 h-3 ${i === step ? "text-white" : "text-emerald-500"}`} strokeWidth={3} />}
                {/* ★ 23 ต.ค. 69 ผู้ใช้สั่งเอาคำว่า "ข้าม" ใต้ชื่อขั้นออก — ขั้นที่ข้ามยังเป็นกรอบเส้นประจาง */}
              </button>
            );
          })}
        </aside>

        <div className="flex-1 overflow-y-auto pb-20 md:pb-4 min-w-0" style={{ overscrollBehaviorY: "contain" }}>
          {/* pt-3 = ระยะเดียวกับ py-3 ของราง STEPS ให้ขอบบนเริ่มเท่ากัน */}
          <div className="px-4 pb-4 pt-3 space-y-3">
            {err && <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-2 text-sm text-red-700">{err}</div>}

            {/* แท็บอื่นนอกจาก Workflow — แสดงอย่างเดียว แก้ที่ modal หน้าบ้าน (ปุ่ม "แก้ไขข้อมูลบ้าน")
                ยกเว้น Serial อุปกรณ์ในแท็บ Equipment - Serial (แผน 20261021-03) แก้ได้ที่แท็บ · แก้แล้วโหลด Activity Log ใหม่ */}
            {tab === "info" && <HouseInfoTab houseId={item.house_id} />}
            {tab === "equipment" && <HouseEquipmentTab houseId={item.house_id} bookingId={item.booking_id}
              readOnly={viewOnly} onChange={onReload} />}
            {tab === "photos" && <JobPhotosTab bookingIds={bookingIds} />}
            {tab === "timeline" && <JobTimelineTab bookings={bookings} history={history} teams={teams} />}

            {tab === "workflow" && <>
            {/* ใบงานซ่อม (เฟส 5) — บอกที่มา ประกัน และอาการไว้บนสุด เห็นได้ทุกขั้น
                ยกเลิกได้ก่อนมีใบเสนอราคา (ลูกค้าไม่ซ่อม) — O&M ยังไม่มีปุ่มยกเลิกใบงานที่อื่นเลย */}
            {isRepairJob && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${item.in_warranty ? "bg-emerald-50 border-emerald-200" : "bg-pink-50 border-pink-200"}`}>
                <div className="flex items-center gap-2 flex-wrap">
                  <b className="text-gray-900">ใบงานซ่อม</b>
                  <span className="text-gray-500">มาจากใบงานเลขที่ {item.parent_booking_id}</span>
                  <span className={`text-xxs font-bold px-2 py-0.5 rounded-full text-white ${item.in_warranty ? "bg-emerald-600" : "bg-pink-600"}`}>
                    {item.in_warranty ? "ในประกัน — ไม่มีค่าบริการ" : "นอกประกัน — เสนอราคาก่อนนัด"}
                  </span>
                  {canDecline && !cancelOpen && (
                    <button type="button" onClick={() => setCancelOpen(true)} style={{ minHeight: 0 }}
                      className="ml-auto text-xs font-semibold text-red-600 hover:underline cursor-pointer">ยกเลิกใบงานซ่อม</button>
                  )}
                </div>
                {item.job_note && <div className="mt-1.5 text-gray-700 whitespace-pre-line">อาการ: {item.job_note}</div>}
                {canDecline && cancelOpen && cancelForm}
              </div>
            )}

            <StepCard n={0} className={cardWrap(0)} state={stepState(0)} title="ติดตาม — บันทึกการโทร" doneTitle="ติดตามแล้ว" onHeaderClick={() => toggleDone(0)}>
              {stepState(0) === "done"
                ? doneView(0,
                    <DoneHead text={(() => {
                      const calls = rowsOf("follow").filter((r) => r.action === "call");
                      const last = calls.reduce<Row | null>((a, r) => (!a || r.at >= a.at ? r : a), null);
                      return last
                        ? `โทร ${calls.length} ครั้ง · ล่าสุด ${CALL_OUTCOME[last.outcome ?? ""]?.t ?? last.outcome ?? "-"} · ${thD(last.at)}`
                        : "ไม่มีบันทึกการโทรของใบงานนี้";
                    })()} />,
                    () => events("follow", "gray", "การโทร · เปิดใบงาน"))
                : viewOnly ? waitNote("รอทีม O&M โทรติดตามลูกค้า")
                // ★ 23 ต.ค. 69 ถอดการ์ด 01 แบบล็อกระหว่างเลือกวัน (21 ต.ค.) — ยืนยันรับบริการบันทึกทันที การ์ดนี้ปิดขั้นเอง
                : callForm("follow")}
            </StepCard>

            {/* ★ ขั้น 02–03 เป็นของงานเสียเงิน (แผน 20260924-02)
                เฟส 2: ออก/แก้ใบเสนอราคาได้แล้ว (OmQuotationPanel) · ส่งอนุมัติเฟส 3 · รับเงินเฟส 4 */}
            {/* ★ ปิดขั้นแล้ว: แผงใบเสนอราคา/ชำระเงินไม่มีปุ่มแก้อยู่แล้ว (แก้/ส่งอนุมัติเฉพาะใบร่าง · ส่งลูกค้าเฉพาะขั้นเสนอราคา
                · ฟอร์มแนบสลิปเฉพาะยังไม่มีสลิป) ⇒ กางดูได้ทั้งแผง · ออกใบของงานถัดไปยังกดได้ (ไม่ได้แก้ใบงานนี้) */}
            <StepCard n={1} className={cardWrap(1)} state={stepState(1)} title="เสนอราคา" doneTitle="เสนอราคาแล้ว" onHeaderClick={() => toggleDone(1)}>
              {stepState(1) === "done"
                ? doneView(1,
                    <DoneHead text={item.q_doc_no
                      ? `${item.q_doc_no} · ${QUOTE_STATUS[item.q_status ?? ""]?.t ?? item.q_status ?? "-"} · ${formatTHB(Number(item.q_total ?? 0))} บาท`
                      : "ไม่มีใบเสนอราคา"}>
                      {item.q_id && <DocButton label="ใบเสนอราคา" onClick={() => openQuotationPdf(item.q_id!)} />}
                    </DoneHead>,
                    () => (
                      <DoneSection color="rose" title="ใบเสนอราคา">
                        <OmQuotationPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} />
                      </DoneSection>
                    ))
                // ★ 2 ต.ค. 69 ผู้ใช้สั่งเอาแถบ "ลูกค้าไม่เอา — ยกเลิกงานนี้" ออกจากขั้นนี้ (แผน 20261002-09) · ขั้น 03 เอาออกด้วยแล้ว
                : <div className={SECTION}>
                    <OmQuotationPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} />
                  </div>}
            </StepCard>

            {/* เฟส 4: แนบสลิป → Account ยืนยันในคิวเดิม → เติมสิทธิ์ที่ซื้อ → โทรนัดได้ (ที่การ์ดนัดหมาย · แผน 20260929-02) */}
            <StepCard n={2} className={cardWrap(2)} state={stepState(2)} title="ชำระเงิน" doneTitle="ชำระเงินแล้ว" onHeaderClick={() => toggleDone(2)}>
              {stepState(2) === "done"
                ? doneView(2,
                    // ★ 15 ต.ค. 69 ผู้ใช้สั่งย้ายใบเสร็จขึ้นบรรทัดสรุปแบบขั้นอื่น (เดิมอยู่ในกล่องสถานะเงินข้างใน)
                    <DoneHead text={`${item.pay_state === "paid" ? "ชำระแล้ว" : "ชำระเงิน"} ${formatTHB(Number(item.q_total ?? 0))} บาท${item.q_doc_no ? ` · ตามใบเสนอราคา ${item.q_doc_no}` : ""}`}>
                      {item.q_id && <OmReceiptHead item={item} />}
                    </DoneHead>,
                    () => (
                      <DoneSection color="indigo" title="ชำระเงิน">
                        <OmPaymentPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} receiptInHeader />
                      </DoneSection>
                    ))
                // ★ แผน 20261002-10: ขั้นที่กำลังทำ = ขั้นย่อยแบบ Order ฝั่งขาย วางบนพื้นการ์ดตรง ๆ (ไม่ห่อ SECTION แบบ OrderStep)
                //   2 ต.ค. 69 ผู้ใช้สั่งเอาแถบ "ลูกค้าไม่เอา — ยกเลิกงานนี้" ออก (ขั้น 02 ออกไปก่อนแล้ว)
                : cur === "payment"
                  ? <OmPaymentPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} steps />
                  : <div className={SECTION}>
                      <OmPaymentPanel item={item} skip={skip} onSaved={onSaved} onReload={onReload} />
                    </div>}
            </StepCard>

            {/* ★ นัดหมาย = รวมขั้น "ทำนัด" กับ "รอ O&M" เดิม (ขั้นย่อย 2410 รอยืนยันนัด · 2420 นัดแล้ว)
                ปุ่มโผล่เฉพาะสถานะที่กดได้จริง — เดิมโผล่ตลอด กดผิดสถานะแล้วค่อยโดน API ปฏิเสธ */}
            <StepCard n={3} className={cardWrap(3)} state={stepState(3)} doneTitle="นัดหมายแล้ว" onHeaderClick={() => toggleDone(3)}
              title={resched && canResched ? "นัดหมาย — เลื่อนนัด" : "นัดหมาย — เลือกวันนัด"}>
              {/* ★ แผน 20261023-01 รอบ 5: กดแท็บย่อย Reschedule ที่ขั้น 05 → การ์ดนี้เปิดปฏิทินเลื่อนนัด (ยกเลิก/เลื่อนแล้วกลับขั้น 05) */}
              {resched && canResched && !viewOnly ? reschedBlock
              : stepState(3) === "done" ? doneView(3,
                <DoneHead text={`นัด ${thAppt(item.scheduled_at, item.time_slot)}`} />,
                () => events("appoint", "blue", "นัดหมาย · ทีมช่าง"),
              ) : paidWaiting ? (
                // ★ ชำระเงินครบแล้ว — โทรตกลงวันนัดที่นี่ แบบขั้นย่อย "นัด" ของ Install ฝั่งขาย (แผน 20260929-02)
                //   เดิมให้ย้อนไปบันทึกการโทรที่ขั้น 01 ซึ่งตอนนี้ปิดขั้นแล้วเป็นอ่านอย่างเดียว
                <div className="space-y-3">
                  <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg border bg-emerald-50 border-emerald-600/15 text-sm text-emerald-900">
                    <CheckIcon className="w-4 h-4 shrink-0 text-emerald-600" strokeWidth={2.5} />
                    <span className="min-w-0">ชำระค่าบริการแล้ว{item.q_doc_no && <> ตามใบเสนอราคา <b className="font-mono">{item.q_doc_no}</b></>} — โทรตกลงวันนัดกับลูกค้า</span>
                  </div>
                  {viewOnly ? waitNote("รอฝ่ายขายโทรตกลงวันนัดกับลูกค้า") : callForm("paid")}
                </div>
              ) : pendingNoDate ? (
                // ★ 23 ต.ค. 69 ตกลงรับบริการแล้ว (บันทึกที่ขั้น 01) แต่ยังไม่มีวัน — เลือกวันนัดที่นี่
                //   ผู้ใช้สั่งเอากล่อง "ลูกค้าตกลงรับบริการ · งานนี้ไม่ต้องชำระเงิน — เลือกวันนัดกับลูกค้า" ออก (การ์ดขึ้นปฏิทินเลย)
                viewOnly ? waitNote("รอโทรตกลงวันนัดกับลูกค้า") : callForm("free")
              ) : null}
            </StepCard>

            {/* ★ 28 ก.ย. 69 ตัดขั้น "รอปิด" — เข้างานเป็นขั้นสุดท้ายก่อนปิด: กรอกใบ + ลูกค้าเซ็น → กดปิดงานท้ายใบจบเลย
                ★ 22 ต.ค. 69 ชื่อขั้น เข้างาน → ปฏิบัติงาน (ตาม FLOW)
                ★ 23 ต.ค. 69 ผู้ใช้สั่งเอาคำอธิบาย "— ช่างกรอกใบตรวจ · ลูกค้าเซ็นรับ" ออก เหลือชื่อขั้น */}
            <StepCard n={4} className={cardWrap(4)} state={stepState(4)} doneTitle="ปฏิบัติงานเสร็จ" onHeaderClick={() => toggleDone(4)}
              title="ปฏิบัติงาน">
              {stepState(4) === "done" && item.booking_id ? doneView(4,
                <DoneHead text={<>
                  {report?.result === "pass" ? "ผลตรวจ ผ่าน" : report?.result === "fail" ? "ผลตรวจ ไม่ผ่าน" : "ตรวจงานเสร็จ"}
                  {/* เลขใบห้ามตัดกลางขีด (มือถือเคยขึ้น "OM-" / "6909-0099") */}
                  {report?.job_no && <> · ใบบริการ <span className="whitespace-nowrap">{report.job_no}</span></>}
                </>}>
                  <ServiceDocButton bookingId={item.booking_id} />
                </DoneHead>,
                // ★ 15 ต.ค. 69 ผู้ใช้สั่งสรุปหน้าเดียวเหมือนขั้นอื่น (แผน 20261015-01) — เดิมเป็นใบตรวจตัวเต็ม 3 แท็บย่อยแบบอ่านอย่างเดียว
                () => <JobReportSummary bookingId={item.booking_id!}
                  startedAt={rowsOf("progress").find((r) => r.action === "start")?.at ?? null} />,
              ) : item.booking_id && viewOnly ? (
                // Account อ่านอย่างเดียว — ใบตรวจ/เลื่อนนัด เป็นงานทีมช่าง (แผน 20261014-06)
                waitNote(apptSet
                  ? <>นัด <b>{thAppt(item.scheduled_at, item.time_slot)}</b> — รอทีมช่างเข้าปฏิบัติงาน</>
                  : "ทีมช่างกำลังทำงาน — รอปิดงาน")
              ) : item.booking_id ? (
                // ★ เฟส 3: ใบตรวจรับงานฝังมาเลย ไม่ต้องเด้งออกไปหน้าอื่นแล้ว
                //   ใบเดียวกับ /om/field/[id] เป๊ะ (components/om/JobFormPanel) แก้ที่เดียวได้ทั้งสองที่
                // ★ 28 ก.ย. 69 (แผน 20260928-03): วางตรงในการ์ดแบบ InstallChecklist ในการ์ด Install — ไม่ห่อ SECTION ซ้อน
                //   ใบมีแถบขั้นย่อย (ตรวจ / รูป · บันทึก / ส่งมอบ) ของตัวเอง · wrapClass ว่าง = ไม่สร้าง scroll ซ้อน
                // ★ แผน 20261023-01 รอบ 5: ยืนยันนัดหมายแล้วมาขั้นนี้ทันที (ไม่มีปุ่มช่างถึงหน้างาน)
                //   รอบ 7: แท็บย่อยแรก "วันนัด" = วันนัด + ปุ่ม Reschedule → กลับไปเลื่อนนัดที่การ์ดขั้น 04
                //   ใบที่ช่างยังไม่เริ่มเปิดมาที่แท็บวันนัดก่อน · ช่างเริ่มกรอกใบ → กำลังปฏิบัติงาน (onStarted โหลดข้อมูลบ้านใหม่)
                <JobFormPanel jobId={String(item.booking_id)} wrapClass="" embedded
                  onClosed={() => { onSaved("ปิดงานเรียบร้อย"); onDone(); }}
                  apptTab={apptTab} apptFirst={apptSet}
                  onStarted={onReload}
                  // ★ 15 ต.ค. 69 ผู้ใช้สั่งเอาบรรทัดคำอธิบาย "กรอกใบตรวจ ให้ลูกค้าเซ็นรับ … · ตัดสิทธิ์ … · เปิดเต็มจอ ›" ออก
                  //   เหลือแค่ป้ายของใบเก่าที่ค้างสถานะรอปิด (ก่อนตัดขั้น) — บอกให้ปิดต่อจากใบนี้ได้เลย
                  intro={cur === "checked" ? (
                    <div className="mb-3 text-xs text-teal-700 font-semibold">ช่างทำงานเสร็จแล้ว รอปิดงาน — ปิดต่อได้ที่ขั้นส่งมอบ</div>
                  ) : undefined} />
              ) : (
                <div className={`${SECTION} text-sm text-gray-500`}>ยังไม่มีใบงาน — ใบตรวจรับงานจะแสดงเมื่อสร้างนัดแล้ว</div>
              )}
            </StepCard>

            {/* ★ ปิดงาน = ขั้นสุดท้าย มีแค่ปิดแล้ว (done) กับยังไม่ถึง (locked · ไม่มีเนื้อใน) — แผน 20260929-02
                บรรทัดสรุป = วันปิด · ตัดสิทธิ์ + ปุ่มใบบริการ (ตำแหน่งเดียวกับปุ่ม "ใบส่งมอบ" ในหัวขั้นติดตั้งที่เสร็จแล้วฝั่งขาย)
                กางดู = เหตุการณ์ปิดงาน + เปิดใบงานซ่อม (งานถัดไป ไม่ได้แก้ใบงานนี้) */}
            <StepCard n={5} className={cardWrap(5)} state={stepState(5)} title="ปิดงาน" doneTitle="ปิดงานแล้ว" onHeaderClick={() => toggleDone(5)}>
              {doneView(5,
                // วันปิด = เวลาปิดในใบตรวจ · ใบเก่าที่ไม่มี (ปิดตอนบันทึกครั้งแรกก่อนแก้ API 29 ก.ย.) ใช้เวลาเหตุการณ์ปิดงาน แบบแท็บ Timeline
                <DoneHead text={<>
                  ปิดงาน{(() => {
                    const at = report?.finished_at ?? rowsOf("closed").find((r) => r.action === "done")?.at ?? null;
                    return at ? ` ${thD(at)}` : "";
                  })()} · {report
                    ? (report.redeemed > 0 ? `หักสิทธิ์ล้าง ${report.redeemed} ครั้ง` : "ไม่หักสิทธิ์")
                    : quotaNote}
                </>}>
                  {item.booking_id && <ServiceDocButton bookingId={item.booking_id} />}
                </DoneHead>,
                () => <>
              {events("closed", "emerald", "ปิดงาน")}

              {/* ใบงานซ่อม (เฟส 5) — ช่างแจ้งในใบตรวจรับงาน ทีม O&M เปิดใบใหม่ต่อจากตรงนี้
                  ★ เปิดได้เฉพาะใบที่ปิดแล้ว (ใบงานนี้คือใบล่าสุดของบ้าน = บ้านไม่มีใบค้าง) · เปิดได้แม้ช่างไม่ได้ติ๊ก */}
              {OM_REPAIR_ENABLED && cur === "closed" && item.booking_id && !item.repair_child_id && !viewOnly && (
                <div className={`rounded-lg border p-3 ${item.repair_needed === 1 && !item.repair_cancel_id ? "bg-amber-50 border-amber-200" : "bg-white/60 border-active/15"}`}>
                  {/* เปิดใบซ่อมแล้วยกเลิก — บอกว่าจบไปแล้วด้วยเหตุผลอะไร · ลูกค้าเปลี่ยนใจเปิดใหม่ได้ */}
                  {item.repair_cancel_id
                    ? !rpOpen && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                        <span>ใบงานซ่อมเลขที่ {item.repair_cancel_id} ถูกยกเลิกแล้ว{item.repair_cancel_reason && <> — เหตุผล: <b>{item.repair_cancel_reason}</b></>}</span>
                        <button type="button" onClick={() => setRpOpen(true)} style={{ minHeight: 0 }}
                          className="text-active font-semibold hover:underline cursor-pointer">เปิดใบงานซ่อมใหม่ ›</button>
                      </div>
                    )
                    : item.repair_needed === 1
                    ? <div className="text-sm font-semibold text-amber-800">⚠ ช่างแจ้งพบงานซ่อม — ยังไม่เปิดใบงานซ่อม</div>
                    : !rpOpen && (
                      <div className="text-sm text-gray-600 flex items-center gap-2 flex-wrap">
                        ช่างไม่ได้แจ้งงานซ่อม
                        <button type="button" onClick={() => setRpOpen(true)} style={{ minHeight: 0 }}
                          className="text-active font-semibold hover:underline cursor-pointer">เปิดใบงานซ่อม ›</button>
                      </div>
                    )}

                  {rpOpen && (
                    <div className="mt-3 space-y-3">
                      <div>
                        <label className={FIELD_LABEL}>อาการ / สิ่งที่ต้องซ่อม <span className="text-red-500">*</span></label>
                        <textarea value={rpDetail} onChange={(e) => setRpDetail(e.target.value)} rows={3} maxLength={1000}
                          placeholder="เช่น อินเวอร์เตอร์ขึ้น error E-21 · สาย DC หลวม"
                          className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:border-active" />
                      </div>
                      <div>
                        <label className={FIELD_LABEL}>ประกันการติดตั้ง <span className="text-red-500">*</span></label>
                        <div className="flex gap-2 flex-wrap">
                          <button type="button" onClick={() => setRpWarranty(true)} className={chipBtn(rpWarranty === true)}>ในประกัน — ไม่มีค่าบริการ</button>
                          <button type="button" onClick={() => setRpWarranty(false)} className={chipBtn(rpWarranty === false)}>นอกประกัน — ต้องเสนอราคา</button>
                        </div>
                        <span className="block mt-1.5 text-xxs text-gray-500">
                          {item.warranty_end
                            ? <>ใบรับประกันฝั่งขาย: ประกันถึง <b>{thD(item.warranty_end)}</b> ({item.warranty_end >= today ? "ยังไม่หมด" : "หมดแล้ว"}) — ระบบเลือกให้ตามนี้ แก้ได้</>
                            : <>ไม่มีวันหมดประกันในระบบ{item.warranty_start && <> · เริ่มประกัน {thD(item.warranty_start)}</>} — ตรวจสอบก่อนเลือก</>}
                        </span>
                      </div>
                      <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-xs leading-relaxed text-gray-600">
                        {rpWarranty === true && <>สร้าง<b>ใบงานซ่อม</b>ที่ขั้น <b>ติดตาม</b> โทรนัดได้ทันทีโดยข้ามขั้นเสนอราคา/ชำระเงิน · ปิดงานแล้ว<b>ไม่หักสิทธิ์ล้าง</b></>}
                        {rpWarranty === false && <>สร้าง<b>ใบงานซ่อม</b>ที่ขั้น <b>เสนอราคา</b> ฝ่ายขายออกใบเสนอราคา ขออนุมัติ และรับชำระเงินก่อนนัดหมาย</>}
                        {rpWarranty === null && <>กรุณาเลือกว่าอยู่ในประกันหรือนอกประกัน</>}
                      </div>
                      <div className="flex md:justify-end">
                        <button type="button" disabled={busy} onClick={openRepair} className={`${PRIMARY_BTN} flex-1 md:flex-none md:w-64`}>
                          {busy ? "กำลังเปิด…" : "เปิดใบงานซ่อม"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
                </>)}
            </StepCard>

            {/* มือถือไม่มีแผง Activity Log ด้านขวา — แสดงประวัติต่อท้ายการ์ดแทน */}
            <div className="md:hidden pt-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <ClockIcon className="w-4 h-4" strokeWidth={2} />
                Activity Log <span className="ml-1 text-gray-400 normal-case">{history.length}</span>
              </div>
              {historyTimeline}
            </div>
            </>}
          </div>
        </div>

        {/* แผงขวา Activity Log (desktop) — เปลือกกลาง ui/Timeline ตัวเดียวกับหน้า lead */}
        <aside className="hidden md:flex w-80 border-l border-gray-200 bg-gray-50/30 flex-col min-h-0 shrink-0">
          <div className="flex-1 overflow-y-auto p-4">{historyTimeline}</div>
        </aside>
      </div>

      {/* ปุ่มล่างติดจอ มือถือเท่านั้น — ยกจาก footer quick actions ของหน้า lead (แผน 20260929-03 ข้อ 4)
          ★ 1 ต.ค. 69 มีปุ่ม Follow-up แล้ว (บันทึกติดต่อไม่ได้) ⇒ สองปุ่มแบบหน้า lead */}
      {!viewOnly && (tab === "info" || tab === "workflow") && (
        <div className="fixed left-0 right-0 md:hidden above-nav bg-white border-t border-gray-100 z-40 px-3 py-2 flex gap-2">
          <button type="button" onClick={() => setFollowOpen(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-amber-50 text-amber-700 text-sm font-semibold active:bg-amber-100 transition-colors cursor-pointer">
            <ClockIcon className="w-4 h-4" strokeWidth={2} />
            Follow-up
          </button>
          <button type="button" onClick={() => { setNoteErr(""); setNoteOpen(true); }}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-gray-100 text-sm font-semibold active:bg-gray-200 transition-colors cursor-pointer">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
            </svg>
            Note
          </button>
        </div>
      )}

      {/* บันทึกการติดตาม (ติดต่อไม่ได้) — บันทึกแล้วอยู่หน้าเดิม โหลดข้อมูลใหม่ แบบปุ่ม Note */}
      {followOpen && (
        <OmFollowupModal houseId={item.house_id} bookingId={item.booking_id} phone={item.phone} rules={rules}
          jobActive={!!item.booking_id && cur !== "follow" && cur !== "closed" && !isExit}
          onClose={() => setFollowOpen(false)}
          onSaved={(m) => { setFollowOpen(false); onSaved(m); if (onReload) onReload(); else onDone(); }} />
      )}

      {profileOpen && item.customer_id && (
        <OmCustomerModal customerId={item.customer_id} canDelete={false} onClose={() => setProfileOpen(false)}
          onChanged={onReload} onToast={onSaved} />
      )}

      {/* บันทึกโน้ต — หน้าตายกจาก AddActivityModal โหมด note ของหน้า lead ทั้งก้อน (แผน 20260928-04 ข้อ 7) */}
      {noteOpen && (
        <ModalBase
          title={
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                </svg>
              </span>
              {/* ★ 21 ต.ค. 69 แผน 20261021-01: ปุ่มเปิดเป็นคำอังกฤษ "Note" (ชุดเดียวกับหน้า lead) — หัวหน้าต่างใช้คำเดียวกับปุ่ม */}
              <span>Note — บันทึกหมายเหตุ</span>
            </div>
          }
          onClose={() => setNoteOpen(false)}
          size="md"
          footer={
            <div className="flex gap-2">
              <button type="button" onClick={() => setNoteOpen(false)}
                className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 bg-white cursor-pointer">
                ยกเลิก
              </button>
              <button type="button" onClick={saveNote} disabled={busy || !noteText.trim()}
                className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-bold disabled:opacity-50 active:scale-[0.98] transition-all cursor-pointer">
                {busy ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          }
        >
          <div className="space-y-2">
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)}
              placeholder="บันทึกหมายเหตุ... (แสดงใน Activity Log ของบ้านนี้)" rows={4} autoFocus maxLength={300}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white focus:outline-none focus:border-primary text-sm resize-none" />
            <div className="text-right text-xxs text-gray-400">{noteText.length}/300</div>
            {noteErr && <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{noteErr}</div>}
          </div>
        </ModalBase>
      )}
    </div>
  );
}

// การ์ดขั้น — หน้าตาเดียวกับ StepCard ของหน้า lead (ไอคอน · STEP nn · O&M · ชื่อขั้น · ป้าย Active/Done)
// ★ 29 ก.ย. 69 (แผน 20260929-02): ครบ 3 สถานะแบบฝั่งขาย
//   ปิดแล้ว = ชื่อเปลี่ยนเป็น "…แล้ว" + ✓ DONE/PAID · กดหัวการ์ดพับ/กางสรุปได้ (onHeaderClick แบบหน้า lead)
//   ยังไม่ถึง (locked) = เส้นประ กดไม่ได้ ไม่มีเนื้อใน · ข้าม (งานใช้สิทธิ์ฟรี) = เส้นประ ยังบอกได้ว่าทำไมข้าม
//   เดิมขั้นที่ยังไม่ถึงแสดงเนื้อในและกดปุ่มได้ทุกขั้น
function StepCard({ n, state, title, doneTitle, onHeaderClick, className = "", children }: {
  n: number; state: StepState; title: string;
  /** คลาสเพิ่มที่กรอบนอก — ใช้ซ่อนการ์ดที่ไม่ได้เลือกบน desktop (มือถือเรียงทุกการ์ด · แผน 20260929-03) */
  className?: string;
  /** ชื่อตอนปิดขั้นแล้ว (แบบ "Survey Done" ของหน้า lead) */
  doneTitle?: string;
  /** กดหัวการ์ดตอนปิดขั้นแล้ว = พับ/กางสรุป */
  onHeaderClick?: () => void;
  children: React.ReactNode;
}) {
  const muted = state === "locked" || state === "skipped";
  const container = state === "active"
    ? "bg-active-light border border-active shadow-sm shadow-active/10 ring-1 ring-active/20"
    : state === "done"
    ? "bg-white border border-gray-300"
    : state === "locked"
    ? "bg-gray-50 border border-dashed border-gray-200 pointer-events-none"
    : "bg-gray-50 border border-dashed border-gray-200";
  const iconBox = state === "active"
    ? "bg-active text-white"
    : state === "done"
    ? "bg-emerald-500 text-white"
    : "bg-white text-gray-300 ring-1 ring-inset ring-gray-200";
  const headerClick = state === "done" ? onHeaderClick : undefined;

  return (
    <div id={`om-step-${n}`} className={`rounded-2xl overflow-hidden transition-all ${container} ${className}`}>
      <div className={`flex items-center gap-3 px-5 py-4 ${headerClick ? "cursor-pointer" : ""}`} onClick={headerClick}>
        <div className={`w-10 h-8 rounded-xl flex items-center justify-center shrink-0 ${iconBox}`}>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
            <path strokeLinecap="round" strokeLinejoin="round" d={STEP_ICON[n]} />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className={`text-xs font-semibold tracking-wider uppercase leading-none ${muted ? "text-gray-300" : "text-gray-400"}`}>
            Step {String(n + 1).padStart(2, "0")} · O&amp;M
          </div>
          <div className={`text-base font-bold leading-tight tracking-tight mt-1 ${state === "locked" ? "text-gray-400" : muted ? "text-gray-500" : "text-gray-900"}`}>
            {state === "done" && doneTitle ? doneTitle : title}
          </div>
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
      {/* ข้าม (งานใช้สิทธิ์ฟรี) บนมือถือเหลือหัวการ์ด — เรียงต่อกันแล้วเนื้อใน "ทำไมข้าม" ดันขั้นถัดไปตกจอ (แผน 20260929-03) */}
      {state !== "locked" && (
        <div className={`px-5 pb-5 pt-3 border-t border-gray-100 ${state === "skipped" ? "max-md:hidden" : ""}`}>{children}</div>
      )}
    </div>
  );
}

// บรรทัดสรุปของขั้นที่ปิดแล้ว (doneHeader ของ StepLayout) — ผังเดียวกับหัวขั้นติดตั้งที่เสร็จแล้วฝั่งขาย
// (มือถือปุ่มเอกสารลงบรรทัดใหม่) · ★ ทั้งแถวของ StepLayout เป็นปุ่มพับ/กาง ⇒ กดปุ่มเอกสารต้องไม่ไปพับการ์ด
function DoneHead({ text, children }: { text: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex-1 min-w-0 flex flex-col md:flex-row md:items-center gap-1.5 md:gap-2">
      <span className="text-sm font-semibold text-emerald-700 md:flex-1 md:truncate">{text}</span>
      {children && <span className="self-start md:self-auto md:mr-4" onClick={(e) => e.stopPropagation()}>{children}</span>}
    </div>
  );
}

// ปุ่มเอกสารในบรรทัดสรุป — คลาสเดียวกับปุ่ม "ใบสำรวจ" / "ใบส่งมอบ" ในหัวขั้นที่เสร็จแล้วฝั่งขาย
function DocButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} style={{ minHeight: 0 }}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-primary/30 bg-primary/5 text-xs font-semibold text-primary hover:bg-primary/10 transition-colors shrink-0 cursor-pointer">
      <DocumentIcon className="w-4 h-4" strokeWidth={2} />
      {label}
    </button>
  );
}
