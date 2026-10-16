// ดำเนินโครงการ B2B — milestone หน้างาน + เช็กลิสต์ขออนุญาต (แผน 20261015-07 เฟส 4 · หัวข้อ 5) · ไม่มี mssql ⇒ client import ได้
// ก่อสร้างระดับ milestone (แบบ ก. เคาะ 15 ต.ค.): บันทึกเหตุการณ์หลัก + วันที่ + รูป/ไฟล์ ⇒ ขยับขั้น / ทำให้งวดที่ผูกไว้ถึงกำหนดเอง
// ★ ลำดับ/เงื่อนไขทั้งหมดอยู่ที่ MILESTONES ที่เดียว — API ตรวจ หน้าจอใช้วาดปุ่ม

export type MilestoneKind =
  | "procured" | "materials_arrived" | "panels_delivered" | "install_started" | "install_done"
  | "gridtie_submitted" | "cod" | "handover";

export type MilestoneDef = {
  kind: MilestoneKind;
  label: string;
  /** การ์ดขั้นที่แสดง */
  step: 3600 | 3700 | 3800 | 3900;
  /** ต้องบันทึกตัวนี้ก่อน */
  requires?: MilestoneKind;
  /** บันทึกแล้วโครงการขยับมาขั้นนี้ (ถ้ายังอยู่ขั้นก่อนหน้า) */
  moveTo?: 3700 | 3800 | 3900;
  /** งวดที่ trigger_key ตรงกันถึงกำหนดเอง (ดู installment.ts) */
  trigger?: string;
  /** Purchase บันทึกได้ (นอกจาก Solar B2B / admin) */
  purchase?: boolean;
  hint?: string;
};

export const MILESTONES: MilestoneDef[] = [
  { kind: "procured", label: "สั่งของครบ", step: 3600, purchase: true, hint: "Purchase สั่งวัสดุตามงบ BOQ ครบแล้ว" },
  { kind: "materials_arrived", label: "ของเข้าหน้างาน", step: 3700, moveTo: 3700 },
  { kind: "panels_delivered", label: "แผงส่งครบ 100%", step: 3700, moveTo: 3700, trigger: "panels_delivered" },
  { kind: "install_started", label: "เริ่มติดตั้ง", step: 3700, moveTo: 3700 },
  { kind: "install_done", label: "ติดตั้งเสร็จ 100%", step: 3700, moveTo: 3700, trigger: "install_done" },
  { kind: "gridtie_submitted", label: "ยื่นขนานไฟ", step: 3800, requires: "install_done", moveTo: 3800 },
  { kind: "cod", label: "ได้วันจ่ายไฟ (COD)", step: 3800, requires: "gridtie_submitted" },
  { kind: "handover", label: "ส่งมอบงาน + Training", step: 3900, requires: "cod", moveTo: 3900, trigger: "handover", hint: "เริ่มนับรับประกันงานติดตั้ง" },
];
export const milestoneDef = (k: string) => MILESTONES.find((m) => m.kind === k);
export const isMilestoneKind = (k: unknown): k is MilestoneKind => typeof k === "string" && MILESTONES.some((m) => m.kind === k);

/** บันทึก milestone ได้ตั้งแต่ขั้นขออนุญาต + จัดซื้อ (รับงวด 1 แล้ว) จนก่อนปิดโครงการ */
export const MILESTONE_MIN_STAGE = 3600;

export type MilestoneFile = { file: string; name: string; mime: string };
export type B2bMilestone = {
  id: number; kind: MilestoneKind; done_date: string; note: string | null; files: MilestoneFile[];
  stage_before: number; stage_after: number; created_at: string; created_by_name: string | null;
};

// ── ขออนุญาต (3 อย่างตามหมายเหตุใบ SSE) ──
export type PermitKind = "local_notice" | "utility" | "building";
export type PermitStatus = "pending" | "submitted" | "approved" | "not_required";
/** short = ชื่อย่อในตารางงานคู่ขนาน (ช่องแคบ) · step = คอลัมน์ที่แสดง (ผลการไฟฟ้าใช้ตอนขนานไฟ) */
export const PERMITS: { kind: PermitKind; label: string; short: string; step: 3600 | 3800 }[] = [
  { kind: "local_notice", label: "หนังสือแจ้งความประสงค์ติดตั้งโซลาร์เซลล์ (หน่วยงานท้องถิ่น)", short: "แจ้งท้องถิ่น", step: 3600 },
  { kind: "utility", label: "ผลพิจารณาการเชื่อมต่อระบบไฟฟ้า (กฟน. / กฟภ.)", short: "ผลพิจารณาการไฟฟ้า", step: 3800 },
  { kind: "building", label: "ขออนุญาตดัดแปลงอาคาร (เอกสารโครงสร้าง/สถาปัตย์)", short: "ดัดแปลงอาคาร", step: 3600 },
];
export const PERMIT_STATUS_LABEL: Record<PermitStatus, string> = {
  pending: "ยังไม่ยื่น", submitted: "ยื่นแล้ว รอผล", approved: "ได้แล้ว", not_required: "ไม่ต้องใช้",
};
export const PERMIT_STATUS_TONE: Record<PermitStatus, string> = {
  pending: "bg-gray-100 text-gray-500", submitted: "bg-blue-50 text-blue-700", approved: "bg-emerald-50 text-emerald-700", not_required: "bg-gray-50 text-gray-400",
};
export const isPermitKind = (k: unknown): k is PermitKind => typeof k === "string" && PERMITS.some((p) => p.kind === k);
export const isPermitStatus = (s: unknown): s is PermitStatus => typeof s === "string" && s in PERMIT_STATUS_LABEL;

export type B2bPermit = {
  id: number | null; kind: PermitKind; status: PermitStatus; submitted_date: string | null; approved_date: string | null;
  note: string | null; has_file: boolean; file_label: string | null; updated_at: string | null;
};

/** ขั้นย่อยของขั้นดำเนินโครงการ (คิดตอนอ่านจาก milestone — journey-sql) */
export const B2B_EXEC_SUB = {
  awaiting_procure: 3610, procured: 3620,
  awaiting_materials: 3710, panels_delivered: 3720, installing: 3730, installed: 3740,
  gridtie_submitted: 3810, cod: 3820,
  awaiting_handover: 3910, handed_over: 3920,
} as const;
export const EXEC_SUB_LABEL: Record<number, string> = {
  3610: "รอสั่งของ", 3620: "สั่งของครบ",
  3710: "รอของครบ", 3720: "แผงส่งครบ", 3730: "กำลังติดตั้ง", 3740: "ติดตั้งเสร็จ",
  3810: "ยื่นแล้ว รอผล", 3820: "ได้วันจ่ายไฟ",
  3910: "รอส่งมอบ / Training", 3920: "ส่งมอบแล้ว รองวดสุดท้าย",
};
/** แถวสมมติใน journey-summary: โครงการขั้น 3600 ที่ Purchase ยังไม่บันทึกสั่งของครบ (badge เมนูจัดซื้อ) */
export const B2B_PROCURE_PENDING_SUB = 9040;
