import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { calculateQuotation, getQuotationActor, getQuotationDetail, type QuotationInputItem } from "@/lib/quotation";
import { parseDocumentInputs } from "@/lib/quotation-document";
import { getStandardQuotationPaymentTerms } from "@/lib/quotation-terms";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate=await requireAuth(req); if(gate.error)return gate.error;
  const {id}=await params; const detail=await getQuotationDetail(Number(id));
  if (!detail) return NextResponse.json({error:"ไม่พบใบเสนอราคา"},{status:404});
  const safe = { ...detail };
  delete safe.approver_signature_data_snapshot;
  return NextResponse.json(fixDates([safe])[0]);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate=await requireAuth(req); if(gate.error)return gate.error;
  const actor=await getQuotationActor(gate.userId); if(!actor)return NextResponse.json({error:"ไม่พบผู้ใช้"},{status:401});
  const {id}=await params; const quotationId=Number(id); const body=await req.json(); const db=await getDb(); const tx=new sql.Transaction(db);
  try {
    await tx.begin();
    const current=await new sql.Request(tx).input("id",sql.Int,quotationId).query(`
      SELECT q.*, l.assigned_user_id,
        CASE WHEN l.payment_confirmed = 1 THEN COALESCE((
          SELECT SUM(p.amount) FROM payments p
          WHERE p.lead_id = l.id AND p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
        ), l.pre_total_price, 0) ELSE 0 END AS confirmed_deposit
      FROM quotations q JOIN leads l ON l.id=q.lead_id WHERE q.id=@id
    `);
    const q=current.recordset[0]; if(!q){await tx.rollback();return NextResponse.json({error:"ไม่พบใบเสนอราคา"},{status:404});}
    if(!["draft","changes_required"].includes(q.status)){await tx.rollback();return NextResponse.json({error:"แก้ไขได้เฉพาะฉบับร่างหรือฉบับที่ส่งกลับ"},{status:409});}
    if(!actor.roles.includes("admin")&&q.assigned_user_id!==gate.userId){await tx.rollback();return NextResponse.json({error:"แก้ไขได้เฉพาะผู้รับผิดชอบ Lead"},{status:403});}
    const packageId=Number(body.package_id)||q.package_id;
    const pkg=(await new sql.Request(tx).input("pid",sql.Int,packageId).query(`SELECT * FROM packages WHERE id=@pid AND is_active=1`)).recordset[0];
    if(!pkg){await tx.rollback();return NextResponse.json({error:"ไม่พบ Package"},{status:400});}
    const items:QuotationInputItem[]=Array.isArray(body.items)?body.items.filter((i:QuotationInputItem)=>i?.item_name?.trim()).map((i:QuotationInputItem)=>({source_type:"custom",item_name:String(i.item_name).trim(),quantity:Number(i.quantity)||1,unit:i.unit||"ชุด",unit_price:Number(i.unit_price)||0})):[];
    const discountType=body.discount_type==="percent"?"percent":"amount";
    const confirmedDeposit=Math.max(0,Number(q.confirmed_deposit)||0);
    const depositPaid=Math.max(confirmedDeposit,Number(body.deposit_paid_amount)||0);
    const totals=calculateQuotation(Number(pkg.price),items,discountType,Number(body.discount_value),depositPaid,7);
    const documentInputs=parseDocumentInputs(body.document_inputs,q.document_inputs_json?parseDocumentInputs(q.document_inputs_json):undefined);
    const paymentTerms=getStandardQuotationPaymentTerms();
    await new sql.Request(tx).input("id",sql.Int,quotationId).input("pid",sql.Int,packageId).input("pname",sql.NVarChar(200),pkg.name).input("pprice",sql.Decimal(12,2),pkg.price)
      .input("issue",sql.Date,toSqlDate(body.issue_date)||q.issue_date).input("valid",sql.Int,Number(body.valid_days)||7).input("subtotal",sql.Decimal(12,2),totals.subtotal)
      .input("label",sql.NVarChar(200),body.discount_label||null).input("dtype",sql.NVarChar(10),discountType).input("dvalue",sql.Decimal(12,2),Number(body.discount_value)||0).input("damount",sql.Decimal(12,2),totals.discountAmount)
      .input("reason",sql.NVarChar(500),body.discount_reason||null).input("total",sql.Decimal(12,2),totals.total).input("deposit",sql.Decimal(12,2),totals.deposit).input("outstanding",sql.Decimal(12,2),totals.outstanding)
      .input("beforevat",sql.Decimal(12,2),totals.beforeVat).input("vat",sql.Decimal(12,2),totals.vatAmount).input("template",sql.Int,Number(body.payment_template_id)||null)
      .input("terms",sql.NVarChar(sql.MAX),JSON.stringify(paymentTerms)).input("terms_text",sql.NVarChar(sql.MAX),body.terms_text||null).input("note",sql.NVarChar(sql.MAX),body.note||null).input("document_inputs",sql.NVarChar(sql.MAX),JSON.stringify(documentInputs)).input("uid",sql.Int,gate.userId)
      .query(`UPDATE quotations SET package_id=@pid,package_name_snapshot=@pname,package_price_snapshot=@pprice,issue_date=@issue,valid_days=@valid,subtotal_incl_vat=@subtotal,discount_label=@label,discount_type=@dtype,discount_value=@dvalue,discount_amount=@damount,discount_reason=@reason,contract_total_incl_vat=@total,deposit_paid_amount=@deposit,outstanding_amount=@outstanding,amount_before_vat=@beforevat,vat_amount=@vat,payment_template_id=@template,payment_terms_json=@terms,terms_text=@terms_text,note=@note,document_inputs_json=@document_inputs,document_snapshot_json=NULL,financial_snapshot_json=NULL,document_snapshot_at=NULL,status='draft',approval_note=NULL,updated_by=@uid,updated_at=GETDATE() WHERE id=@id`);
    await new sql.Request(tx).input("id",sql.Int,quotationId).query(`DELETE FROM quotation_document_artifacts WHERE quotation_id=@id`);
    await new sql.Request(tx).input("id",sql.Int,quotationId).query(`DELETE FROM quotation_items WHERE quotation_id=@id`);
    const packageItems=await new sql.Request(tx).input("pid",sql.Int,packageId).query(`SELECT * FROM package_items WHERE package_id=@pid AND is_active=1 ORDER BY sort_order,id`); let sort=0;
    for(const item of packageItems.recordset)await new sql.Request(tx).input("qid",sql.Int,quotationId).input("piid",sql.Int,item.id).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,package_item_id,item_name_snapshot,quantity,unit,sort_order) VALUES(@qid,'package',@piid,@name,@qty,@unit,@sort)`);
    for(const item of items)await new sql.Request(tx).input("qid",sql.Int,quotationId).input("source",sql.NVarChar(20),item.source_type).input("name",sql.NVarChar(500),item.item_name).input("qty",sql.Decimal(10,2),item.quantity).input("unit",sql.NVarChar(50),item.unit).input("price",sql.Decimal(12,2),item.unit_price).input("total",sql.Decimal(12,2),item.quantity*item.unit_price).input("sort",sql.Int,sort++).query(`INSERT quotation_items(quotation_id,source_type,item_name_snapshot,quantity,unit,unit_price,line_total,sort_order) VALUES(@qid,@source,@name,@qty,@unit,@price,@total,@sort)`);
    await tx.commit(); return NextResponse.json({ok:true});
  }catch(error){try{await tx.rollback();}catch{} console.error("PATCH quotation",error);return NextResponse.json({error:error instanceof Error?error.message:"แก้ไขไม่สำเร็จ"},{status:500});}
}

export async function DELETE(req:NextRequest,{params}:{params:Promise<{id:string}>}){
  const gate=await requireAuth(req);if(gate.error)return gate.error;const actor=await getQuotationActor(gate.userId);const {id}=await params;const db=await getDb();
  const q=await db.request().input("id",sql.Int,Number(id)).query(`SELECT q.status,l.assigned_user_id FROM quotations q JOIN leads l ON l.id=q.lead_id WHERE q.id=@id`);const row=q.recordset[0];
  if(!row)return NextResponse.json({error:"ไม่พบใบเสนอราคา"},{status:404});if(row.status!=="draft")return NextResponse.json({error:"ลบได้เฉพาะฉบับร่าง"},{status:409});if(!actor?.roles.includes("admin")&&row.assigned_user_id!==gate.userId)return NextResponse.json({error:"ไม่มีสิทธิ์"},{status:403});
  await db.request().input("id",sql.Int,Number(id)).query(`DELETE FROM quotations WHERE id=@id`);return NextResponse.json({ok:true});
}
