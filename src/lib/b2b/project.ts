import type { AppRole } from "@/lib/role-permissions";
import { QUOTE_STATUS_LABEL, QUOTE_SUB_OFFSET, type QuoteKind, type QuoteStatus } from "./quotation";
import { EXEC_SUB_LABEL, type B2bMilestone, type B2bPermit } from "./execution";

// โครงการ B2B — ขั้น / ชนิด / สิทธิ์ / ตัวตรวจ body ที่หน้าจอกับ API ใช้ร่วมกัน (ไม่มี mssql ⇒ client import ได้)
// แผน docs/plan/20261015-07-b2b-project-flow.md · journey สาย 3000 (ขาย B2C = 100–1000 · O&M = 2000)

/** ทำงานโครงการ (สร้าง/แก้/เปลี่ยนขั้น) = Solar B2B + admin · Purchase เห็นขั้นจัดซื้อในเฟส 4 */
export const B2B_PROJECT_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];
/** เปิดดูโครงการ = + ผู้ตรวจสอบใบเสนอราคา 3 ชั้น (ต้องเห็นโครงการ/BOQ ที่ตัวเองตรวจ · แก้ไม่ได้)
 *  + บัญชี (เข้าจากหน้ารอยืนยันรับเงิน มายืนยันงวดเงินในหน้าโครงการ แบบหน้าลีด/งานบริการ O&M — เฟส 3) */
export const B2B_PROJECT_VIEW_ROLES = ["b2b", "b2b_review1", "b2b_review2", "b2b_review3", "account", "admin"] as const satisfies readonly AppRole[];
/** เห็นงวดเงิน/หลักฐาน = คนที่เปิดหน้าโครงการได้ */
export const B2B_INSTALLMENT_VIEW_ROLES = B2B_PROJECT_VIEW_ROLES;

export const B2B_STAGE = {
  lead: 3100,       // โอกาสขาย
  estimate: 3200,   // ราคาประมาณการ (BOQ จาก Google Maps)
  survey: 3300,     // สำรวจหน้างาน
  confirm: 3400,    // ราคายืนยัน / ต่อรอง
  won: 3500,        // ได้งาน (เฟส 3)
  permit: 3600,     // ขออนุญาต + จัดซื้อ (เฟส 4)
  install: 3700,
  gridtie: 3800,
  handover: 3900,
  closed: 3950,     // ปิดโครงการ
  lost: 3980,       // แพ้งาน
  cancelled: 3990,  // ยกเลิก
} as const;

/** ขั้นบนรางซ้าย / การ์ดขั้น — ลำดับเดียวกับเลข */
export const B2B_FLOW = [
  { step: 3100, label: "โอกาสขาย", short: "โอกาส" },
  { step: 3200, label: "ราคาประมาณการ", short: "ประมาณการ" },
  { step: 3300, label: "สำรวจหน้างาน", short: "สำรวจ" },
  { step: 3400, label: "ราคายืนยัน / ต่อรอง", short: "ราคายืนยัน" },
  { step: 3500, label: "ได้งาน", short: "ได้งาน" },
  { step: 3600, label: "ขออนุญาต + จัดซื้อ", short: "อนุญาต/ซื้อ" },
  { step: 3700, label: "ติดตั้ง", short: "ติดตั้ง" },
  { step: 3800, label: "ขนานไฟ", short: "ขนานไฟ" },
  { step: 3900, label: "ส่งมอบ", short: "ส่งมอบ" },
] as const;

export const B2B_OPEN_STAGES = B2B_FLOW.map((s) => s.step);
/** กลุ่มขั้นของหน้ารายการ (?stage=) — การ์ด "ขาย B2B" = sales · การ์ด "โครงการ B2B" = exec (แยกการ์ดแบบ B2C · 15 ต.ค.) */
export const B2B_STAGE_GROUPS: Record<string, readonly number[]> = {
  open: B2B_OPEN_STAGES,
  sales: [3100, 3200, 3300, 3400, 3500],
  exec: [3600, 3700, 3800, 3900],
  closed: [3950],
  lost: [3980, 3990],
};
export const stageGroupOf = (key: string) => (Object.hasOwn(B2B_STAGE_GROUPS, key) ? B2B_STAGE_GROUPS[key] : null);
/** ปุ่มกลับจากหน้าโครงการ → รายการของการ์ดที่โครงการอยู่ตอนนี้ */
export function listHrefOf(stage: number): string {
  const g = Object.keys(B2B_STAGE_GROUPS).find((k) => k !== "open" && B2B_STAGE_GROUPS[k].includes(stage));
  return `/b2b/projects?stage=${g ?? "sales"}`;
}
/** ปุ่ม "ย้ายขั้น" เดินได้ถึงขั้นนี้ — ได้งาน (3500) ผ่านปุ่มได้งานเท่านั้น (เลือกใบที่ส่งลูกค้าแล้ว) · 3600 ขึ้นไปขยับเองตามงวดเงิน/milestone */
export const B2B_MAX_MOVABLE_STAGE = B2B_STAGE.confirm;
/** ขั้นที่กด "แพ้งาน" ได้ — หลังได้งานแล้วใช้ "ยกเลิก" */
export const B2B_LOSABLE_MAX_STAGE = B2B_STAGE.confirm;

/** ขั้นย่อยของสำรวจ (คิดจากวันนัดตอนอ่าน — ไม่มีคอลัมน์) · ไม่มีวันนัด = ไม่มีขั้นย่อย (รอนัดวัน) */
export const B2B_SURVEY_SUB = { scheduled: 3310, due: 3320 } as const;

const CLOSED_LABEL: Record<number, string> = { 3950: "ปิดโครงการ", 3980: "แพ้งาน", 3990: "ยกเลิก" };

export function stageLabel(stage: number): string {
  return B2B_FLOW.find((s) => s.step === stage)?.label ?? CLOSED_LABEL[stage] ?? String(stage);
}

/** ป้ายขั้นย่อย (null = ไม่มี) */
export function subLabel(stage: number, sub: number | null, surveyDate: string | null): string | null {
  // ราคาประมาณการ/ยืนยัน: หลักสิบ = สถานะใบเสนอราคาที่ขยับล่าสุด
  if ((stage === B2B_STAGE.estimate || stage === B2B_STAGE.confirm) && sub != null) {
    const st = (Object.keys(QUOTE_SUB_OFFSET) as QuoteStatus[]).find((k) => stage + QUOTE_SUB_OFFSET[k] === sub);
    return st ? QUOTE_STATUS_LABEL[st] : null;
  }
  if (stage >= B2B_STAGE.permit && stage <= B2B_STAGE.handover) return sub != null ? EXEC_SUB_LABEL[sub] ?? null : null;
  if (stage === B2B_STAGE.won) {
    if (sub === B2B_WON_SUB.unsigned) return "รอเซ็นสัญญา/PO";
    if (sub === B2B_WON_SUB.awaiting_pay) return "รอรับเงินงวด 1";
    if (sub === B2B_WON_SUB.verifying) return "รอบัญชียืนยันงวด 1";
    return null;
  }
  if (stage !== B2B_STAGE.survey) return null;
  if (sub === B2B_SURVEY_SUB.scheduled) return "นัดสำรวจแล้ว";
  if (sub === B2B_SURVEY_SUB.due) return "ถึงวันสำรวจ · รอบันทึกผล";
  return surveyDate ? null : "รอนัดวัน";
}

/** สีป้ายขั้น — เปิดอยู่ = ม่วง (สี active ของแอป) · ปิด/แพ้/ยกเลิก แยกสี */
export function stageTone(stage: number): string {
  if (stage === B2B_STAGE.closed) return "bg-emerald-50 text-emerald-700";
  if (stage === B2B_STAGE.lost) return "bg-red-50 text-red-600";
  if (stage === B2B_STAGE.cancelled) return "bg-gray-100 text-gray-500";
  return "bg-active-light text-active-dark";
}

export const isClosedStage = (stage: number) => stage >= B2B_STAGE.closed;

export type B2bCustomer = { id: number; name: string; tax_id: string | null; branch: string | null; address: string | null };

export type B2bUserOption = { id: number; full_name: string };

/** BOQ ของโครงการ 1 ตัวเลือก = Rev ล่าสุดของเลขที่นั้น */
export type B2bProjectBoq = {
  id: number; doc_no: string; revision: number; option_label: string | null;
  capacity_wp: number | null; total_cost: number | null; total_sale: number | null; margin_pct: number;
  pending_lines: number; updated_at: string; updated_by_name: string | null;
};

/** ใบเสนอราคาในโครงการ = Rev ล่าสุดของแต่ละเลขที่ */
export type B2bProjectQuote = {
  id: number; doc_no: string; revision: number; kind: QuoteKind; status: QuoteStatus;
  subtotal: number; total: number; updated_at: string; issue_date: string | null; validity_days: number | null;
  boq_doc_no: string; boq_revision: number; option_label: string | null;
};

/** งวดเงินของโครงการ (คัดลอกจากใบที่ได้งาน) — เฟส 3 */
export type InstallmentStatus = "pending" | "due" | "submitted" | "paid";
export const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  pending: "ยังไม่ถึง", due: "ถึงกำหนดวางบิล", submitted: "รอบัญชียืนยัน", paid: "รับเงินแล้ว",
};
export const INSTALLMENT_STATUS_TONE: Record<InstallmentStatus, string> = {
  pending: "bg-gray-100 text-gray-500", due: "bg-amber-50 text-amber-700", submitted: "bg-blue-50 text-blue-700", paid: "bg-emerald-50 text-emerald-700",
};
/** เหตุการณ์หน้างานที่ทำให้งวดถึงกำหนด — milestone เฟส 4 (ตอนนี้กด "ถึงกำหนด" เองได้) */
export const INSTALLMENT_TRIGGER_LABEL: Record<string, string> = {
  contract: "ลงนามสัญญา", panels_delivered: "แผงส่งครบ", install_done: "ติดตั้งเสร็จ", handover: "ส่งมอบงาน",
};
export type B2bInstallment = {
  id: number; no: number; pct: number; condition: string; trigger_key: string | null;
  amount: number; vat: number; total: number; status: InstallmentStatus; due_at: string | null;
  received_date: string | null; evidence_name: string | null; has_evidence: boolean; submit_note: string | null;
  submitted_at: string | null; submitted_by_name: string | null; confirmed_at: string | null; confirmed_by_name: string | null;
  reject_note: string | null; rejected_at: string | null;
};
/** ขั้นย่อยของได้งาน (3500) — คิดตอนอ่านจากสัญญา + งวด 1 */
export const B2B_WON_SUB = { unsigned: 3510, awaiting_pay: 3520, verifying: 3530 } as const;

export type B2bActivity = {
  id: number; kind: string; from_stage: number | null; to_stage: number | null; message: string | null;
  created_at: string; created_by_name: string | null;
};

export type B2bProjectRow = {
  id: number; code: string; name: string; customer_id: number; customer_name: string; location: string | null;
  stage: number; sub: number | null; survey_date: string | null; close_reason: string | null;
  owner_id: number | null; owner_name: string | null;
  boq_count: number; boq_capacity_wp: number | null; boq_total_sale: number | null;
  updated_at: string;
};

export type B2bProject = B2bProjectRow & {
  customer: B2bCustomer;
  contact_name: string | null; contact_phone: string | null; contact_email: string | null;
  latitude: number | null; longitude: number | null;
  stage_before_close: number | null; closed_at: string | null;
  surveyor_id: number | null; surveyor_name: string | null; survey_note: string | null; survey_done_at: string | null;
  note: string | null;
  created_at: string; created_by_name: string | null; updated_by_name: string | null;
  boqs: B2bProjectBoq[];
  quotes: B2bProjectQuote[];
  // สัญญา (เฟส 3) — null จนกว่าจะได้งาน
  won_quote_id: number | null; won_boq_id: number | null; contract_no: string | null; contract_date: string | null;
  contract_value: number | null; contract_vat_pct: number | null; won_at: string | null;
  om_years: number | null; om_visits_per_year: number | null;
  installments: B2bInstallment[];
  // ดำเนินโครงการ (เฟส 4)
  milestones: B2bMilestone[];
  permits: B2bPermit[];
  activities: B2bActivity[];
};

const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const numOrNull = (v: unknown) => (v === "" || v == null ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);
const idOrNull = (v: unknown) => (Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null);

export type ProjectFields = {
  name: string;
  /** เลือกบริษัทเดิม (id) หรือพิมพ์บริษัทใหม่ */
  customer: { id: number } | { id: null; name: string; tax_id: string | null; branch: string | null; address: string | null };
  contact_name: string | null; contact_phone: string | null; contact_email: string | null;
  location: string | null; latitude: number | null; longitude: number | null;
  owner_id: number | null; note: string | null;
};

/** ตรวจข้อมูลโครงการ (POST สร้าง / PATCH แก้) */
export function readProjectBody(b: Record<string, unknown>): { value: ProjectFields } | { error: string } {
  const name = text(b.name, 300);
  if (!name) return { error: "กรุณาระบุชื่อโครงการ" };
  const c = (b.customer ?? {}) as Record<string, unknown>;
  let customer: ProjectFields["customer"];
  const cid = idOrNull(c.id);
  if (cid) customer = { id: cid };
  else {
    const cname = text(c.name, 300);
    if (!cname) return { error: "กรุณาเลือกหรือระบุบริษัทลูกค้า" };
    const tax = text(c.tax_id, 20);
    if (tax && !/^\d{13}$/.test(tax.replace(/[\s-]/g, ""))) return { error: "เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข 13 หลัก" };
    customer = { id: null, name: cname, tax_id: tax ? tax.replace(/[\s-]/g, "") : null, branch: text(c.branch, 100), address: text(c.address, 500) };
  }
  const lat = numOrNull(b.latitude); const lng = numOrNull(b.longitude);
  if (Number.isNaN(lat) || (lat != null && Math.abs(lat) > 90)) return { error: "Latitude ไม่ถูกต้อง" };
  if (Number.isNaN(lng) || (lng != null && Math.abs(lng) > 180)) return { error: "Longitude ไม่ถูกต้อง" };
  const email = text(b.contact_email, 150);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "อีเมลผู้ติดต่อไม่ถูกต้อง" };
  return {
    value: {
      name, customer,
      contact_name: text(b.contact_name, 150), contact_phone: text(b.contact_phone, 50), contact_email: email,
      location: text(b.location, 500), latitude: lat, longitude: lng,
      owner_id: idOrNull(b.owner_id), note: text(b.note, 1000),
    },
  };
}

const TH_MONTH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** "2026-10-15" → "15 ต.ค. 2569" — ข้อความ timeline ที่ server เขียน (ไม่มี locale ฝั่ง server ให้พึ่ง) */
export const thaiDateShort = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return y && m && d ? `${d} ${TH_MONTH[m - 1]} ${y + 543}` : iso;
};

/** วันที่ YYYY-MM-DD (ช่อง input type=date) */
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
