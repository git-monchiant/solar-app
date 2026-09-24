import "server-only";
import type { Transaction } from "mssql";
import { sql } from "@/lib/db";
import { calculateQuotation, type QuotationInputItem } from "@/lib/quotation";
import type { QuotationPaymentTerm } from "@/lib/quotation-terms";

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
