import type { AppRole } from "@/lib/role-permissions";

// โครงการ B2B — ขั้น / ชนิด / สิทธิ์ / ตัวตรวจ body ที่หน้าจอกับ API ใช้ร่วมกัน (ไม่มี mssql ⇒ client import ได้)
// แผน docs/plan/20261015-07-b2b-project-flow.md · journey สาย 3000 (ขาย B2C = 100–1000 · O&M = 2000)

/** ทำงานโครงการ = Solar B2B + admin (ผู้ตรวจสอบ 3 ชั้นมาในเฟส 2 · Purchase เห็นขั้นจัดซื้อในเฟส 4) */
export const B2B_PROJECT_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];

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
/** เฟส 1 เดินได้ถึงขั้นนี้ — ได้งาน (3500) ต้องมีใบเสนอราคาที่ส่งลูกค้าแล้ว (เฟส 2–3) */
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

/** วันที่ YYYY-MM-DD (ช่อง input type=date) */
export const isIsoDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
