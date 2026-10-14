import "server-only";
import type { ConnectionPool, Transaction } from "mssql";
import { fixDates, getDb, sql } from "@/lib/db";
import { calculateQuotation, type QuotationInputItem } from "@/lib/quotation";
import {
  QUOTATION_DOCUMENT_VERSION, calculateFinancialSnapshot, parseDocumentInputs,
  type QuotationDocumentSnapshot,
} from "@/lib/quotation-document";
import type { QuotationPaymentTerm, QuotationTermTree } from "@/lib/quotation-terms";
import { omLegal, omServiceTitle, parseOmTerms, parseOmTitle } from "@/lib/om/om-terms";

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

/** ชุดใบเสนอราคาต่อใบงาน — สูงสุด 3 ชุดแบบฝั่งขาย (แผน 20261002-02) · ลูกค้าเลือก 1 ชุดที่ขั้น 02 */
export const OM_MAX_OPTIONS = 3;

/**
 * อ่านใบเสนอราคา O&M พร้อมรายการ — ใบเดียว (id) หรือทุกใบของใบงาน (bookingId)
 * ★ latest_id = ใบล่าสุด **ของชุดเดียวกัน** (Revision นับในชุด) — เดิมนับทั้งใบงานตอนมีชุดเดียว
 */
export async function readOmQuotes(db: ConnectionPool, by: { id: number } | { bookingId: number }) {
  const where = "id" in by ? "q.id = @v" : "q.om_booking_id = @v";
  const r = await db.request().input("v", sql.Int, "id" in by ? by.id : by.bookingId).query(`
    SELECT q.id, q.doc_no, q.option_no, q.revision_no, q.status, q.om_booking_id, q.lead_id, q.issue_date, q.valid_days,
           q.package_name_snapshot, q.package_price_snapshot, q.subtotal_incl_vat, q.discount_value,
           q.discount_amount, q.discount_reason, q.contract_total_incl_vat, q.amount_before_vat, q.vat_amount,
           q.terms_text, q.note, q.created_at, q.updated_at, cu.full_name created_by_name,
           b.house_id, q.om_package_id,
           -- ลำดับอนุมัติ Solar Sup → Sale Sup (เฟส 3) — ชุดคอลัมน์เดียวกับฝั่งขาย
           q.submitted_at, q.solar_approved_at, q.solar_approval_note, su.full_name solar_approved_by_name,
           q.approved_at, q.approval_note, au.full_name approved_by_name,
           -- ราง Sale → Solar Manager → Sale Manager บนการ์ด (แผน 20261002-01) — ชุดเดียวกับรายการใบฝั่งขาย
           sb.full_name submitted_by_name, rb.full_name returned_by_name,
           CASE
             WHEN re.action = 'changes_required_solar' THEN 'Solar Manager'
             WHEN re.action = 'changes_required_sales' THEN 'Sale Manager'
             WHEN re.id IS NOT NULL THEN 'ผู้อนุมัติ'
           END returned_by_role,
           -- ลูกค้าเลือกใบนี้ (ปุ่มลูกค้าเลือกชุดนี้ = /send จดเวลาที่ใบ · แผน 20261002-02)
           q.sent_to_customer_at, q.document_inputs_json,
           (SELECT MAX(q2.id) FROM quotations q2
             WHERE q2.om_booking_id = q.om_booking_id AND q2.option_no = q.option_no) latest_id
      FROM quotations q
      JOIN om_bookings b ON b.id = q.om_booking_id
      LEFT JOIN users cu ON cu.id = q.created_by
      LEFT JOIN users su ON su.id = q.solar_approved_by
      LEFT JOIN users au ON au.id = q.approved_by
      LEFT JOIN users sb ON sb.id = q.submitted_by
      OUTER APPLY (
        SELECT TOP 1 e.id, e.action, e.acted_by FROM quotation_approval_events e
         WHERE e.quotation_id = q.id AND e.to_status = 'changes_required'
         ORDER BY e.acted_at DESC, e.id DESC
      ) re
      LEFT JOIN users rb ON rb.id = re.acted_by
     WHERE ${where} AND q.om_booking_id IS NOT NULL
     ORDER BY q.option_no, q.revision_no DESC, q.id DESC;
    SELECT qi.quotation_id, qi.id, qi.source_type, qi.item_name_snapshot item_name, qi.quantity, qi.unit, qi.unit_price, qi.line_total
      FROM quotation_items qi JOIN quotations q ON q.id = qi.quotation_id
     WHERE ${where} AND q.om_booking_id IS NOT NULL
     ORDER BY qi.sort_order, qi.id;`);
  const sets = r.recordsets as unknown as Record<string, unknown>[][];
  const items = fixDates(sets[1]);
  return fixDates(sets[0]).map(({ document_inputs_json: di, ...q }) => ({
    ...q,
    // เงื่อนไขที่แก้ในใบ (แผน 20261002-07) — ส่งเป็นต้นไม้ที่ล้างแล้ว ไม่ส่ง JSON ดิบ
    terms: parseOmTerms(di),
    // หัวรายการแพ็กเกจที่ Sale แก้ (แผน 20261014-04) — null = ยังไม่เคยแก้ หน้าจอเติมจากข้อมูลบ้าน
    doc_title: parseOmTitle(di),
    items: items.filter((x) => x.quotation_id === q.id).map(({ quotation_id: _, ...x }) => x),
  }));
}

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
 * ★ เฟส 5: งานชนิดที่ไม่ใช้สิทธิ์ (ซ่อม · consumes_quota = 0) ไม่เติม — ปิดงานชนิดนี้ไม่ตัดสิทธิ์
 *   เดิมเติม "สิทธิ์ซ่อม +1" ให้ทุกครั้งที่จ่าย แล้วไม่มีใครตัด ยอดค้าง +1 ตลอดไป · เงินอยู่ใน payments แล้ว
 */
export async function grantPurchasedRights(tx: Transaction, v: {
  houseId: number; serviceTypeId: number; omPackageId: number | null; docNo: string; actorUserId: number;
}): Promise<{ qty: number; grantId: number | null; skip?: "no_install" | "no_quota" }> {
  const inst = (await new sql.Request(tx).input("h", sql.Int, v.houseId)
    .query(`SELECT TOP 1 id FROM om_installations WHERE house_id = @h ORDER BY id`)).recordset[0];
  if (!inst) return { qty: 0, grantId: null, skip: "no_install" };
  const pkg = v.omPackageId
    ? (await new sql.Request(tx).input("id", sql.Int, v.omPackageId)
        .query(`SELECT kw_min, kw_max, plan_type, contract_months, visits FROM om_packages WHERE id = @id`)).recordset[0]
    : null;
  const contract = pkg?.plan_type === "contract";
  if (!contract) {
    const quota = (await new sql.Request(tx).input("t", sql.Int, v.serviceTypeId)
      .query(`SELECT CAST(consumes_quota AS int) q FROM om_service_type WHERE id = @t`)).recordset[0]?.q;
    if (quota === 0) return { qty: 0, grantId: null, skip: "no_quota" };
  }
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

/** SQL: ใบงาน alias `b` ได้รับเงินแล้ว (Account ยืนยัน confirmed_at) จากใบเสนอราคาใบใดใบหนึ่งของใบงาน
 *  ★ แผน 20261002-11: รับเช็คแล้ว (cheque_received_at) นับด้วย — ฝั่งขายให้ทำงานต่อได้เมื่อรับเช็ค เงินเข้ายืนยันทีหลัง */
export const OM_BOOKING_PAID_SQL = (b: string) => `EXISTS (
  SELECT 1 FROM quotations oq JOIN payments op
      ON op.lead_id = oq.lead_id AND op.slip_field = CONCAT(N'${OM_SLIP_PREFIX}', oq.id)
   WHERE oq.om_booking_id = ${b}.id AND (op.confirmed_at IS NOT NULL OR op.cheque_received_at IS NOT NULL))`;

/** SQL: แถวเงิน O&M (alias `p`) ที่ยังมีผล — เช็คเด้งเก็บแถวไว้เป็นหลักฐานแบบฝั่งขาย (cheque_status = 'bounced' · แผน 20261014-03)
 *  แต่ไม่นับเป็นสลิปที่แนบแล้ว/รอตรวจ ⇒ ทุกที่ที่ถาม "มีสลิปค้างไหม" ต้องกรองด้วยตัวนี้
 *  (ถาม "จ่ายแล้วไหม" ไม่ต้อง — เด้งแล้ว confirmed_at / cheque_received_at เป็น NULL อยู่แล้ว) */
export const OM_PAY_LIVE_SQL = (p: string) => `ISNULL(${p}.cheque_status, N'') <> N'bounced'`;

/** เช็คเด้งตอนใบงานอยู่ขั้นไหน ทำอะไร (แผน 20261014-03)
 *  · ยังไม่ถึงหน้างาน (รอยืนยันนัด/นัดแล้ว) = ดึงกลับขั้นชำระเงิน — กติกาเดิม "เก็บค่าบริการก่อนนัด" · หลุดปฏิทินเอง (กรองตามสถานะ)
 *  · ถึงหน้างานแล้ว (เข้างาน/รอปิด/ปิดงาน) = คงสถานะ งานเกิดไปแล้ว — แต่แนบหลักฐานชำระใหม่ได้ (POST /api/om/payments)
 *  ★ หน้าจอ (OmPaymentPanel) มีชุดเดียวกัน — ไฟล์นี้ server-only import ฝั่งนั้นไม่ได้ */
export const OM_BOUNCE_BACK_TO_PAYMENT = ["pending", "confirmed"];
export const OM_REPAY_AFTER_BOUNCE = ["progress", "checked", "closed"];

/** SQL: ขนาดระบบ + ยี่ห้ออินเวอร์เตอร์ของบ้าน alias `h` เป็นคอลัมน์ kwp_list / inverter_list
 *  ใช้ทั้งรายการงานบริการ (follow-sql → หน้าจอเติมหัวรายการ) และตัวสร้างเอกสาร (หัวรายการตั้งต้น · แผน 20261014-04) */
export const omHouseSystemSql = (h: string) => `
           (SELECT STRING_AGG(CAST(COALESCE(i.rem_size_kwp, i.promo_size_kw) AS varchar(12)), ' + ')
              FROM om_installations i WHERE i.house_id = ${h}.id
               AND COALESCE(i.rem_size_kwp, i.promo_size_kw) IS NOT NULL) kwp_list,
           (SELECT STRING_AGG(x.brand, ' + ') FROM (SELECT DISTINCT LTRIM(RTRIM(i.inverter_brand)) brand
              FROM om_installations i WHERE i.house_id = ${h}.id AND NULLIF(LTRIM(RTRIM(i.inverter_brand)), '') IS NOT NULL) x) inverter_list`;

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
  /** detail = บรรทัดรายละเอียดใต้หัวข้อก่อนหน้า (ไม่มีราคา · source_type custom_detail แบบงานเพิ่มฝั่งขาย · แผน 20261002-05)
   *  รายละเอียดที่อยู่ก่อนหัวข้องานเพิ่มตัวแรก = รายละเอียดของแพ็กเกจ (แถวแพ็กเกจสร้างตอนพิมพ์ ไม่ได้เก็บเป็นแถว) */
  items: { item_name: string; quantity: number; unit?: string | null; unit_price: number; detail: boolean }[];
  discount_value: number;
  discount_reason: string | null;
  note: string | null;
  /** วันที่ใบเสนอราคา YYYY-MM-DD (แผน 20261002-04 · ช่องเดียวกับ popup ฝั่งขาย) — null = คงเดิม / วันนี้ */
  issue_date: string | null;
  /** เงื่อนไข/ข้อกำหนดที่แก้ในใบ (แท็บเงื่อนไขของ popup · แผน 20261002-07) — null = ใช้ชุดจาก Package O&M */
  terms: QuotationTermTree | null;
  /** หัวรายการแพ็กเกจบนเอกสาร (แผน 20261014-04 · "งานบริการ O&M ระบบโซลาร์เซลล์ อินเวอร์เตอร์ … ขนาด … kW")
   *  null = พิมพ์ชื่อแพ็กเกจแบบเดิม · package_name_snapshot คงเป็นชื่อแพ็กเกจเสมอ (คิว Account / รายงาน / ประวัติใช้) */
  title: string | null;
};

/** วันนี้ตามเวลาไทย YYYY-MM-DD — ใช้กันวันที่ใบล่วงหน้า (ฝั่งขายกันที่หน้าจอด้วยเวลาเครื่อง) */
const todayBangkok = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

/** อ่าน + ตรวจ body ของฟอร์ม — ต้องมี Package O&M หรือรายการอย่างน้อย 1 แถว (กติกาเดียวกับฝั่งขาย) */
export function parseOmQuoteInput(body: Record<string, unknown>): OmQuoteInput | string {
  const pkg = Number(body.om_package_id) || null;
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => {
      const detail = x.detail === true || x.source_type === "custom_detail";
      return {
        item_name: String(x.item_name ?? "").trim().slice(0, 300),
        quantity: Math.max(0, Number(x.quantity) || 0),
        unit: x.unit ? String(x.unit).slice(0, 50) : null,
        // รายละเอียดไม่มีราคา — ยอดอยู่ที่หัวข้อ (ตัวพิมพ์ใบก็ไม่พิมพ์ยอดของบรรทัดรายละเอียด)
        unit_price: detail ? 0 : Math.max(0, Number(x.unit_price) || 0),
        detail,
      };
    })
    // รายละเอียดจำนวน 0 ได้ (พิมพ์แค่ชื่อ) · หัวข้อต้องมีจำนวน
    .filter((x) => x.item_name && (x.detail || x.quantity > 0));
  if (!pkg && !items.some((x) => !x.detail)) return "เลือก Package O&M หรือเพิ่มรายการอย่างน้อย 1 รายการ";
  if (!pkg && items[0]?.detail) return "รายละเอียดต้องอยู่ใต้หัวข้อ — เพิ่มแพ็กเกจหรืองานเพิ่มก่อน";
  const discount = Math.max(0, Number(body.discount_value) || 0);
  const reason = String(body.discount_reason ?? "").trim().slice(0, 500) || null;
  if (discount > 0 && !reason) return "ใส่เหตุผลของส่วนลดด้วย — Sale Sup ใช้ประกอบการอนุมัติ";
  const issueDate = body.issue_date ? String(body.issue_date).slice(0, 10) : null;
  if (issueDate && !/^\d{4}-\d{2}-\d{2}$/.test(issueDate)) return "วันที่ใบเสนอราคาไม่ถูกต้อง";
  if (issueDate && issueDate > todayBangkok()) return "วันที่ใบเสนอราคาต้องไม่เป็นวันที่ล่วงหน้า";
  return { om_package_id: pkg, items, discount_value: discount, discount_reason: reason,
           note: String(body.note ?? "").trim().slice(0, 2000) || null, issue_date: issueDate,
           terms: parseOmTerms(body.terms),
           title: pkg ? String(body.doc_title ?? "").trim().slice(0, 300) || null : null };
}

/** document_inputs_json ของใบ O&M — เงื่อนไขที่แก้ + หัวรายการ · ไม่มีทั้งสองอย่าง = NULL */
const omDocInputsJson = (input: Pick<OmQuoteInput, "terms" | "title">) =>
  input.terms || input.title
    ? JSON.stringify({ ...(input.terms ? { terms: input.terms } : {}), ...(input.title ? { title: input.title } : {}) })
    : null;

/**
 * ป้ายแถวส่วนลดบนใบ (quotations.discount_label — ตัวพิมพ์ใบใช้แทนคำว่า "ส่วนลด" แบบฝั่งขาย · ผู้ใช้ขอ 2 ต.ค. 69)
 * O&M มีช่องเดียว "ชื่อส่วนลด" = discount_reason (Sale Sup ใช้อนุมัติด้วย) ⇒ ป้ายใช้ค่าเดียวกัน · ไม่มีส่วนลด = ว่าง
 * ★ คอลัมน์ป้ายยาว 200 ตัว (ช่องฝั่งขายก็จำกัด 200) — เหตุผลเก็บได้ 500 จึงตัดเฉพาะป้าย
 */
const omDiscountLabel = (input: Pick<OmQuoteInput, "discount_reason">, discountAmount: number) =>
  discountAmount > 0 && input.discount_reason ? input.discount_reason.slice(0, 200) : null;

/** terms_text ที่แช่ในใบ = หมายเหตุ Package O&M ทีละบรรทัด (omTermTreeFromText อ่านกลับเป็นหัวข้อ "หมายเหตุ")
 *  ★ แผน 20261014-04: เลิกต่อ "ขอบเขตงาน: …" — ขอบเขตงานอยู่เป็นรายละเอียดใต้แพ็กเกจในตารางแล้ว */
const omTermsText = (notes: string[]) => notes.map((b, i) => `${i + 1}. ${b}`).join("\n");

/**
 * แถวรายการบนเอกสาร O&M — ใช้ทั้งใบจริง (buildOmQuoteSnapshot) และตัวอย่างก่อนบันทึก (buildOmPreviewSnapshot)
 *   ① แพ็กเกจ O&M เป็นแถวแรก — ใบ O&M ไม่มี package_id ตัวเรนเดอร์จึงไม่วาดแถวแพ็กเกจให้
 *      ชื่อแถว = หัวรายการที่ Sale แก้ (แผน 20261014-04) ไม่มี = หัวรายการตั้งต้นจากข้อมูลบ้าน (omServiceTitle)
 *   ② จำนวน/หน่วยต่อท้ายชื่อรายการ — ตัวเรนเดอร์พิมพ์รายการเพิ่มแค่ชื่อ + ยอด ("เปลี่ยนสาย MC4 2 จุด")
 *   ③ บรรทัดรายละเอียด (custom_detail) ไม่ต่อท้าย — ตัวเรนเดอร์ต่อ "- ชื่อ จำนวน หน่วย" ให้เองอยู่แล้ว (แผน 20261002-05)
 */
function omDocumentItems(pkgName: unknown, pkgPrice: number, items: Record<string, unknown>[]) {
  const withQty = (it: Record<string, unknown>) => {
    const qty = Number(it.quantity) || 0;
    const unit = String(it.unit ?? "").trim();
    const name = String(it.item_name_snapshot ?? "");
    if (it.source_type === "custom_detail") return it;
    // "1 งาน" = หน่วยตั้งต้นของงานเพิ่ม ไม่ได้บอกอะไร — ฝั่งขายก็พิมพ์งานเพิ่มแค่ชื่อ (ผู้ใช้ตรวจ PDF 2 ต.ค. 69)
    if (qty === 1 && unit === "งาน") return it;
    return qty !== 1 || unit ? { ...it, item_name_snapshot: `${name} ${qty.toLocaleString("th-TH")}${unit ? ` ${unit}` : ""}` } : it;
  };
  const pkgRow = pkgPrice > 0
    ? [{ source_type: "custom", package_item_id: null, item_name_snapshot: String(pkgName ?? "Package O&M"),
         quantity: 1, unit: null, unit_price: pkgPrice, line_total: pkgPrice, sort_order: 0 }]
    : [];
  return [...pkgRow, ...items.map(withQty)];
}

/**
 * ที่อยู่/โครงการบนใบ — lead ของบ้าน O&M (om_only) มักไม่มีที่อยู่ติดตั้ง ใบเลยขึ้น "ที่อยู่ : -"
 * (ผู้ใช้ตรวจ PDF 2 ต.ค. 69) ⇒ เติมจากทะเบียนบ้าน O&M แบบเดียวกับใบเสร็จ O&M (receipt/data ทาง om)
 * เติมเฉพาะช่องที่ว่าง — lead ที่มีข้อมูลอยู่แล้ว (บ้านที่ใช้ lead ร่วมกับฝั่งขาย) ใช้ของเดิม
 */
function fillFromHouse(q: Record<string, unknown>, lead: Record<string, unknown>, h: Record<string, unknown> | undefined) {
  if (!h) return;
  if (!String(lead.installation_address ?? "").trim()) {
    const addr = [h.house_number ? `บ้านเลขที่ ${h.house_number}` : null, h.address].filter(Boolean).join(" ");
    if (addr) lead.installation_address = addr;
  }
  if (!String(q.project_display_name ?? "").trim() && h.project_name) q.project_display_name = h.project_name;
}

const OM_BANK_SETTINGS_SQL = `SELECT [key], value FROM app_settings
     WHERE [key] IN ('bank_account_bank','bank_account_branch','bank_account_number','bank_account_name')`;

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

  const lines: QuotationInputItem[] = input.items.map(({ detail, ...x }) => ({ ...x, source_type: detail ? "custom_detail" : "custom" }));
  const pkgPrice = pkg ? Number(pkg.price) : 0;
  const t = calculateQuotation(pkgPrice, lines, "amount", input.discount_value, 0, 7);
  const notes = (await new sql.Request(tx).query(`SELECT body FROM om_package_notes ORDER BY sort_order, id`)).recordset
    .map((r) => String(r.body));

  await new sql.Request(tx)
    .input("id", sql.Int, quotationId)
    .input("om_pkg", sql.Int, pkg ? Number(pkg.id) : null)
    .input("pkg_name", sql.NVarChar(200), pkg ? omPackageLabel(pkg) : "งานบริการ O&M")
    .input("pkg_price", sql.Decimal(12, 2), pkgPrice)
    .input("subtotal", sql.Decimal(12, 2), t.subtotal)
    .input("dv", sql.Decimal(12, 2), input.discount_value)
    .input("da", sql.Decimal(12, 2), t.discountAmount)
    .input("dr", sql.NVarChar(500), input.discount_reason)
    .input("dl", sql.NVarChar(200), omDiscountLabel(input, t.discountAmount))
    .input("total", sql.Decimal(12, 2), t.total)
    .input("outstanding", sql.Decimal(12, 2), t.outstanding)
    .input("before_vat", sql.Decimal(12, 2), t.beforeVat)
    .input("vat", sql.Decimal(12, 2), t.vatAmount)
    .input("terms", sql.NVarChar(sql.MAX), JSON.stringify(OM_PAYMENT_TERMS))
    .input("terms_text", sql.NVarChar(sql.MAX), omTermsText(notes))
    .input("note", sql.NVarChar(sql.MAX), input.note)
    .input("idate", sql.NVarChar(10), input.issue_date)
    // ที่เดียวกับที่ฝั่งขายเก็บเงื่อนไขที่แก้ (document_inputs_json.terms) + หัวรายการ (.title) · ไม่มีทั้งคู่ = NULL
    .input("di", sql.NVarChar(sql.MAX), omDocInputsJson(input))
    .input("u", sql.Int, actorUserId)
    .query(`UPDATE quotations SET
              issue_date = COALESCE(CAST(@idate AS DATE), issue_date, CAST(GETDATE() AS DATE)),
              document_inputs_json = @di,
              om_package_id = @om_pkg, package_id = NULL,
              package_name_snapshot = @pkg_name, package_price_snapshot = @pkg_price,
              subtotal_incl_vat = @subtotal, discount_type = 'amount', discount_value = @dv,
              discount_amount = @da, discount_reason = @dr, discount_label = @dl, contract_total_incl_vat = @total,
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
      .input("st", sql.NVarChar(30), x.source_type === "custom_detail" ? "custom_detail" : "custom")
      .query(`INSERT INTO quotation_items (quotation_id, source_type, item_name_snapshot, quantity, unit, unit_price, line_total, sort_order)
              VALUES (@q, @st, @name, @qty, @unit, @price, @total, @sort)`);
  }
  return { total: t.total };
}

// ── เอกสาร / การส่งอนุมัติ (เฟส 3) ─────────────────────────────────────────

// ข้อความท้ายใบของงาน O&M — ย้ายไปเป็นต้นไม้แบบฝั่งขายที่ lib/om/om-terms.ts (omLegal · แผน 20261002-07)
//   แก้/เพิ่ม/ลดได้ในแท็บเงื่อนไขของ popup (เก็บ document_inputs_json.terms) · ไม่แก้ = ชุดจาก terms_text เดิม

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
 *   ③ ข้อความท้ายใบเป็นของ O&M (omLegal — ชุดที่แก้ในใบ หรือชุดจาก terms_text) · package ว่าง · ข้อมูลการเงินค่าไฟเป็นค่าตั้งต้น (ไม่ได้ใช้)
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
    ${OM_BANK_SETTINGS_SQL};
    SELECT h.house_number, h.address, COALESCE(pj.name_th, h.project_name) project_name, ${omHouseSystemSql("h")}
      FROM quotations q JOIN om_bookings b ON b.id = q.om_booking_id JOIN om_houses h ON h.id = b.house_id
      LEFT JOIN om_projects pj ON pj.project_id = h.project_id
     WHERE q.id = @id;`);
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
  const house = sets[4]?.[0];
  fillFromHouse(q, lead, house);
  return {
    version: QUOTATION_DOCUMENT_VERSION,
    generated_at: new Date().toISOString(),
    quotation: q,
    lead,
    lead_data: sets[1]?.[0] || {},
    package: {},
    // ใบที่ไม่มีหัวรายการ (หน้าจอเปิดค้างก่อนแผน 20261014-04 / ใบร่างเก่า) = หัวรายการตั้งต้นจากข้อมูลบ้าน
    items: omDocumentItems(parseOmTitle(row.document_inputs_json) ?? omServiceTitle(house?.kwp_list, house?.inverter_list),
      Number(q.package_price_snapshot) || 0, sets[2] || []),
    settings: Object.fromEntries((sets[3] || []).map((s) => [String(s.key), String(s.value || "")])),
    financial: calculateFinancialSnapshot(parseDocumentInputs(null), q, {}),
    legal: omLegal(q.terms_text, q.valid_days, row.document_inputs_json),
  };
}

/**
 * ตัวอย่างก่อนบันทึก — ปุ่ม "ดูตัวอย่าง" ใน popup ทำใบเสนอราคา (แผน 20261002-04 · แบบฝั่งขาย)
 * ชุดข้อมูลรูปเดียวกับ buildOmQuoteSnapshot แต่คิดจากค่าในฟอร์ม (ยังไม่มี/ยังไม่ได้แก้แถวใน quotations)
 * ยอดเงินคิดด้วย calculateQuotation + แถวรายการ/ข้อความท้ายใบด้วยตัวช่วยตัวเดียวกับตอนบันทึก ⇒ ตัวอย่างตรงกับใบจริง
 * ★ บ้านที่ยังไม่มี lead (ใบแรก ensureOmLead ยังไม่สร้าง) ใช้ชื่อลูกค้าปัจจุบัน/ที่อยู่ของบ้านแทน
 * ★ คืน detail.om_booking_id = 0 (ไม่ใช่ null) — หน้า GET ของ quotation-pdf ใช้ค่านี้แยกทาง O&M (ไม่แนบรายงานสำรวจ)
 */
export async function buildOmPreviewSnapshot(houseId: number, input: OmQuoteInput,
  opts: { docNo?: string | null; validDays?: number | null; actorUserId: number }) {
  const db = await getDb();
  const pkg = input.om_package_id
    ? (await db.request().input("id", sql.Int, input.om_package_id)
        .query(`SELECT id, kw_min, kw_max, plan_type, contract_months, visits, price, scope
                  FROM om_packages WHERE id = @id AND is_active = 1`)).recordset[0]
    : null;
  if (input.om_package_id && !pkg) throw new Error("ไม่พบ Package O&M ที่ใช้งานได้");
  const pkgPrice = pkg ? Number(pkg.price) : 0;
  const lines: QuotationInputItem[] = input.items.map(({ detail, ...x }) => ({ ...x, source_type: detail ? "custom_detail" : "custom" }));
  const t = calculateQuotation(pkgPrice, lines, "amount", input.discount_value, 0, 7);

  const r = await db.request().input("h", sql.Int, houseId).input("u", sql.Int, opts.actorUserId).query(`
    SELECT h.id, h.lead_id, h.house_number, h.address, h.full_name,
           COALESCE(pj.name_th, h.project_name) project_name,
           (SELECT TOP 1 c.full_name FROM om_house_customers hc JOIN om_customers c ON c.id = hc.customer_id
             WHERE hc.house_id = h.id AND hc.is_current = 1
             ORDER BY CASE hc.role WHEN 'owner' THEN 0 ELSE 1 END, hc.id) customer_name,
           (SELECT TOP 1 p.phone FROM om_house_customers hc
             JOIN om_customer_phones p ON p.customer_id = hc.customer_id
            WHERE hc.house_id = h.id AND hc.is_current = 1 AND p.status <> 'invalid'
            ORDER BY p.is_primary DESC, p.id) phone, ${omHouseSystemSql("h")}
      FROM om_houses h LEFT JOIN om_projects pj ON pj.project_id = h.project_id
     WHERE h.id = @h;
    SELECT body FROM om_package_notes ORDER BY sort_order, id;
    ${OM_BANK_SETTINGS_SQL};
    SELECT full_name, job_title FROM users WHERE id = @u;`);
  const sets = r.recordsets as unknown as Array<Array<Record<string, unknown>>>;
  const h = sets[0]?.[0];
  if (!h) throw new Error("ไม่พบบ้านหลังนี้ในทะเบียน O&M");

  let lead: Record<string, unknown> = {
    full_name: h.customer_name || h.full_name || `บ้าน ${h.house_number ?? h.id}`,
    phone: h.phone ?? null, project_name: h.project_name ?? null,
    house_number: h.house_number ?? null, installation_address: null,
  };
  let leadData: Record<string, unknown> = {};
  let projectName = h.project_name ?? null;
  if (h.lead_id) {
    const lr = await db.request().input("l", sql.Int, Number(h.lead_id)).query(`
      SELECT l.*, l.full_name customer_name, l.phone customer_phone, l.email customer_email,
             COALESCE(NULLIF(l.project_alias, N''), NULLIF(l.project_name, N''), pr.name) project_display_name
        FROM leads l LEFT JOIN projects pr ON pr.id = l.project_id WHERE l.id = @l;
      SELECT TOP 1 * FROM lead_data WHERE lead_id = @l;`);
    const ls = lr.recordsets as unknown as Array<Array<Record<string, unknown>>>;
    if (ls[0]?.[0]) {
      lead = Object.fromEntries(Object.entries(ls[0][0]).filter(([k]) => !k.includes("signature_data")));
      projectName = (lead.project_display_name as string | null) ?? projectName;
      leadData = ls[1]?.[0] || {};
    }
  }

  const termsText = omTermsText((sets[1] || []).map((x) => String(x.body)));
  const validDays = Number(opts.validDays) || 7;
  const user = sets[3]?.[0] ?? {};
  const q: Record<string, unknown> = {
    id: 0, lead_id: h.lead_id ?? null, doc_no: opts.docNo || "ตัวอย่างก่อนบันทึก", revision_no: 0, status: "draft",
    package_id: null, om_package_id: pkg ? Number(pkg.id) : null, om_booking_id: 0,
    package_name_snapshot: pkg ? omPackageLabel(pkg) : "งานบริการ O&M", package_price_snapshot: pkgPrice,
    issue_date: input.issue_date || todayBangkok(), valid_days: validDays,
    subtotal_incl_vat: t.subtotal, discount_label: omDiscountLabel(input, t.discountAmount), discount_type: "amount",
    discount_value: input.discount_value, discount_amount: t.discountAmount, discount_reason: input.discount_reason,
    contract_total_incl_vat: t.total, deposit_paid_amount: 0, outstanding_amount: t.outstanding,
    vat_rate: 7, amount_before_vat: t.beforeVat, vat_amount: t.vatAmount,
    payment_terms_json: JSON.stringify(OM_PAYMENT_TERMS), terms_text: termsText, note: null,
    created_by_name: user.full_name ?? "-", created_by_title: user.job_title ?? null,
    project_display_name: projectName,
  };
  fillFromHouse(q, lead, h);
  const snapshot: QuotationDocumentSnapshot = {
    version: QUOTATION_DOCUMENT_VERSION,
    generated_at: new Date().toISOString(),
    quotation: q,
    lead,
    lead_data: leadData,
    package: {},
    items: omDocumentItems(input.title ?? omServiceTitle(h.kwp_list, h.inverter_list), pkgPrice, lines.map((x, i) => ({
      source_type: x.source_type, package_item_id: null, item_name_snapshot: x.item_name,
      quantity: x.quantity, unit: x.unit ?? null, unit_price: x.unit_price,
      line_total: Math.round(x.quantity * x.unit_price * 100) / 100, sort_order: i + 1,
    }))),
    settings: Object.fromEntries((sets[2] || []).map((s) => [String(s.key), String(s.value || "")])),
    financial: calculateFinancialSnapshot(parseDocumentInputs(null), q, {}),
    legal: omLegal(termsText, validDays, input.terms),
  };
  return { detail: q, snapshot };
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
