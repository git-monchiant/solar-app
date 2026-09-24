import "server-only";
import type { Transaction } from "mssql";
import { getDb, sql } from "@/lib/db";
import { calculateQuotation, type QuotationInputItem } from "@/lib/quotation";
import {
  QUOTATION_DOCUMENT_VERSION, calculateFinancialSnapshot, parseDocumentInputs,
  type QuotationDocumentSnapshot,
} from "@/lib/quotation-document";
import type { QuotationLegalContent, QuotationPaymentTerm } from "@/lib/quotation-terms";

// ใบเสนอราคางานบริการ O&M (แผน docs/plan/20260924-02-om-quotation-approval-flow.md เฟส 2)
//
// ★ ใช้ตาราง quotations / quotation_items ของฝั่งขายตัวเดียวกัน (ผู้ใช้เคาะ 24 ก.ย. 69 ข้อ 4–5)
//   ให้คิวอนุมัติ Solar Sup → Sale Sup และคิวรับเงินของ Account เป็นชุดเดียว (เฟส 3–4)
//   แยกใบ O&M ด้วย quotations.om_booking_id · ฝั่งขายกรองใบพวกนี้ออกจากรายการของ lead
// ★ Package O&M อยู่ om_packages ไม่ใช่ packages ของฝั่งขาย ⇒ package_id = NULL
//   เก็บชื่อ/ราคาไว้ที่ snapshot เหมือนฝั่งขาย ส่วนงานเพิ่ม/ซ่อมเป็นแถว custom ใน quotation_items

/** ใครออกใบเสนอราคา O&M ได้ — ผู้ใช้เคาะ 24 ก.ย. ข้อ 3 "Sale ออกใบ" (แคบกว่า QUOTATION_MANAGE_ROLES ของฝั่งขาย) */
export const OM_QUOTE_ROLES = ["admin", "sales", "sales_sup"];
export const canIssueOmQuotation = (roles: readonly string[]) => roles.some((r) => OM_QUOTE_ROLES.includes(r));

/** แก้ใบได้เฉพาะตอนยังไม่ส่งอนุมัติ หรือถูกส่งกลับมาแก้ — ชุดเดียวกับฝั่งขาย */
export const OM_QUOTE_EDITABLE = ["draft", "changes_required"];

/** งานเสียเงิน = เก็บค่าบริการเต็มก่อนนัด (หมายเหตุข้อ 2 ของ Package O&M) — ระบบฝั่งขายบังคับงวดรวม 100% */
export const OM_PAYMENT_TERMS: QuotationPaymentTerm[] = [
  { label: "ชำระเต็มจำนวน", percent: 100, due: "ก่อนวันนัดหมายเข้าให้บริการ" },
];

/** slip_field ของเงินค่าบริการ O&M ในตาราง payments (เฟส 4) — ประเภทของตัวเอง ไม่ใช่ order_installment_%
 *  ★ journey ฝั่งขายนับงวดจาก slip_field LIKE 'order_installment_%' (lib/journey.ts) — ใช้ชื่ออื่นจึงไม่ปนงวดขาย
 *    ของบ้านที่ใช้ lead ร่วมกับฝั่งขาย · 1 ใบเสนอราคา = 1 slip_field */
export const OM_SLIP_PREFIX = "om_quote_";
export const omSlipField = (quotationId: number) => `${OM_SLIP_PREFIX}${quotationId}`;

/** step_no ของแถวค่าบริการ O&M ใน payments — คอลัมน์บังคับ NOT NULL ของฝั่งขาย (1 ค่าสำรวจ · 10+i งวด ·
 *  99 เก็บหลังติดตั้ง · 100+n ค่าใช้จ่ายเพิ่ม) · 900 ไม่ชนเลขไหน และแถว O&M ไม่ผ่าน API ขายที่อ่าน step_no */
export const OM_PAY_STEP_NO = 900;

/**
 * เติมสิทธิ์ที่ลูกค้าซื้อ เมื่อ Account ยืนยันรับเงิน (แผน 20260924-02 เฟส 4)
 * ★ ทำไมต้องเติม: ปิดงานตัดสิทธิ์ 1 ครั้งเสมอ (bookings/[id] PATCH → om_redemptions) แม้ยอดจะติดลบ
 *   เติมที่จ่ายเงินแล้วให้ปิดงานตัดตามปกติ ยอดคงเหลือจึงถูกโดยไม่ต้องแก้ตรรกะปิดงานเลย
 *   · รายครั้ง / ใบที่ไม่มีแพ็กเกจ (งานซ่อม/งานเพิ่ม) = +1 ของชนิดงานของใบงาน → ใช้หมดกับงานนี้
 *   · สัญญา 12 เดือน เข้า 2 ครั้ง = +2 ล้างแผง ใช้กับงานนี้ 1 เหลือ 1 · จด valid_from/valid_to ไว้
 *     (วิว om_entitlement_balance ยังไม่ตัดสิทธิ์หมดอายุ — ข้อจำกัดเดิมของโมดูล ไม่ได้แก้ในเฟสนี้)
 * ★ ผูกกับ installation แรกของบ้าน ตัวเดียวกับที่ปิดงานใช้ตัดสิทธิ์
 */
export async function grantPurchasedRights(tx: Transaction, v: {
  houseId: number; serviceTypeId: number; omPackageId: number | null; docNo: string; actorUserId: number;
}): Promise<{ qty: number; grantId: number | null }> {
  const inst = (await new sql.Request(tx).input("h", sql.Int, v.houseId)
    .query(`SELECT TOP 1 id FROM om_installations WHERE house_id = @h ORDER BY id`)).recordset[0];
  if (!inst) return { qty: 0, grantId: null };
  const pkg = v.omPackageId
    ? (await new sql.Request(tx).input("id", sql.Int, v.omPackageId)
        .query(`SELECT kw_min, kw_max, plan_type, contract_months, visits FROM om_packages WHERE id = @id`)).recordset[0]
    : null;
  const contract = pkg?.plan_type === "contract";
  const qty = contract ? Math.max(1, Number(pkg.visits) || 2) : 1;
  const months = contract ? Math.max(1, Number(pkg.contract_months) || 12) : null;
  const typeId = contract
    ? (await new sql.Request(tx).query(`SELECT TOP 1 id FROM om_service_type WHERE code = 'cleaning'`)).recordset[0].id
    : v.serviceTypeId;
  const label = pkg ? omPackageLabel(pkg) : "งานบริการตามใบเสนอราคา";
  const reason = `ซื้อ ${label} · ${v.docNo}`.slice(0, 300);
  const g = await new sql.Request(tx)
    .input("i", sql.Int, inst.id).input("q", sql.Int, qty).input("r", sql.NVarChar(300), reason)
    .input("ct", sql.NVarChar(20), contract ? `${months}เดือน${qty}ครั้ง` : null)
    .input("m", sql.Int, months).input("t", sql.Int, typeId).input("u", sql.Int, v.actorUserId)
    .query(`INSERT INTO om_entitlement_grants
              (installation_id, qty, source, reason, contract_term, valid_from, valid_to, created_by, service_type_id)
            OUTPUT INSERTED.id
            VALUES (@i, @q, 'purchase', @r, @ct, CAST(GETDATE() AS DATE),
                    CASE WHEN @m IS NULL THEN NULL ELSE DATEADD(month, @m, CAST(GETDATE() AS DATE)) END, @u, @t)`);
  const grantId = Number(g.recordset[0].id);
  await new sql.Request(tx)
    .input("h", sql.Int, v.houseId).input("i", sql.Int, inst.id).input("r", sql.Int, grantId)
    .input("q", sql.Int, qty).input("d", sql.NVarChar(400), `เติมสิทธิ์ +${qty} · ${label}`.slice(0, 400))
    .input("rs", sql.NVarChar(300), reason).input("u", sql.Int, v.actorUserId)
    .query(`INSERT INTO om_entitlement_history
              (house_id, installation_id, kind, [action], ref_id, qty, detail, reason, actor_user_id)
            VALUES (@h, @i, N'grant', N'add', @r, @q, @d, @rs, @u)`);
  return { qty, grantId };
}

/** SQL: ใบงาน alias `b` ได้รับเงินแล้ว (Account ยืนยัน confirmed_at) จากใบเสนอราคาใบใดใบหนึ่งของใบงาน */
export const OM_BOOKING_PAID_SQL = (b: string) => `EXISTS (
  SELECT 1 FROM quotations oq JOIN payments op
      ON op.lead_id = oq.lead_id AND op.slip_field = CONCAT(N'${OM_SLIP_PREFIX}', oq.id)
   WHERE oq.om_booking_id = ${b}.id AND op.confirmed_at IS NOT NULL)`;

/** เลขที่ใบเสนอราคา O&M — แยก prefix จากฝั่งขาย (ผู้ใช้เคาะ 24 ก.ย. ข้อ 8)
 *  ฝั่งขาย SSR-QT-26-0001 · ใบตรวจรับงาน O&M OM-6909-0007 · ของเรา SSR-OM-QT-26-0001 รันแยกชุด
 *  (nextQuotationDocNo ของฝั่งขายค้น LIKE 'SSR-QT-yy-%' ไม่ชนกับ prefix นี้) */
export async function nextOmQuotationDocNo(tx: Transaction): Promise<string> {
  const year = new Date().getFullYear().toString().slice(-2);
  const prefix = `SSR-OM-QT-${year}-`;
  const r = await new sql.Request(tx)
    .input("like", sql.NVarChar(30), `${prefix}%`)
    .query(`SELECT MAX(TRY_CAST(RIGHT(doc_no, 4) AS INT)) AS max_num
              FROM quotations WITH (UPDLOCK, HOLDLOCK) WHERE doc_no LIKE @like`);
  return `${prefix}${String((r.recordset[0]?.max_num || 0) + 1).padStart(4, "0")}`;
}

/**
 * lead ของเจ้าของบ้าน — มีแล้วใช้ตัวเดิม (om_houses.lead_id) ไม่มีก็สร้าง lead om_only ให้
 * (ผู้ใช้เคาะ 24 ก.ย. ข้อ 5: บ้าน O&M 1,828 หลังมี lead ขายแค่ 5 หลัง ที่เหลือมาจาก REM)
 *
 * ★ lead ที่สร้างตรงนี้ om_only = 1 เสมอ → ฝั่งขายกรองออกทุกหน้า (lib/lead-scope.ts)
 *   ไม่มี journey ขาย (lib/journey.ts) ไม่มี SLA ขาย (lib/sla-service.ts)
 * ★ lead ขายเดิมของ 5 หลังนั้นใช้ตัวเดิม ไม่แตะ om_only — ยังเป็นลูกค้าขายจริง
 * ★ project_id เว้นว่าง: om_houses.project_id เป็นรหัส REM (เช่น BPHGH) ไม่ใช่ projects.id ของฝั่งขาย
 *   ใส่ชื่อโครงการเป็นข้อความที่ project_name แทน
 */
export async function ensureOmLead(tx: Transaction, houseId: number, actorUserId: number): Promise<number> {
  const h = (await new sql.Request(tx).input("h", sql.Int, houseId).query(`
    SELECT h.id, h.lead_id, h.house_number, h.address, h.full_name,
           COALESCE(pj.name_th, h.project_name) project_name,
           (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
           (SELECT TOP 1 p.phone FROM om_house_customers hc
             JOIN om_customer_phones p ON p.customer_id = hc.customer_id
            WHERE hc.house_id = h.id AND hc.is_current = 1 AND p.status <> 'invalid'
            ORDER BY p.is_primary DESC, p.id) phone,
           CASE WHEN EXISTS (SELECT 1 FROM leads l WHERE l.id = h.lead_id) THEN 1 ELSE 0 END lead_exists
      FROM om_houses h WITH (UPDLOCK)
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
     WHERE h.id = @h`)).recordset[0];
  if (!h) throw new Error("ไม่พบบ้านหลังนี้ในทะเบียน O&M");
  if (h.lead_id && h.lead_exists) return Number(h.lead_id);

  const name = String(h.customer_name || h.full_name || `บ้าน ${h.house_number ?? h.id}`).slice(0, 200);
  const ins = await new sql.Request(tx)
    .input("name", sql.NVarChar(200), name)
    .input("phone", sql.NVarChar(20), h.phone ? String(h.phone).slice(0, 20) : null)
    .input("project", sql.NVarChar(200), h.project_name ?? null)
    .input("house", sql.NVarChar(50), h.house_number ?? null)
    .input("addr", sql.NVarChar(500), h.address ? String(h.address).slice(0, 500) : null)
    .input("u", sql.Int, actorUserId)
    .query(`INSERT INTO leads (full_name, phone, project_name, house_number, installation_address,
                               source, status, assigned_user_id, contact_date, om_only)
            OUTPUT INSERTED.id
            VALUES (@name, @phone, @project, @house, @addr,
                    'om', 'quote', @u, CAST(GETDATE() AS DATE), 1)`);
  const leadId = Number(ins.recordset[0].id);
  await new sql.Request(tx).input("h", sql.Int, houseId).input("l", sql.Int, leadId)
    .query(`UPDATE om_houses SET lead_id = @l, updated_at = SYSDATETIMEOFFSET() WHERE id = @h`);
  return leadId;
}

export type OmQuoteInput = {
  om_package_id: number | null;
  items: { item_name: string; quantity: number; unit?: string | null; unit_price: number }[];
  discount_value: number;
  discount_reason: string | null;
  note: string | null;
};

/** อ่าน + ตรวจ body ของฟอร์ม — ต้องมี Package O&M หรือรายการอย่างน้อย 1 แถว (กติกาเดียวกับฝั่งขาย) */
export function parseOmQuoteInput(body: Record<string, unknown>): OmQuoteInput | string {
  const pkg = Number(body.om_package_id) || null;
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({
      item_name: String(x.item_name ?? "").trim().slice(0, 300),
      quantity: Math.max(0, Number(x.quantity) || 0),
      unit: x.unit ? String(x.unit).slice(0, 50) : null,
      unit_price: Math.max(0, Number(x.unit_price) || 0),
    }))
    .filter((x) => x.item_name && x.quantity > 0);
  if (!pkg && items.length === 0) return "เลือก Package O&M หรือเพิ่มรายการอย่างน้อย 1 รายการ";
  const discount = Math.max(0, Number(body.discount_value) || 0);
  const reason = String(body.discount_reason ?? "").trim().slice(0, 500) || null;
  if (discount > 0 && !reason) return "ใส่เหตุผลของส่วนลดด้วย — Sale Sup ใช้ประกอบการอนุมัติ";
  return { om_package_id: pkg, items, discount_value: discount, discount_reason: reason,
           note: String(body.note ?? "").trim().slice(0, 2000) || null };
}

/** ชื่อแพ็กเกจบนใบ — อ่านเข้าใจโดยไม่ต้องเปิดแคตตาล็อก */
export function omPackageLabel(p: { kw_min: number; kw_max: number; plan_type: string; contract_months: number | null; visits: number | null }) {
  const size = `${Number(p.kw_min).toFixed(2)}–${Number(p.kw_max).toFixed(2)} kW`;
  const plan = p.plan_type === "contract"
    ? `สัญญา ${p.contract_months ?? 12} เดือน เข้า ${p.visits ?? 2} ครั้ง`
    : "รายครั้ง";
  return `Package O&M ${size} · ${plan}`;
}

/**
 * คำนวณยอด + เขียนแถวรายการ (ลบของเดิมก่อน) — ใช้ทั้งตอนสร้างและตอนแก้
 * ยอดคิดด้วย calculateQuotation ตัวเดียวกับฝั่งขาย (ราคารวม VAT 7% แบบเดียวกัน)
 */
export async function writeOmQuoteBody(tx: Transaction, quotationId: number, input: OmQuoteInput, actorUserId: number) {
  const pkg = input.om_package_id
    ? (await new sql.Request(tx).input("id", sql.Int, input.om_package_id)
        .query(`SELECT id, kw_min, kw_max, plan_type, contract_months, visits, price, scope
                  FROM om_packages WHERE id = @id AND is_active = 1`)).recordset[0]
    : null;
  if (input.om_package_id && !pkg) throw new Error("ไม่พบ Package O&M ที่ใช้งานได้");

  const lines: QuotationInputItem[] = input.items.map((x) => ({ ...x, source_type: "custom" }));
  const pkgPrice = pkg ? Number(pkg.price) : 0;
  const t = calculateQuotation(pkgPrice, lines, "amount", input.discount_value, 0, 7);
  const notes = (await new sql.Request(tx).query(`SELECT body FROM om_package_notes ORDER BY sort_order, id`)).recordset
    .map((r, i) => `${i + 1}. ${r.body}`).join("\n");

  await new sql.Request(tx)
    .input("id", sql.Int, quotationId)
    .input("om_pkg", sql.Int, pkg ? Number(pkg.id) : null)
    .input("pkg_name", sql.NVarChar(200), pkg ? omPackageLabel(pkg) : "งานบริการ O&M")
    .input("pkg_price", sql.Decimal(12, 2), pkgPrice)
    .input("subtotal", sql.Decimal(12, 2), t.subtotal)
    .input("dv", sql.Decimal(12, 2), input.discount_value)
    .input("da", sql.Decimal(12, 2), t.discountAmount)
    .input("dr", sql.NVarChar(500), input.discount_reason)
    .input("total", sql.Decimal(12, 2), t.total)
    .input("outstanding", sql.Decimal(12, 2), t.outstanding)
    .input("before_vat", sql.Decimal(12, 2), t.beforeVat)
    .input("vat", sql.Decimal(12, 2), t.vatAmount)
    .input("terms", sql.NVarChar(sql.MAX), JSON.stringify(OM_PAYMENT_TERMS))
    .input("terms_text", sql.NVarChar(sql.MAX), pkg?.scope ? `ขอบเขตงาน: ${pkg.scope}\n${notes}` : notes)
    .input("note", sql.NVarChar(sql.MAX), input.note)
    .input("u", sql.Int, actorUserId)
    .query(`UPDATE quotations SET
              om_package_id = @om_pkg, package_id = NULL,
              package_name_snapshot = @pkg_name, package_price_snapshot = @pkg_price,
              subtotal_incl_vat = @subtotal, discount_type = 'amount', discount_value = @dv,
              discount_amount = @da, discount_reason = @dr, contract_total_incl_vat = @total,
              deposit_paid_amount = 0, outstanding_amount = @outstanding,
              amount_before_vat = @before_vat, vat_amount = @vat,
              payment_terms_json = @terms, terms_text = @terms_text, note = @note,
              updated_by = @u, updated_at = GETDATE()
            WHERE id = @id`);

  await new sql.Request(tx).input("id", sql.Int, quotationId).query(`DELETE FROM quotation_items WHERE quotation_id = @id`);
  for (const [i, x] of lines.entries()) {
    await new sql.Request(tx)
      .input("q", sql.Int, quotationId)
      .input("name", sql.NVarChar(500), x.item_name)
      .input("qty", sql.Decimal(10, 2), x.quantity)
      .input("unit", sql.NVarChar(50), x.unit ?? null)
      .input("price", sql.Decimal(12, 2), x.unit_price)
      .input("total", sql.Decimal(12, 2), Math.round(x.quantity * x.unit_price * 100) / 100)
      .input("sort", sql.Int, i + 1)
      .query(`INSERT INTO quotation_items (quotation_id, source_type, item_name_snapshot, quantity, unit, unit_price, line_total, sort_order)
              VALUES (@q, 'custom', @name, @qty, @unit, @price, @total, @sort)`);
  }
  return { total: t.total };
}

// ── เอกสาร / การส่งอนุมัติ (เฟส 3) ─────────────────────────────────────────

/**
 * ข้อความท้ายใบของงาน O&M — แทนเงื่อนไขงานติดตั้งของฝั่งขาย (ประกัน/สำรวจ/สินเชื่อ ไม่เกี่ยวกับงานล้างแผง)
 * อ่านจาก terms_text ที่แช่ไว้ในใบตอนออก/แก้ (ขอบเขตงานของแพ็กเกจ + หมายเหตุ Package O&M)
 * เลขข้อไล่ใหม่ทุกครั้ง หัวข้อไหนว่างก็ไม่พิมพ์ เลขถัดไปเลื่อนขึ้นมาเอง
 */
export function omLegalContent(termsText: unknown, validDays: unknown): QuotationLegalContent {
  const lines = String(termsText ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const scope = lines.filter((x) => x.startsWith("ขอบเขตงาน:")).map((x) => x.replace(/^ขอบเขตงาน:\s*/, ""));
  const notes = lines.filter((x) => !x.startsWith("ขอบเขตงาน:")).map((x) => x.replace(/^\d+[.)]\s*/, ""));
  const days = Number(validDays) || 7;
  const raw: { title: string; paragraphs: string[] }[] = [
    { title: "ขอบเขตงาน", paragraphs: scope },
    { title: "หมายเหตุ", paragraphs: notes },
    { title: "อายุใบเสนอราคา", paragraphs: [`ใบเสนอราคานี้มีผล ${days} วัน นับจากวันที่ออกใบเสนอราคา`] },
  ].filter((x) => x.paragraphs.length);
  return {
    profile: "additional_install",
    page1Sections: raw.map((sec, i) => ({
      title: `${i + 1}. ${sec.title}`,
      paragraphs: sec.paragraphs.map((p, j) => `${i + 1}.${j + 1} ${p}`),
    })),
    page2LeadingParagraphs: [],
    page2Sections: [],
  };
}

/** คอลัมน์ของใบ (ที่เหลือจาก SELECT l.*, q.* เป็นของ lead) — ชุดเดียวกับที่ buildQuotationDocumentSnapshot แยก */
const QUOTE_KEYS = new Set(["id", "lead_id", "option_no", "doc_no", "revision_no", "status", "package_id",
  "package_name_snapshot", "package_price_snapshot", "issue_date", "valid_days", "subtotal_incl_vat",
  "discount_label", "discount_type", "discount_value", "discount_amount", "discount_reason",
  "contract_total_incl_vat", "deposit_paid_amount", "outstanding_amount", "vat_rate", "amount_before_vat",
  "vat_amount", "payment_terms_json", "terms_text", "note", "created_by", "created_by_name",
  "created_by_title", "submitted_at", "approved_at", "approver_name_snapshot", "approver_title_snapshot",
  "project_display_name", "om_booking_id", "om_package_id"]);

/**
 * ชุดข้อมูลเอกสารของใบ O&M — "รูปเดียวกับ" ของฝั่งขาย เพื่อใช้ตัวสร้าง PDF / ขั้นอนุมัติตัวเดียวกันได้ทั้งก้อน
 * ★ ไม่เรียก buildQuotationDocumentSnapshot ของฝั่งขาย เพราะมัน JOIN packages ของฝั่งขายแล้วเลือกคอลัมน์
 *   แพ็กเกจขาย (kwp, term_set_profile …) — ใบ O&M ไม่มีแพ็กเกจขาย และถ้าฐานไหนขาดคอลัมน์ของแพ็กเกจขาย
 *   (เจอจริง 24 ก.ย. 69: solardb_v3 ไม่มี packages.term_set_profile) การส่งอนุมัติ O&M จะพังตามไปด้วย
 * ★ ต่างจากของฝั่งขาย 3 จุด
 *   ① ใส่แพ็กเกจ O&M เป็นแถวแรกของตาราง — ใบ O&M ไม่มี package_id ตัวเรนเดอร์จึงไม่วาดแถวแพ็กเกจให้
 *   ② จำนวน/หน่วยต่อท้ายชื่อรายการ — ตัวเรนเดอร์พิมพ์รายการเพิ่มแค่ชื่อ + ยอด ("เปลี่ยนสาย MC4 2 จุด")
 *   ③ ข้อความท้ายใบเป็นของ O&M (omLegalContent) · package ว่าง · ข้อมูลการเงินค่าไฟเป็นค่าตั้งต้น (ไม่ได้ใช้)
 */
export async function buildOmQuoteSnapshot(quotationId: number, tx?: Transaction): Promise<QuotationDocumentSnapshot | null> {
  const req = tx ? new sql.Request(tx) : (await getDb()).request();
  const r = await req.input("id", sql.Int, quotationId).query(`
    SELECT l.*, q.*,
      l.full_name customer_name, l.phone customer_phone, l.email customer_email,
      COALESCE(NULLIF(l.project_alias, N''), NULLIF(l.project_name, N''), pr.name) project_display_name,
      creator.full_name created_by_name, creator.job_title created_by_title
    FROM quotations q
    JOIN leads l ON l.id = q.lead_id
    LEFT JOIN projects pr ON pr.id = l.project_id
    LEFT JOIN users creator ON creator.id = q.created_by
    WHERE q.id = @id AND q.om_booking_id IS NOT NULL;
    SELECT TOP 1 * FROM lead_data WHERE lead_id = (SELECT lead_id FROM quotations WHERE id = @id);
    SELECT source_type, package_item_id, item_name_snapshot, quantity, unit, unit_price, line_total, sort_order
      FROM quotation_items WHERE quotation_id = @id ORDER BY sort_order, id;
    SELECT [key], value FROM app_settings
     WHERE [key] IN ('bank_account_bank','bank_account_branch','bank_account_number','bank_account_name');`);
  const sets = r.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const row = sets[0]?.[0];
  if (!row) return null;
  const q: Record<string, unknown> = {};
  const lead: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (key.includes("signature_data") || key === "document_snapshot_json" || key === "financial_snapshot_json") continue;
    if (QUOTE_KEYS.has(key)) q[key] = value;
    else if (!key.startsWith("approval_") && !key.startsWith("approver_") && !key.startsWith("sent_to_customer_")) lead[key] = value;
  }
  const withQty = (it: Record<string, unknown>) => {
    const qty = Number(it.quantity) || 0;
    const unit = String(it.unit ?? "").trim();
    const name = String(it.item_name_snapshot ?? "");
    return qty !== 1 || unit ? { ...it, item_name_snapshot: `${name} ${qty.toLocaleString("th-TH")}${unit ? ` ${unit}` : ""}` } : it;
  };
  const pkgPrice = Number(q.package_price_snapshot) || 0;
  const pkgRow = pkgPrice > 0
    ? [{ source_type: "custom", package_item_id: null, item_name_snapshot: String(q.package_name_snapshot ?? "Package O&M"),
         quantity: 1, unit: null, unit_price: pkgPrice, line_total: pkgPrice, sort_order: 0 }]
    : [];
  return {
    version: QUOTATION_DOCUMENT_VERSION,
    generated_at: new Date().toISOString(),
    quotation: q,
    lead,
    lead_data: sets[1]?.[0] || {},
    package: {},
    items: [...pkgRow, ...(sets[2] || []).map(withQty)],
    settings: Object.fromEntries((sets[3] || []).map((s) => [String(s.key), String(s.value || "")])),
    financial: calculateFinancialSnapshot(parseDocumentInputs(null), q, {}),
    legal: omLegalContent(q.terms_text, q.valid_days),
  };
}

/** ตรวจก่อนส่งอนุมัติ — แทน validateQuotationDocument ของฝั่งขายที่บังคับวันสำรวจ/ค่าไฟ/ผลผลิต */
export function validateOmQuoteSnapshot(snap: QuotationDocumentSnapshot): string[] {
  const errors: string[] = [];
  const q = snap.quotation;
  if (!String(snap.lead.full_name ?? "").trim()) errors.push("ไม่พบชื่อลูกค้า");
  if (!String(q.doc_no ?? "").trim()) errors.push("ไม่พบเลขใบเสนอราคา");
  if (!(Number(q.subtotal_incl_vat) > 0)) errors.push("ยอดใบเสนอราคาเป็น 0 — เลือก Package O&M หรือใส่ราคารายการ");
  return errors;
}
