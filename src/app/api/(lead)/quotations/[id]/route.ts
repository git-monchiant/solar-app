import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { resolvePackagePrice, syncActivePricePeriods } from "@/lib/package-prices";
import { calculateQuotation, canManageQuotation, getQuotationActor, getQuotationDetail, parseQuotationAddOnItems, parseQuotationPackageItems, type QuotationInputItem } from "@/lib/quotation";
import { parseDocumentInputs } from "@/lib/quotation-document";
import { getQuotationPaymentTermsTotal, parseQuotationPaymentTerms } from "@/lib/quotation-terms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate=await requireAuth(req); if(gate.error)return gate.error;
  const {id}=await params; const detail=await getQuotationDetail(Number(id));
  if (!detail) return NextResponse.json({error:"ไม่พบใบเสนอราคา"},{status:404});
  const safe = { ...detail };
  // Never leak raw signature blobs to the client.
  delete safe.approver_signature_data_snapshot;
  delete safe.created_by_signature_data;
  delete safe.solar_approved_signature_data;
  return NextResponse.json(fixDates([safe])[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await syncActivePricePeriods();   // ราคาแพ็กเกจต้องเป็นของช่วงที่ถึงกำหนดแล้ว ก่อน snapshot ลงใบเสนอราคา
  const gate=await requireAuth(req); if(gate.error)return gate.error;
  const actor=await getQuotationActor(gate.userId); if(!actor)return NextResponse.json({error:"ไม่พบผู้ใช้"},{status:401});
  const {id}=await params; const quotationId=Number(id); const body=await req.json();
  const paymentTerms=parseQuotationPaymentTerms(body.payment_terms);
  if(getQuotationPaymentTermsTotal(paymentTerms)!==100)return NextResponse.json({error:"ยอดรวมงวดชำระเงินต้องเท่ากับ 100%"},{status:400});
  const db=await getDb(); const tx=new sql.Transaction(db);
  try {
    await tx.begin();
    const current=await new sql.Request(tx).input("id",sql.Int,quotationId).query(`
      SELECT q.*, l.assigned_user_id, l.pre_survey_fee_type,
        CASE WHEN l.pre_survey_fee_type = 'free' THEN 0
        WHEN l.payment_confirmed = 1 THEN COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.lead_id = l.id AND p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
        ), l.pre_total_price, 0) ELSE 0 END AS confirmed_deposit
      FROM quotations q JOIN leads l ON l.id=q.lead_id WHERE q.id=@id
    `);
    const q=current.recordset[0]; if(!q){await tx.rollback();return NextResponse.json({error:"ไม่พบใบเสนอราคา"},{status:404});}
    if(!["draft","changes_required"].includes(q.status)){await tx.rollback();return NextResponse.json({error:"แก้ไขได้เฉพาะฉบับร่างหรือฉบับที่ส่งกลับ"},{status:409});}
    if(!canManageQuotation(actor.roles)){await tx.rollback();return NextResponse.json({error:"ไม่มีสิทธิ์แก้ไขใบเสนอราคา"},{status:403});}
    const bodyPackageId=body.package_id===undefined?q.package_id:(Number(body.package_id)||null);
    const items:QuotationInputItem[]=parseQuotationAddOnItems(body.items);
    // No main package? Promote the first package-type add-on to the main package.
    let effectivePackageId=bodyPackageId;
    let addonItems=items;
    if(!effectivePackageId){const promoteIdx=items.findIndex((i)=>i.source_package_id);if(promoteIdx>=0){effectivePackageId=items[promoteIdx].source_package_id!;addonItems=items.filter((_,idx)=>idx!==promoteIdx);}}
    const pkg=effectivePackageId?(await new sql.Request(tx).input("pid",sql.Int,effectivePackageId).query(`SELECT * FROM packages WHERE id=@pid AND is_active=1`)).recordset[0]:null;
    if(effectivePackageId&&!pkg){await tx.rollback();return NextResponse.json({error:"ไม่พบ Package"},{status:400});}
    if(!effectivePackageId&&addonItems.length===0){await tx.rollback();return NextResponse.json({error:"กรุณาเลือก Package หลัก หรือเพิ่มรายการอย่างน้อย 1 รายการ"},{status:400});}
    const discountType=body.discount_type==="percent"?"percent":"amount";
    const confirmedDeposit=Math.max(0,Number(q.confirmed_deposit)||0);
    const depositPaid=q.pre_survey_fee_type==="free"?0:Math.max(confirmedDeposit,Number(body.deposit_paid_amount)||0);
    const packagePrice=await resolvePackagePrice(new sql.Request(tx),effectivePackageId,body.package_price,Number(pkg?.price)||0,q.lead_id);
    const totals=calculateQuotation(packagePrice,addonItems,discountType,Number(body.discount_value),depositPaid,7);
    const documentInputs=parseDocumentInputs(body.document_inputs,q.document_inputs_json?parseDocumentInputs(q.document_inputs_json):undefined);
    await new sql.Request(tx).input("id",sql.Int,quotationId).input("pid",sql.Int,effectivePackageId).input("pname",sql.NVarChar(200),pkg?.name||"").input("pprice",sql.Decimal(12,2),packagePrice)
      .input("issue",sql.Date,toSqlDate(body.issue_date)||q.issue_date).input("valid",sql.Int,Number(body.valid_days)||7).input("subtotal",sql.Decimal(12,2),totals.subtotal)
      .input("label",sql.NVarChar(200),body.discount_label||null).input("dtype",sql.NVarChar(10),discountType).input("dvalue",sql.Decimal(12,2),Number(body.discount_value)||0).input("damount",sql.Decimal(12,2),totals.discountAmount)
      .input("reason",sql.NVarChar(500),body.discount_reason||null).input("total",sql.Decimal(12,2),totals.total).input("deposit",sql.Decimal(12,2),totals.deposit).input("outstanding",sql.Decimal(12,2),totals.outstanding)
      .input("beforevat",sql.Decimal(12,2),totals.beforeVat).input("vat",sql.Decimal(12,2),totals.vatAmount).input("template",sql.Int,Number(body.payment_template_id)||null)
      .input("terms",sql.NVarChar(sql.MAX),JSON.stringify(paymentTerms)).input("terms_text",sql.NVarChar(sql.MAX),body.terms_text||null).input("note",sql.NVarChar(sql.MAX),body.note||null).input("document_inputs",sql.NVarChar(sql.MAX),JSON.stringify(documentInputs)).input("uid",sql.Int,gate.userId)
      .query(`UPDATE quotations SET package_id=@pid,package_name_snapshot=@pname,package_price_snapshot=@pprice,issue_date=@issue,valid_days=@valid,subtotal_incl_vat=@subtotal,discount_label=@label,discount_type=@dtype,discount_value=@dvalue,discount_amount=@damount,discount_reason=@reason,contract_total_incl_vat=@total,deposit_paid_amount=@deposit,outstanding_amount=@outstanding,amount_before_vat=@beforevat,vat_amount=@vat,payment_template_id=@template,payment_terms_json=@terms,terms_text=@terms_text,note=@note,document_inputs_json=@document_inputs,document_snapshot_json=NULL,financial_snapshot_json=NULL,document_snapshot_at=NULL,status='draft',approval_note=NULL,updated_by=@uid,updated_at=GETDATE() WHERE id=@id`);
    await new sql.Request(tx).input("id",sql.Int,quotationId).query(`DELETE FROM quotation_document_artifacts WHERE quotation_id=@id`);
    await new sql.Request(tx).input("id",sql.Int,quotationId).query(`DELETE FROM quotation_items WHERE quotation_id=@id`);
    const submittedPackageItems=parseQuotationPackageItems(body.package_items);
    const packageItemRows=effectivePackageId?(submittedPackageItems??(await new sql.Request(tx).input("pid",sql.Int,effectivePackageId).query(`SELECT * FROM package_items WHERE package_id=@pid AND is_active=1 ORDER BY sort_order,id`)).recordset):[]; let sort=0;
    for(const item of packageItemRows)await new sql.Request(tx).input("qid",sql.Int,quotationId).input("piid",sql.Int,item.package_item_id??item.id??null).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,package_item_id,item_name_snapshot,quantity,unit,sort_order) VALUES(@qid,'package',@piid,@name,@qty,@unit,@sort)`);
    for(const item of addonItems)await new sql.Request(tx).input("qid",sql.Int,quotationId).input("source",sql.NVarChar(20),item.source_type).input("piid",sql.Int,item.package_item_id??null).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("price",sql.Decimal(12,2),item.unit_price).input("total",sql.Decimal(12,2),item.source_type==="addon_package"?item.line_total||0:item.quantity*item.unit_price).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,package_item_id,item_name_snapshot,quantity,unit,unit_price,line_total,sort_order) VALUES(@qid,@source,@piid,@name,@qty,@unit,@price,@total,@sort)`);
    await tx.commit(); return NextResponse.json({ok:true});
  }catch(error){try{await tx.rollback();}catch{} console.error("PATCH quotation",error);return NextResponse.json({error:error instanceof Error?error.message:"แก้ไขไม่สำเร็จ"},{status:500});}
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const gate=await requireAuth(req);if(gate.error)return gate.error;const actor=await getQuotationActor(gate.userId);const {id}=await params;const db=await getDb();
  const q=await db.request().input("id",sql.Int,Number(id)).query(`SELECT q.status,l.assigned_user_id FROM quotations q JOIN leads l ON l.id=q.lead_id WHERE q.id=@id`);const row=q.recordset[0];
  if(!row)return NextResponse.json({error:"ไม่พบใบเสนอราคา"},{status:404});if(row.status!=="draft")return NextResponse.json({error:"ลบได้เฉพาะฉบับร่าง"},{status:409});if(!canManageQuotation(actor?.roles))return NextResponse.json({error:"ไม่มีสิทธิ์"},{status:403});
  await db.request().input("id",sql.Int,Number(id)).query(`DELETE FROM quotations WHERE id=@id`);return NextResponse.json({ok:true});
}
