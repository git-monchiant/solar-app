import type { AppRole } from "@/lib/role-permissions";

// ใบเสนอราคา B2B — สถานะ / ชนิด / ค่าตั้งต้นตามแม่แบบ / ตัวตรวจ body (ไม่มี mssql ⇒ client import ได้)
// แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 2 · ผังตาม sheet "SSE (2)" ใน BOQ Solar rooftop.xlsx
// อนุมัติ 3 ชั้นตามช่องลงชื่อในแม่แบบ: ผู้ตรวจสอบ 1 (แถว 2 ซ้าย) → 2 (แถว 2 ขวา) → 3 (แถว 3)

/** won = ใบที่ได้งาน (สัญญา) · closed = ใบอื่นของโครงการที่ปิดเองตอนได้งาน (เฟส 3) */
export type QuoteStatus = "draft" | "pending_review1" | "pending_review2" | "pending_review3" | "changes_required" | "approved" | "sent" | "won" | "closed";
export type QuoteKind = "estimate" | "confirmed";
export type ReviewTier = 1 | 2 | 3;

/** role ของผู้ตรวจสอบแต่ละชั้น (ตามตำแหน่งช่องลงชื่อ) */
export const REVIEW_ROLE: Record<ReviewTier, AppRole> = { 1: "b2b_review1", 2: "b2b_review2", 3: "b2b_review3" };
export const REVIEW_ROLES = ["b2b_review1", "b2b_review2", "b2b_review3"] as const satisfies readonly AppRole[];
/** ทำ/แก้/ส่งอนุมัติใบเสนอราคา */
export const B2B_QUOTE_EDIT_ROLES = ["b2b", "admin"] as const satisfies readonly AppRole[];
/** เปิดดูใบ (ผู้ตรวจสอบต้องเห็นใบที่รอตัวเอง) */
export const B2B_QUOTE_VIEW_ROLES = ["b2b", ...REVIEW_ROLES, "admin"] as const satisfies readonly AppRole[];

export const PENDING_STATUS: Record<ReviewTier, QuoteStatus> = { 1: "pending_review1", 2: "pending_review2", 3: "pending_review3" };
export const tierOfStatus = (s: QuoteStatus): ReviewTier | null =>
  s === "pending_review1" ? 1 : s === "pending_review2" ? 2 : s === "pending_review3" ? 3 : null;

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: "ร่าง",
  pending_review1: "รอผู้ตรวจสอบ 1",
  pending_review2: "รอผู้ตรวจสอบ 2",
  pending_review3: "รอผู้ตรวจสอบ 3",
  changes_required: "ส่งกลับแก้",
  approved: "อนุมัติแล้ว · รอส่งลูกค้า",
  sent: "ส่งลูกค้าแล้ว",
  won: "ได้งาน (สัญญา)",
  closed: "ปิด (เลือกใบอื่น)",
};
export const QUOTE_STATUS_TONE: Record<QuoteStatus, string> = {
  draft: "bg-gray-100 text-gray-600",
  pending_review1: "bg-active-light text-active-dark",
  pending_review2: "bg-active-light text-active-dark",
  pending_review3: "bg-active-light text-active-dark",
  changes_required: "bg-amber-50 text-amber-700",
  approved: "bg-emerald-50 text-emerald-700",
  sent: "bg-blue-50 text-blue-700",
  won: "bg-emerald-100 text-emerald-800",
  closed: "bg-gray-100 text-gray-400",
};
export const QUOTE_KIND_LABEL: Record<QuoteKind, string> = { estimate: "ประมาณการ", confirmed: "ยืนยัน" };

/** ขั้นย่อยของขั้น 3200 / 3400 จากสถานะใบล่าสุด (หลักสิบ) — คิดตอนอ่านใน journey-sql แบบสำรวจ */
export const QUOTE_SUB_OFFSET: Record<QuoteStatus, number> = {
  draft: 10, pending_review1: 20, pending_review2: 30, pending_review3: 40, changes_required: 50, approved: 60, sent: 70,
  // ได้งานแล้วโครงการย้ายไปขั้น 3500 — ไม่ได้ใช้คิดขั้นย่อย 3200/3400 แต่ต้องมีครบทุกสถานะ
  won: 70, closed: 70,
};
export const editableStatus = (s: QuoteStatus) => s === "draft" || s === "changes_required";

/** แถวสมมติใน /api/journey-summary = จำนวนใบที่รอผู้ตรวจสอบแต่ละชั้น — badge เมนู "อนุมัติ B2B" (แบบ 9010 รอราคา) */
export const B2B_APPROVAL_SUB: Record<ReviewTier, number> = { 1: 9021, 2: 9022, 3: 9023 };

// ── เนื้อหาใบ ──
export type QuoteItem = { title: string; kwp: number | null; amount: number; bullets: string[] };
export type QuoteInstallment = { pct: number; condition: string };
export type QuoteWarranty = { label: string; value: string };

export type QuoteContent = {
  items: QuoteItem[];
  payment_days: number;
  installments: QuoteInstallment[];
  vat_pct: number;
  validity_days: number;
  warranty: QuoteWarranty[];
  install_warranty: string;
  remarks: string[];
  om_years: number | null;
  om_visits_per_year: number | null;
};

// ค่าตั้งต้นจากแม่แบบ SSE (2) — ใบที่ออกแล้วแช่ข้อความไว้ใน snapshot (แก้ค่าตั้งต้นทีหลังไม่ย้อนเปลี่ยนใบเก่า)
export const DEFAULT_ITEM_TITLE = "งานจ้างเหมาติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา ขนาดกำลังติดตั้งรวม";
export const DEFAULT_INSTALLMENTS: QuoteInstallment[] = [
  { pct: 30, condition: "เมื่อมีการลงนามในสัญญา" },
  { pct: 30, condition: "เมื่อได้รับส่งมอบแผ่นเซลล์แสงอาทิตย์ ณ โครงการครบ 100%" },
  { pct: 35, condition: "เมื่อติดตั้งแล้วเสร็จ 100%" },
  { pct: 5, condition: "เมื่อนำส่งใบส่งมอบงาน (เริ่มรับประกันงานติดตั้ง) พร้อม Training แนะนำข้อมูลระบบ" },
];
export const DEFAULT_WARRANTY: QuoteWarranty[] = [
  { label: "การประกัน แผ่นโซลาร์ รับประกัน", value: "12 ปี Production Warranty และ 30 ปี Performance Warranty จากผู้ผลิต" },
  { label: "การประกัน Inverter รับประกัน", value: "10 ปี จากผู้ผลิต" },
  { label: "การประกัน Mounting รับประกัน", value: "12 ปี จากผู้ผลิต" },
];
export const DEFAULT_INSTALL_WARRANTY = "2 ปีนับจากวันลงนามใบส่งมอบงาน";
export const ESTIMATE_REMARK = "ราคาดังกล่าวเป็นการประมาณการจาก Google Maps กรณีที่จะมีการชำระเงินงานติดตั้งระบบโซลาร์เซลล์ จะต้องเข้าไปสำรวจหน้างานจริงเพื่อยืนยันราคาอีกรอบ";
export const DEFAULT_REMARKS: string[] = [
  "ราคาดังกล่าวรวมค่าบริการและค่าธรรมเนียมของหน่วยงานราชการ สำหรับใบอนุญาตต่างๆ ที่มีออกใบเสร็จเท่านั้น ไม่รวมค่าใช้จ่ายอื่นใดที่เรียกเก็บโดยไม่มีใบเสร็จ ทั้งนี้ บริษัทฯ จะยังดำเนินการติดต่อประสานงานจนครบทุกขั้นตอน",
  "เอกสารเพื่อยื่นขออนุญาตหน่วยงานราชการ: 1. หนังสือแจ้งความประสงค์ติดตั้งโซลาร์เซลล์ต่อหน่วยงานท้องถิ่น (ไม่รวมใบรับรองอาคาร อ.5) 2. หนังสือแจ้งผลพิจารณาการเชื่อมต่อเครื่องกำเนิดไฟฟ้ากับระบบไฟฟ้า กฟน./กฟภ. 3. เอกสารทางโครงสร้างและสถาปัตย์เพื่อยื่นขออนุญาตดัดแปลงอาคาร (ไม่รวมกรณีลูกค้าไม่มีแบบและต้องทำขึ้นใหม่)",
  "หากมีการเปลี่ยนแปลงแบบจากเอกสารข้อเสนอโครงการ จะคำนวณปริมาณงานลด/งานเพิ่ม ตามจริง",
  "ราคาดังกล่าว ครอบคลุมการติดต่อประสานหน่วยงานการไฟฟ้า เฉพาะวัน / เวลาทำการเท่านั้น",
];

/** ปัดยอดเหมาขึ้นเป็นหลักร้อยแบบแม่แบบ (ROUNDUP(ราคาขาย, -2)) */
export const roundUpHundreds = (n: number) => (n > 0 ? Math.ceil(Math.round(n * 100) / 100 / 100) * 100 : 0);

/** ยอดของใบ — ก่อน VAT = ผลรวมรายการ · VAT ปัดสตางค์ */
export function quoteTotals(c: Pick<QuoteContent, "items" | "vat_pct">) {
  const subtotal = Math.round(c.items.reduce((s, i) => s + (Number(i.amount) || 0), 0) * 100) / 100;
  const vat = Math.round(subtotal * (Number(c.vat_pct) || 0)) / 100;
  return { subtotal, vat, total: Math.round((subtotal + vat) * 100) / 100 };
}

const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const intIn = (v: unknown, min: number, max: number, dflt: number) => {
  const n = Number(v);
  return Number.isInteger(n) && n >= min && n <= max ? n : dflt;
};

/** ตรวจเนื้อหาใบจากหน้าจอ (PUT) — งวดเงินรวมต้อง 100% · ต้องมีรายการ 1 บรรทัดขึ้นไป */
export function readQuoteContent(b: Record<string, unknown>): { value: QuoteContent } | { error: string } {
  const rawItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
  if (rawItems.length === 0) return { error: "ต้องมีรายการอย่างน้อย 1 รายการ" };
  if (rawItems.length > 20) return { error: "รายการเกิน 20 รายการ" };
  const items: QuoteItem[] = [];
  for (const [i, r] of rawItems.entries()) {
    const title = text(r?.title, 300);
    if (!title) return { error: `รายการที่ ${i + 1}: กรุณาระบุชื่องาน` };
    const amount = Number(r.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount >= 1e11) return { error: `รายการที่ ${i + 1}: จำนวนเงินไม่ถูกต้อง` };
    const kwp = r.kwp === "" || r.kwp == null ? null : Number(r.kwp);
    if (kwp != null && (!Number.isFinite(kwp) || kwp < 0)) return { error: `รายการที่ ${i + 1}: ขนาด kWp ไม่ถูกต้อง` };
    const bullets = (Array.isArray(r.bullets) ? r.bullets : []).map((x) => text(x, 300)).filter(Boolean).slice(0, 30);
    items.push({ title, kwp, amount: Math.round(amount * 100) / 100, bullets });
  }
  const rawInst = Array.isArray(b.installments) ? (b.installments as Record<string, unknown>[]) : [];
  if (rawInst.length === 0) return { error: "ต้องมีงวดชำระเงินอย่างน้อย 1 งวด" };
  const installments: QuoteInstallment[] = [];
  for (const [i, r] of rawInst.entries()) {
    const pct = Number(r?.pct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) return { error: `งวดที่ ${i + 1}: % ไม่ถูกต้อง` };
    const condition = text(r.condition, 300);
    if (!condition) return { error: `งวดที่ ${i + 1}: กรุณาระบุเงื่อนไข` };
    installments.push({ pct: Math.round(pct * 100) / 100, condition });
  }
  const sumPct = Math.round(installments.reduce((s, x) => s + x.pct, 0) * 100) / 100;
  if (sumPct !== 100) return { error: `งวดชำระเงินรวมกันได้ ${sumPct}% — ต้องเท่ากับ 100%` };
  const warranty = (Array.isArray(b.warranty) ? (b.warranty as Record<string, unknown>[]) : [])
    .map((w) => ({ label: text(w?.label, 200), value: text(w?.value, 300) })).filter((w) => w.label || w.value).slice(0, 20);
  const remarks = (Array.isArray(b.remarks) ? b.remarks : []).map((x) => text(x, 1000)).filter(Boolean).slice(0, 30);
  const vat = Number(b.vat_pct);
  const omYears = b.om_years === "" || b.om_years == null ? null : intIn(b.om_years, 0, 30, -1);
  const omVisits = b.om_visits_per_year === "" || b.om_visits_per_year == null ? null : intIn(b.om_visits_per_year, 0, 24, -1);
  if (omYears === -1 || omVisits === -1) return { error: "O&M: จำนวนปี/ครั้งต่อปีไม่ถูกต้อง" };
  return {
    value: {
      items, installments, warranty, remarks,
      payment_days: intIn(b.payment_days, 0, 365, 30),
      vat_pct: Number.isFinite(vat) && vat >= 0 && vat < 100 ? vat : 7,
      validity_days: intIn(b.validity_days, 1, 365, 30),
      install_warranty: text(b.install_warranty, 300),
      om_years: omYears, om_visits_per_year: omVisits,
    },
  };
}

/** หัวใบ + ผู้ลงชื่อ ที่หน้าจอ/PDF ใช้ */
export type QuoteSigner = { name: string | null; at: string | null; note?: string | null; has_signature?: boolean };

export type B2bQuote = QuoteContent & {
  id: number; project_id: number; boq_id: number; doc_no: string; revision: number; is_latest: boolean;
  kind: QuoteKind; status: QuoteStatus; issue_date: string | null;
  subtotal: number; vat: number; total: number;
  boq: { doc_no: string; revision: number; option_label: string | null; capacity_wp: number | null; total_cost: number | null; total_sale: number | null; margin_pct: number; pending_lines: number };
  /** ค่าที่แช่ตอนส่งอนุมัติ (ต้นทุน/ราคาขายของ BOQ) — ใช้เทียบ Rev */
  boq_snapshot: { capacity_wp: number | null; total_cost: number | null; total_sale: number | null; margin_pct: number } | null;
  proposer: QuoteSigner; reviews: Record<ReviewTier, QuoteSigner>;
  returned: { by: string | null; at: string | null; note: string | null } | null;
  sent_at: string | null; sent_by_name: string | null;
  created_by: number | null; created_at: string; updated_at: string;
  revisions: { id: number; revision: number; status: QuoteStatus; is_latest: boolean }[];
};
