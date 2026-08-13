import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { resolvePackagePrice, syncActivePricePeriods } from "@/lib/package-prices";
import { calculateQuotation, canManageQuotation, getQuotationActor, nextQuotationDocNo, parseQuotationAddOnItems, parseQuotationPackageItems, type QuotationInputItem } from "@/lib/quotation";
import { logLeadActivity } from "@/lib/lead-activity-log";
import { parseDocumentInputs } from "@/lib/quotation-document";
import { getQuotationPaymentTermsTotal, parseQuotationPaymentTerms } from "@/lib/quotation-terms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req); if (gate.error) return gate.error;
  const { id } = await params;
  const db = await getDb();
  const result = await db.request().input("lead_id", sql.Int, Number(id)).query(`
    SELECT q.*, p.name package_current_name, u.full_name created_by_name,
      submitter.full_name submitted_by_name,
      solar_approver.full_name solar_approved_by_name,
      COALESCE(q.approver_name_snapshot, sales_approver.full_name) approved_by_name,
      returned_by.full_name returned_by_name,
      reminder.reminded_at last_reminded_at,
      reminder_user.full_name last_reminded_by_name,
      CASE
        WHEN returned_event.action = 'changes_required_solar' THEN 'Solar Manager'
        WHEN returned_event.action = 'changes_required_sales' THEN 'Sale Manager'
        WHEN returned_event.id IS NOT NULL THEN 'ผู้อนุมัติ'
        ELSE NULL
      END returned_by_role
    FROM quotations q
    LEFT JOIN packages p ON p.id=q.package_id
    LEFT JOIN users u ON u.id=q.created_by
    LEFT JOIN users submitter ON submitter.id=q.submitted_by
    LEFT JOIN users solar_approver ON solar_approver.id=q.solar_approved_by
    LEFT JOIN users sales_approver ON sales_approver.id=q.approved_by
    OUTER APPLY (
      SELECT TOP 1 e.id, e.action, e.acted_by
      FROM quotation_approval_events e
      WHERE e.quotation_id = q.id AND e.to_status = 'changes_required'
      ORDER BY e.acted_at DESC, e.id DESC
    ) returned_event
    LEFT JOIN users returned_by ON returned_by.id = returned_event.acted_by
    OUTER APPLY (
      SELECT TOP 1 r.reminded_at, r.reminded_by
      FROM quotation_approval_reminders r
      WHERE r.quotation_id = q.id
        AND r.approval_stage = CASE
          WHEN q.status = 'pending_solar_sup' THEN 'solar_sup'
          WHEN q.status IN ('pending_sales_sup', 'pending_approval') THEN 'sales_sup'
          ELSE ''
        END
      ORDER BY r.reminded_at DESC, r.id DESC
    ) reminder
    LEFT JOIN users reminder_user ON reminder_user.id = reminder.reminded_by
    WHERE q.lead_id=@lead_id ORDER BY q.option_no, q.revision_no DESC;
    SELECT qi.*, pi.package_id source_package_id
    FROM quotation_items qi
    JOIN quotations q ON q.id=qi.quotation_id
    LEFT JOIN package_items pi ON pi.id=qi.package_item_id
    WHERE q.lead_id=@lead_id ORDER BY qi.quotation_id, qi.sort_order, qi.id;
  `);
  const recordsets = result.recordsets as unknown as Array<typeof result.recordset>;
  const items = recordsets[1] || [];
  return NextResponse.json(fixDates((recordsets[0] || []).map(q => {
    const safe = { ...q, items: items.filter(i => i.quotation_id === q.id) };
    delete safe.approver_signature_data_snapshot;
    return safe;
  })));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await syncActivePricePeriods();   // ราคาแพ็กเกจต้องเป็นของช่วงที่ถึงกำหนดแล้ว ก่อน snapshot ลงใบเสนอราคา
  const gate = await requireAuth(req); if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor || !canManageQuotation(actor.roles)) return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างใบเสนอราคา" }, { status: 403 });
  const { id } = await params; const leadId = Number(id); const body = await req.json();
  const optionNo = Number(body.option_no); const packageId = Number(body.package_id) || null;
  if (![1,2,3].includes(optionNo)) return NextResponse.json({ error: "กรุณาระบุชุด 1-3" }, { status: 400 });
  const customItems: QuotationInputItem[] = parseQuotationAddOnItems(body.items);
  // No main package chosen? Promote the first package-type add-on to be the main
  // package so its equipment detail lines render like a main package.
  let effectivePackageId = packageId;
  let addonItems = customItems;
  if (!effectivePackageId) {
    const promoteIdx = customItems.findIndex((i) => i.source_package_id);
    if (promoteIdx >= 0) {
      effectivePackageId = customItems[promoteIdx].source_package_id!;
      addonItems = customItems.filter((_, idx) => idx !== promoteIdx);
    }
  }
  // Package หลักเป็นตัวเลือก — แต่ต้องมีอย่างน้อย package หรือ 1 รายการเพิ่มเติม
  if (!effectivePackageId && addonItems.length === 0) return NextResponse.json({ error: "กรุณาเลือก Package หลัก หรือเพิ่มรายการอย่างน้อย 1 รายการ" }, { status: 400 });
  const paymentTerms = parseQuotationPaymentTerms(body.payment_terms);
  if (getQuotationPaymentTermsTotal(paymentTerms) !== 100) return NextResponse.json({ error: "ยอดรวมงวดชำระเงินต้องเท่ากับ 100%" }, { status: 400 });
  const db = await getDb(); const tx = new sql.Transaction(db);
  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const lead = await new sql.Request(tx).input("id", sql.Int, leadId).query(`
      SELECT l.id, l.assigned_user_id, l.pre_survey_fee_type,
        CASE WHEN l.pre_survey_fee_type = 'free' THEN 0
        WHEN l.payment_confirmed = 1 THEN COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.lead_id = l.id AND p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
        ), l.pre_total_price, 0) ELSE 0 END AS confirmed_deposit
      FROM leads l WHERE l.id=@id
    `);
    if (!lead.recordset[0]) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบ Lead" }, { status: 404 }); }
    // Ownership guard removed — any QUOTATION_MANAGE_ROLES member may create for any lead.
    const existing = await new sql.Request(tx).input("lead_id", sql.Int, leadId).input("option_no", sql.Int, optionNo).query(`SELECT TOP 1 id,status,revision_no FROM quotations WHERE lead_id=@lead_id AND option_no=@option_no ORDER BY revision_no DESC`);
    if (existing.recordset[0] && existing.recordset[0].status !== "cancelled") { await tx.rollback(); return NextResponse.json({ error: "ชุดนี้มีใบเสนอราคาแล้ว กรุณาแก้ไขใบเดิม" }, { status: 409 }); }
    const revisionNo = existing.recordset[0]
      ? Number(existing.recordset[0].revision_no) + 1
      : 0;
    const packageRow = effectivePackageId ? (await new sql.Request(tx).input("package_id", sql.Int, effectivePackageId).query(`SELECT * FROM packages WHERE id=@package_id AND is_active=1`)).recordset[0] : null;
    if (effectivePackageId && !packageRow) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบ Package ที่ใช้งานได้" }, { status: 400 }); }
    const submittedPackageItems = parseQuotationPackageItems(body.package_items);
    const packageItemRows = effectivePackageId
      ? submittedPackageItems ?? (await new sql.Request(tx).input("package_id", sql.Int, effectivePackageId).query(`SELECT * FROM package_items WHERE package_id=@package_id AND is_active=1 ORDER BY sort_order,id`)).recordset
      : [];
    const templateId = Number(body.payment_template_id) || null;
    const discountType = body.discount_type === "percent" ? "percent" : "amount";
    const confirmedDeposit = Math.max(0, Number(lead.recordset[0].confirmed_deposit) || 0);
    const depositPaid = lead.recordset[0].pre_survey_fee_type === "free"
      ? 0
      : Math.max(confirmedDeposit, Number(body.deposit_paid_amount) || 0);
    // ผู้ใช้เลือกช่วงราคาของ package ได้ (dropdown) — ตรวจว่าเป็นราคาที่มีจริงก่อนใช้
    const packagePrice = await resolvePackagePrice(new sql.Request(tx), effectivePackageId, body.package_price, Number(packageRow?.price) || 0, leadId);
    const totals = calculateQuotation(packagePrice, addonItems, discountType, Number(body.discount_value), depositPaid, 7);
    const documentInputs = parseDocumentInputs(body.document_inputs);
    const docNo = await nextQuotationDocNo(tx);
    const inserted = await new sql.Request(tx)
      .input("lead_id", sql.Int, leadId).input("option_no", sql.TinyInt, optionNo).input("revision_no", sql.Int, revisionNo).input("doc_no", sql.NVarChar(30), docNo)
      .input("package_id", sql.Int, effectivePackageId).input("package_name", sql.NVarChar(200), packageRow?.name || "").input("package_price", sql.Decimal(12,2), packagePrice)
      .input("issue_date", sql.Date, toSqlDate(body.issue_date) || new Date()).input("valid_days", sql.Int, Number(body.valid_days) || 7)
      .input("subtotal", sql.Decimal(12,2), totals.subtotal).input("discount_label", sql.NVarChar(200), body.discount_label || null)
      .input("discount_type", sql.NVarChar(10), discountType).input("discount_value", sql.Decimal(12,2), Number(body.discount_value)||0).input("discount_amount", sql.Decimal(12,2), totals.discountAmount)
      .input("discount_reason", sql.NVarChar(500), body.discount_reason || null).input("total", sql.Decimal(12,2), totals.total)
      .input("deposit", sql.Decimal(12,2), totals.deposit).input("outstanding", sql.Decimal(12,2), totals.outstanding)
      .input("before_vat", sql.Decimal(12,2), totals.beforeVat).input("vat_amount", sql.Decimal(12,2), totals.vatAmount)
      .input("template_id", sql.Int, templateId).input("payment_terms", sql.NVarChar(sql.MAX), JSON.stringify(paymentTerms))
      .input("terms_text", sql.NVarChar(sql.MAX), body.terms_text || null).input("note", sql.NVarChar(sql.MAX), body.note || null)
      .input("document_inputs", sql.NVarChar(sql.MAX), JSON.stringify(documentInputs)).input("user_id", sql.Int, gate.userId)
      .query(`INSERT quotations(lead_id,option_no,revision_no,doc_no,package_id,package_name_snapshot,package_price_snapshot,issue_date,valid_days,subtotal_incl_vat,discount_label,discount_type,discount_value,discount_amount,discount_reason,contract_total_incl_vat,deposit_paid_amount,outstanding_amount,amount_before_vat,vat_amount,payment_template_id,payment_terms_json,terms_text,note,document_inputs_json,created_by,updated_by)
      OUTPUT INSERTED.* VALUES(@lead_id,@option_no,@revision_no,@doc_no,@package_id,@package_name,@package_price,@issue_date,@valid_days,@subtotal,@discount_label,@discount_type,@discount_value,@discount_amount,@discount_reason,@total,@deposit,@outstanding,@before_vat,@vat_amount,@template_id,@payment_terms,@terms_text,@note,@document_inputs,@user_id,@user_id)`);
    const quotationId = inserted.recordset[0].id;
    let sort = 0;
    for (const item of packageItemRows) await new sql.Request(tx).input("qid",sql.Int,quotationId).input("pid",sql.Int,item.package_item_id ?? item.id ?? null).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,package_item_id,item_name_snapshot,quantity,unit,sort_order) VALUES(@qid,'package',@pid,@name,@qty,@unit,@sort)`);
    for (const item of addonItems) await new sql.Request(tx).input("qid",sql.Int,quotationId).input("source",sql.NVarChar(20),item.source_type).input("piid",sql.Int,item.package_item_id??null).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("price",sql.Decimal(12,2),item.unit_price).input("total",sql.Decimal(12,2),item.source_type==="addon_package"?item.line_total||0:item.quantity*item.unit_price).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,package_item_id,item_name_snapshot,quantity,unit,unit_price,line_total,sort_order) VALUES(@qid,@source,@piid,@name,@qty,@unit,@price,@total,@sort)`);
    await logLeadActivity(tx,{leadId,activityType:"quotation",title:`สร้างใบเสนอราคา ${docNo} ชุด ${optionNo}`,note:packageRow?.name || "รายการเพิ่มเติม",userId:gate.userId});
    await tx.commit(); return NextResponse.json(inserted.recordset[0], { status: 201 });
  } catch (error) { try { await tx.rollback(); } catch {} console.error("POST quotation", error); return NextResponse.json({ error: error instanceof Error ? error.message : "สร้างใบเสนอราคาไม่สำเร็จ" }, { status: 500 }); }
}
