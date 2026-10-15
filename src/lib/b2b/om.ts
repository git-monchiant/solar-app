// O&M B2B — ขั้น / ชนิด / ตัวช่วยที่หน้าจอกับ API ใช้ร่วมกัน (ไม่มี mssql ⇒ client import ได้)
// แผน docs/plan/20261015-09-b2b-om.md · journey สาย 4000 (โครงการ 3000 · O&M บ้าน 2000)
// เคาะ 15 ต.ค.: Solar B2B ทำเอง (ไม่มี role ใหม่) · ปฏิทินแยกจาก O&M บ้าน · สัญญาสร้างเองตอนปิดโครงการ
//   ตารางเข้างานสร้างล่วงหน้าทั้งสัญญา กระจายเท่ากัน · ข้ามครั้ง = ใช้สิทธิ์แล้ว (ต้องมีเหตุผล) · ล้างแผง + ตรวจระบบทุกครั้ง
import type { AppRole } from "@/lib/role-permissions";

export const B2B_OM_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];

/** ขั้นของครั้งเข้างาน — คิดตอนอ่านจากสถานะ + วันที่ (VISIT_STEP_SQL) · ยังไม่ถึงรอบ = ไม่มีขั้น */
export const B2B_OM_STEP = { due: 4100, scheduled: 4200, onsite: 4300, done: 4500, skipped: 4900 } as const;
export const B2B_OM_STEP_LABEL: Record<number, string> = {
  4100: "ถึงรอบ", 4200: "นัดแล้ว", 4300: "เข้างาน/รอปิด", 4500: "ปิดงาน", 4900: "ข้ามครั้งนี้",
};
export const B2B_OM_STEP_TONE: Record<number, string> = {
  4100: "bg-amber-50 text-amber-700", 4200: "bg-blue-50 text-blue-700", 4300: "bg-violet-50 text-violet-700",
  4500: "bg-emerald-50 text-emerald-700", 4900: "bg-gray-100 text-gray-500",
};
export const visitStepLabel = (step: number | null) => (step == null ? "ยังไม่ถึงรอบ" : B2B_OM_STEP_LABEL[step] ?? String(step));
export const visitStepTone = (step: number | null) => (step == null ? "bg-gray-50 text-gray-400" : B2B_OM_STEP_TONE[step] ?? "bg-gray-100 text-gray-500");

/** แท็บหน้ารายการครั้งเข้างาน (?tab=) */
export const B2B_OM_TABS = ["due", "scheduled", "onsite", "upcoming", "done", "all"] as const;
export type B2bOmTab = (typeof B2B_OM_TABS)[number];
export const isOmTab = (t: unknown): t is B2bOmTab => typeof t === "string" && (B2B_OM_TABS as readonly string[]).includes(t);

export type VisitStatus = "planned" | "scheduled" | "done" | "skipped";
export type VisitFile = { file: string; name: string; mime: string };

export type B2bOmVisit = {
  id: number; contract_id: number; project_id: number; seq_no: number; due_date: string; status: VisitStatus; step: number | null;
  scheduled_date: string | null; days: number | null; lead_user_id: number | null; lead_name: string | null; schedule_note: string | null;
  done_date: string | null; result_note: string | null; files: VisitFile[]; skip_reason: string | null;
  closed_at: string | null; closed_by_name: string | null;
};
/** แถวหน้ารายการ = ครั้งเข้างาน + โครงการ/สัญญาที่อยู่ */
export type B2bOmVisitRow = B2bOmVisit & {
  visits_total: number; project_code: string; project_name: string; customer_name: string; location: string | null;
};

export type B2bOmContract = {
  id: number; project_id: number; seq: number; source: "project" | "renewal";
  start_date: string; end_date: string; years: number; visits_per_year: number; visits_total: number;
  contact_name: string | null; contact_phone: string | null; note: string | null;
  cancelled_at: string | null; cancel_reason: string | null; created_at: string; created_by_name: string | null;
  project_code: string; project_name: string; customer_name: string; location: string | null;
  latitude: number | null; longitude: number | null;
  /** สรุปตอนอ่าน */
  used: number; next_due: string | null; status: "active" | "ended" | "cancelled";
};
export type B2bOmContractDetail = B2bOmContract & {
  visits: B2bOmVisit[];
  activities: { id: number; visit_id: number | null; kind: string; message: string | null; created_at: string; created_by_name: string | null }[];
};

export const CONTRACT_STATUS_LABEL: Record<B2bOmContract["status"], string> = { active: "ใช้งาน", ended: "ครบสัญญา", cancelled: "ยกเลิก" };
export const CONTRACT_STATUS_TONE: Record<B2bOmContract["status"], string> = {
  active: "bg-emerald-50 text-emerald-700", ended: "bg-gray-100 text-gray-500", cancelled: "bg-red-50 text-red-600",
};

/** วัน ISO + n เดือน — วันเกินสิ้นเดือนปัดเป็นวันสุดท้าย (31 ม.ค. + 1 = 28/29 ก.พ.) */
export function addMonthsIso(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(d, last));
  return first.toISOString().slice(0, 10);
}

/** กำหนดครั้งที่ 1..ปี×ครั้งต่อปี กระจายเท่ากันนับจากวันเริ่มสัญญา (ครั้งต่อปี 2 = เดือน 6 · 12 · 18 · 24) */
export function visitDueDates(start: string, years: number, perYear: number): string[] {
  const total = years * perYear;
  return Array.from({ length: total }, (_, i) => addMonthsIso(start, Math.round(((i + 1) * 12) / perYear)));
}

/** เดือนกำหนด เช่น "เม.ย. 2570" (ครั้งที่ยังไม่นัดโชว์เป็นเดือน ไม่ใช่วัน) */
export const thaiMonth = (iso: string | null) =>
  iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`).toLocaleDateString("th-TH", { month: "short", year: "numeric", timeZone: "UTC" }) : "—";

/** วันนี้ (เวลาไทย) ISO */
export const todayThIso = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
