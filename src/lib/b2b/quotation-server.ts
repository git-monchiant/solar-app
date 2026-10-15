import { sql } from "./db";
import {
  DEFAULT_INSTALL_WARRANTY, DEFAULT_INSTALLMENTS, DEFAULT_ITEM_TITLE, DEFAULT_REMARKS, DEFAULT_WARRANTY, ESTIMATE_REMARK,
  quoteTotals, roundUpHundreds,
  type B2bQuote, type QuoteContent, type QuoteKind, type QuoteStatus, type ReviewTier,
} from "./quotation";

// ฝั่ง server ของใบเสนอราคา B2B — เลขที่ / ค่าตั้งต้นจาก BOQ / โหลดใบ / snapshot ตอนส่งอนุมัติ
// แผน docs/plan/20261015-07-b2b-project-flow.md เฟส 2

type Queryable = { request(): sql.Request };
const num = (v: unknown) => (v == null ? null : Number(v));

/** เลขที่ตามแม่แบบ SSE: SSE-MS-RPPS-yynnnn (ปี พ.ศ.ไม่ใช้ — แม่แบบใช้ ค.ศ. 2 หลัก) · เท่ากันทุก Rev
 *  เรียกใน transaction · UPDLOCK กันสองคนได้เลขซ้ำ (แบบ nextDocNo ของ BOQ) — UQ (doc_no, revision) กันซ้ำอีกชั้น */
export const QUOTE_PREFIX = "SSE-MS-RPPS-";
export async function nextQuoteDocNo(tx: sql.Transaction): Promise<string> {
  const yy = String(new Date(Date.now() + 7 * 3600 * 1000).getUTCFullYear()).slice(2);
  const prefix = `${QUOTE_PREFIX}${yy}`;
  const r = await new sql.Request(tx).input("p", sql.NVarChar(30), `${prefix}%`)
    .query(`SELECT MAX(doc_no) AS last FROM b2b_quotations WITH (UPDLOCK, HOLDLOCK) WHERE doc_no LIKE @p`);
  const last = r.recordset[0]?.last as string | null;
  const seq = last ? Number(last.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

/** วันนี้เวลาไทย YYYY-MM-DD */
export const todayBangkok = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

const OM_REMARK = (years: number, visits: number) =>
  `ราคาข้างต้นรวมค่าดำเนินการ O&M เป็นระยะเวลา ${years} ปี ตามรายการดังนี้ 1. ตรวจสอบระบบทั้งระบบ ตรวจสอบจุดต่อพร้อมทำ Thermoscan ปีละ ${visits} ครั้ง 2. ตรวจสอบความผิดปกติของแผ่นทางกายภาพ ปีละ ${visits} ครั้ง`;

/** เนื้อหาตั้งต้นของใบใหม่ — รายการเหมา 1 บรรทัดจาก BOQ (ยอดปัดขึ้นหลักร้อยแบบแม่แบบ) + bullet แผง/อินเวอร์เตอร์จากบรรทัดจริง */
export async function buildDefaultContent(db: Queryable, boqId: number, kind: QuoteKind): Promise<QuoteContent | null> {
  const h = (await db.request().input("id", sql.Int, boqId)
    .query(`SELECT capacity_wp, total_sale, vat_pct FROM b2b_boqs WHERE id = @id`)).recordset[0];
  if (!h) return null;
  const lines = (await db.request().input("id", sql.Int, boqId).query(`
    SELECT category_id, brand, model, unit, SUM(qty) AS qty FROM b2b_boq_items
    WHERE boq_id = @id AND category_id IN (1, 2) AND qty > 0
    GROUP BY category_id, brand, model, unit ORDER BY category_id, SUM(qty) DESC`)).recordset;
  const kwp = h.capacity_wp ? Math.round(Number(h.capacity_wp) / 10) / 100 : null;
  const qty = (v: unknown) => Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  // รุ่นส่วนใหญ่มียี่ห้ออยู่ในชื่อแล้ว ("Jinko Solar 700W") — ไม่ต่อยี่ห้อซ้ำ
  const name = (l: Record<string, unknown>) => {
    const brand = String(l.brand ?? "").trim();
    const model = String(l.model ?? "").trim();
    return brand && !model.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${model}`.trim() : model || brand;
  };
  const om = { years: 2, visits: 2 };
  const bullets = [
    ...lines.filter((l) => l.category_id === 1).map((l) => `รวมแผ่นโซลาร์เซลล์ ${name(l)} จำนวน ${qty(l.qty)} แผง หรือเทียบเท่ามาตรฐาน TIER 1`),
    ...lines.filter((l) => l.category_id === 2).map((l) => `รวมอินเวอร์เตอร์ ${name(l)} จำนวน ${qty(l.qty)} ชุด หรือเทียบเท่าการทดสอบจากการไฟฟ้าฯ`),
    "รวมอุปกรณ์สำหรับรองรับแผ่นโซลาร์เซลล์ที่ติดตั้งบนหลังคา",
    "รวมงานเดินสายไฟ DC/AC จากแผ่นเข้าห้องไฟฟ้าและเดินสายไฟ AC เข้าตู้ไฟฟ้าอาคาร",
    "รวมอุปกรณ์สำหรับงานติดตั้งบริเวณอินเวอร์เตอร์ พร้อมระบบไฟฟ้า",
    `รวมการรับประกันงานติดตั้งและค่าดำเนินการ O&M เป็นระยะเวลา ${om.years} ปี ปีละ ${om.visits} ครั้ง`,
    "ค่าดำเนินการยื่นขออนุญาตหน่วยงานราชการ",
    `ค่าแรงติดตั้งระบบผลิตไฟฟ้าจากพลังงานแสงอาทิตย์บนหลังคา${kwp ? ` ขนาดกำลังติดตั้งรวม ${kwp} kWp.` : ""}`,
  ];
  const remarks = [...DEFAULT_REMARKS];
  if (kind === "estimate") remarks.splice(1, 0, ESTIMATE_REMARK);
  remarks.push(OM_REMARK(om.years, om.visits));
  return {
    items: [{ title: DEFAULT_ITEM_TITLE, kwp, amount: roundUpHundreds(Number(h.total_sale ?? 0)), bullets }],
    payment_days: 30, installments: DEFAULT_INSTALLMENTS.map((x) => ({ ...x })),
    vat_pct: h.vat_pct == null ? 7 : Number(h.vat_pct), validity_days: 30,
    warranty: DEFAULT_WARRANTY.map((x) => ({ ...x })), install_warranty: DEFAULT_INSTALL_WARRANTY,
    remarks, om_years: om.years, om_visits_per_year: om.visits,
  };
}

const parseContent = (raw: unknown): QuoteContent => {
  const c = (typeof raw === "string" ? JSON.parse(raw) : raw) as QuoteContent;
  return { ...c, items: c.items ?? [], installments: c.installments ?? [], warranty: c.warranty ?? [], remarks: c.remarks ?? [] };
};

export async function loadQuote(db: Queryable, id: number): Promise<B2bQuote | null> {
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT q.id, q.project_id, q.boq_id, q.doc_no, q.revision, q.root_id, q.is_latest, q.kind, q.status,
           CONVERT(char(10), q.issue_date, 23) AS issue_date, q.content_json, q.subtotal, q.vat, q.total, q.snapshot_json,
           q.proposer_name, q.submitted_at, CASE WHEN q.proposer_sig IS NULL THEN 0 ELSE 1 END AS proposer_has_sig,
           q.r1_name, q.r1_at, q.r1_note, CASE WHEN q.r1_sig IS NULL THEN 0 ELSE 1 END AS r1_has_sig,
           q.r2_name, q.r2_at, q.r2_note, CASE WHEN q.r2_sig IS NULL THEN 0 ELSE 1 END AS r2_has_sig,
           q.r3_name, q.r3_at, q.r3_note, CASE WHEN q.r3_sig IS NULL THEN 0 ELSE 1 END AS r3_has_sig,
           q.returned_tier, q.returned_at, q.return_note, ru.full_name AS returned_by_name,
           q.sent_at, su.full_name AS sent_by_name, q.created_by, q.created_at, q.updated_at,
           b.doc_no AS boq_doc_no, b.revision AS boq_revision, b.option_label, b.capacity_wp, b.total_cost, b.total_sale, b.margin_pct, b.pending_lines
    FROM b2b_quotations q
    JOIN b2b_boqs b ON b.id = q.boq_id
    LEFT JOIN users ru ON ru.id = q.returned_by
    LEFT JOIN users su ON su.id = q.sent_by
    WHERE q.id = @id`);
  const q = r.recordset[0];
  if (!q) return null;
  const revs = await db.request().input("root", sql.Int, q.root_id ?? q.id)
    .query(`SELECT id, revision, status, is_latest FROM b2b_quotations WHERE id = @root OR root_id = @root ORDER BY revision`);
  const snap = q.snapshot_json ? JSON.parse(q.snapshot_json) : null;
  const signer = (n: 1 | 2 | 3) => ({ name: q[`r${n}_name`], at: q[`r${n}_at`], note: q[`r${n}_note`], has_signature: !!q[`r${n}_has_sig`] });
  return {
    ...parseContent(q.content_json),
    id: q.id, project_id: q.project_id, boq_id: q.boq_id, doc_no: q.doc_no, revision: q.revision, is_latest: !!q.is_latest,
    kind: q.kind as QuoteKind, status: q.status as QuoteStatus, issue_date: q.issue_date,
    subtotal: Number(q.subtotal), vat: Number(q.vat), total: Number(q.total),
    boq: {
      doc_no: q.boq_doc_no, revision: q.boq_revision, option_label: q.option_label, capacity_wp: num(q.capacity_wp),
      total_cost: num(q.total_cost), total_sale: num(q.total_sale), margin_pct: Number(q.margin_pct), pending_lines: q.pending_lines,
    },
    boq_snapshot: snap?.boq ?? null,
    proposer: { name: q.proposer_name, at: q.submitted_at, has_signature: !!q.proposer_has_sig },
    reviews: { 1: signer(1), 2: signer(2), 3: signer(3) } as Record<ReviewTier, ReturnType<typeof signer>>,
    returned: q.returned_at ? { by: q.returned_by_name, at: q.returned_at, note: q.return_note } : null,
    sent_at: q.sent_at, sent_by_name: q.sent_by_name,
    created_by: q.created_by, created_at: q.created_at, updated_at: q.updated_at,
    revisions: revs.recordset.map((x) => ({ id: x.id, revision: x.revision, status: x.status, is_latest: !!x.is_latest })),
  };
}

/** ข้อมูลหัวใบที่พิมพ์บน PDF — สดจากโครงการ (ร่าง) หรือแช่ไว้ใน snapshot (ส่งอนุมัติแล้ว) */
export type QuoteDocHead = {
  doc_no: string; revision: number; kind: QuoteKind; issue_date: string | null;
  project: { code: string; name: string; location: string | null };
  customer: { name: string; tax_id: string | null; branch: string | null; address: string | null };
  contact: { name: string | null; phone: string | null; email: string | null };
  proposer: { name: string | null; phone: string | null; email: string | null; title: string | null };
  boq: { doc_no: string; revision: number; option_label: string | null; capacity_wp: number | null; total_cost: number | null; total_sale: number | null; margin_pct: number };
};
export type QuoteSnapshot = QuoteDocHead & { content: QuoteContent; totals: ReturnType<typeof quoteTotals> };

/** สร้าง snapshot (ตอนส่งอนุมัติ) หรือหัวใบสด (ตอนพิมพ์ร่าง) — proposerId = ผู้ส่ง (ร่าง: ผู้สร้างใบ) */
export async function buildSnapshot(db: Queryable, quoteId: number, proposerId: number | null): Promise<QuoteSnapshot | null> {
  const r = await db.request().input("id", sql.Int, quoteId).input("u", sql.Int, proposerId).query(`
    SELECT q.doc_no, q.revision, q.kind, CONVERT(char(10), q.issue_date, 23) AS issue_date, q.content_json,
           p.code, p.name AS project_name, p.location, p.contact_name, p.contact_phone, p.contact_email,
           c.name AS customer_name, c.tax_id, c.branch, c.address,
           b.doc_no AS boq_doc_no, b.revision AS boq_revision, b.option_label, b.capacity_wp, b.total_cost, b.total_sale, b.margin_pct,
           u.full_name AS proposer_name, u.phone AS proposer_phone, u.email AS proposer_email, u.job_title AS proposer_title
    FROM b2b_quotations q
    JOIN b2b_projects p ON p.id = q.project_id
    JOIN b2b_customers c ON c.id = p.customer_id
    JOIN b2b_boqs b ON b.id = q.boq_id
    LEFT JOIN users u ON u.id = @u
    WHERE q.id = @id`);
  const x = r.recordset[0];
  if (!x) return null;
  const content = parseContent(x.content_json);
  return {
    doc_no: x.doc_no, revision: x.revision, kind: x.kind, issue_date: x.issue_date,
    project: { code: x.code, name: x.project_name, location: x.location },
    customer: { name: x.customer_name, tax_id: x.tax_id, branch: x.branch, address: x.address },
    contact: { name: x.contact_name, phone: x.contact_phone, email: x.contact_email },
    proposer: { name: x.proposer_name, phone: x.proposer_phone, email: x.proposer_email, title: x.proposer_title },
    boq: {
      doc_no: x.boq_doc_no, revision: x.boq_revision, option_label: x.option_label, capacity_wp: num(x.capacity_wp),
      total_cost: num(x.total_cost), total_sale: num(x.total_sale), margin_pct: Number(x.margin_pct),
    },
    content, totals: quoteTotals(content),
  };
}

/** ใบที่ BOQ Rev นี้ถูกใช้แล้วในใบที่ส่งอนุมัติ/อนุมัติ/ส่งลูกค้า — แก้ BOQ Rev นี้ไม่ได้ (ต้องออก Rev ใหม่) */
export async function boqLockedByQuote(db: Queryable, boqId: number): Promise<string | null> {
  const r = await db.request().input("b", sql.Int, boqId).query(`
    SELECT TOP 1 doc_no, revision FROM b2b_quotations WHERE boq_id = @b AND status NOT IN ('draft', 'changes_required') ORDER BY id DESC`);
  const q = r.recordset[0];
  return q ? `${q.doc_no} Rev ${q.revision}` : null;
}
