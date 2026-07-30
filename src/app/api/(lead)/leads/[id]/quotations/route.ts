import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { calculateQuotation, getQuotationActor, nextQuotationDocNo, type QuotationInputItem } from "@/lib/quotation";
import { logLeadActivity } from "@/lib/lead-activity-log";
import { parseDocumentInputs } from "@/lib/quotation-document";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req); if (gate.error) return gate.error;
  const { id } = await params;
  const db = await getDb();
  const result = await db.request().input("lead_id", sql.Int, Number(id)).query(`
    SELECT q.*, p.name package_current_name, u.full_name created_by_name,
      returned_by.full_name returned_by_name,
      CASE
        WHEN returned_event.action = 'changes_required_solar' THEN 'Solar Sup'
        WHEN returned_event.action = 'changes_required_sales' THEN 'Sale Sup'
        WHEN returned_event.id IS NOT NULL THEN 'ผู้อนุมัติ'
        ELSE NULL
      END returned_by_role
    FROM quotations q
    LEFT JOIN packages p ON p.id=q.package_id
    LEFT JOIN users u ON u.id=q.created_by
    OUTER APPLY (
      SELECT TOP 1 e.id, e.action, e.acted_by
      FROM quotation_approval_events e
      WHERE e.quotation_id = q.id AND e.to_status = 'changes_required'
      ORDER BY e.acted_at DESC, e.id DESC
    ) returned_event
    LEFT JOIN users returned_by ON returned_by.id = returned_event.acted_by
    WHERE q.lead_id=@lead_id ORDER BY q.option_no, q.revision_no DESC;
    SELECT qi.* FROM quotation_items qi JOIN quotations q ON q.id=qi.quotation_id
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
  const gate = await requireAuth(req); if (gate.error) return gate.error;
  const actor = await getQuotationActor(gate.userId);
  if (!actor || !actor.roles.some((r: string) => ["admin", "sales", "sales_sup"].includes(r))) return NextResponse.json({ error: "ไม่มีสิทธิ์สร้างใบเสนอราคา" }, { status: 403 });
  const { id } = await params; const leadId = Number(id); const body = await req.json();
  const optionNo = Number(body.option_no); const packageId = Number(body.package_id);
  if (![1,2,3].includes(optionNo) || !packageId) return NextResponse.json({ error: "กรุณาระบุชุด 1-3 และ Package หลัก" }, { status: 400 });
  const customItems: QuotationInputItem[] = Array.isArray(body.items) ? body.items.filter((i: QuotationInputItem) => i?.item_name?.trim()).map((i: QuotationInputItem) => ({ source_type: i.source_type === "addon" ? "addon" : "custom", item_name: String(i.item_name).trim(), quantity: Number(i.quantity) || 1, unit: i.unit || "ชุด", unit_price: Number(i.unit_price) || 0 })) : [];
  const db = await getDb(); const tx = new sql.Transaction(db);
  try {
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const lead = await new sql.Request(tx).input("id", sql.Int, leadId).query(`
      SELECT l.id, l.assigned_user_id,
        CASE WHEN l.payment_confirmed = 1 THEN COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.lead_id = l.id AND p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
        ), l.pre_total_price, 0) ELSE 0 END AS confirmed_deposit
      FROM leads l WHERE l.id=@id
    `);
    if (!lead.recordset[0]) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบ Lead" }, { status: 404 }); }
    if (!actor.roles.includes("admin") && lead.recordset[0].assigned_user_id !== gate.userId) { await tx.rollback(); return NextResponse.json({ error: "สร้างได้เฉพาะ Lead ที่รับผิดชอบ" }, { status: 403 }); }
    const existing = await new sql.Request(tx).input("lead_id", sql.Int, leadId).input("option_no", sql.Int, optionNo).query(`SELECT TOP 1 id,status,revision_no FROM quotations WHERE lead_id=@lead_id AND option_no=@option_no ORDER BY revision_no DESC`);
    if (existing.recordset[0] && existing.recordset[0].status !== "cancelled") { await tx.rollback(); return NextResponse.json({ error: "ชุดนี้มีใบเสนอราคาแล้ว กรุณาแก้ไขใบเดิม" }, { status: 409 }); }
    const revisionNo = existing.recordset[0]
      ? Number(existing.recordset[0].revision_no) + 1
      : 0;
    const pkg = await new sql.Request(tx).input("package_id", sql.Int, packageId).query(`SELECT * FROM packages WHERE id=@package_id AND is_active=1`);
    const packageRow = pkg.recordset[0]; if (!packageRow) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบ Package ที่ใช้งานได้" }, { status: 400 }); }
    const packageItems = await new sql.Request(tx).input("package_id", sql.Int, packageId).query(`SELECT * FROM package_items WHERE package_id=@package_id AND is_active=1 ORDER BY sort_order,id`);
    const templateId = Number(body.payment_template_id) || null;
    let paymentTerms = Array.isArray(body.payment_terms) ? body.payment_terms : null;
    if (!paymentTerms && templateId) { const t = await new sql.Request(tx).input("tid", sql.Int, templateId).query(`SELECT terms_json FROM quotation_payment_templates WHERE id=@tid AND is_active=1`); if (t.recordset[0]) paymentTerms = JSON.parse(t.recordset[0].terms_json); }
    if (!paymentTerms) paymentTerms = [{ label: "งวดที่ 1 ชำระ", percent: 20, due: "ภายใน 7 วัน นับจากวันที่ในใบเสนอราคา" }, { label: "งวดที่ 2 ชำระ", percent: 80, due: "ภายใน 3 วัน หลังติดตั้งแล้วเสร็จ" }];
    paymentTerms = paymentTerms.slice(0, 4);
    const paymentPercentTotal = paymentTerms.reduce((total: number, term: { percent?: unknown }) => total + Number(term.percent), 0);
    if (!paymentTerms.every((term: { percent?: unknown }) => Number.isFinite(Number(term.percent)) && Number(term.percent) >= 0 && Number(term.percent) <= 100) || paymentPercentTotal > 100) {
      await tx.rollback(); return NextResponse.json({ error: "ยอดเปอร์เซ็นต์เงื่อนไขชำระเงินรวมกันต้องไม่เกิน 100%" }, { status: 400 });
    }
    const discountType = body.discount_type === "percent" ? "percent" : "amount";
    const confirmedDeposit = Math.max(0, Number(lead.recordset[0].confirmed_deposit) || 0);
    const depositPaid = Math.max(confirmedDeposit, Number(body.deposit_paid_amount) || 0);
    const totals = calculateQuotation(Number(packageRow.price), customItems, discountType, Number(body.discount_value), depositPaid, 7);
    const documentInputs = parseDocumentInputs(body.document_inputs);
    const docNo = await nextQuotationDocNo(tx);
    const inserted = await new sql.Request(tx)
      .input("lead_id", sql.Int, leadId).input("option_no", sql.TinyInt, optionNo).input("revision_no", sql.Int, revisionNo).input("doc_no", sql.NVarChar(30), docNo)
      .input("package_id", sql.Int, packageId).input("package_name", sql.NVarChar(200), packageRow.name).input("package_price", sql.Decimal(12,2), packageRow.price)
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
    for (const item of packageItems.recordset) await new sql.Request(tx).input("qid",sql.Int,quotationId).input("pid",sql.Int,item.id).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,package_item_id,item_name_snapshot,quantity,unit,sort_order) VALUES(@qid,'package',@pid,@name,@qty,@unit,@sort)`);
    for (const item of customItems) await new sql.Request(tx).input("qid",sql.Int,quotationId).input("source",sql.NVarChar(20),item.source_type).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("price",sql.Decimal(12,2),item.unit_price).input("total",sql.Decimal(12,2),item.quantity*item.unit_price).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,item_name_snapshot,quantity,unit,unit_price,line_total,sort_order) VALUES(@qid,@source,@name,@qty,@unit,@price,@total,@sort)`);
    await logLeadActivity(tx,{leadId,activityType:"quotation",title:`สร้างใบเสนอราคา ${docNo} ชุด ${optionNo}`,note:packageRow.name,userId:gate.userId});
    await tx.commit(); return NextResponse.json(inserted.recordset[0], { status: 201 });
  } catch (error) { try { await tx.rollback(); } catch {} console.error("POST quotation", error); return NextResponse.json({ error: error instanceof Error ? error.message : "สร้างใบเสนอราคาไม่สำเร็จ" }, { status: 500 }); }
}
