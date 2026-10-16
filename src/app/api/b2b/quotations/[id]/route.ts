import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_QUOTE_EDIT_ROLES, B2B_QUOTE_VIEW_ROLES, editableStatus, quoteTotals, readQuoteContent, type QuoteStatus } from "@/lib/b2b/quotation";
import { loadQuote } from "@/lib/b2b/quotation-server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_QUOTE_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const q = await loadQuote(await getB2bDb(), id);
  if (!q) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
  return NextResponse.json(q);
}

// บันทึกเนื้อหาใบ — แก้ได้เฉพาะ Rev ล่าสุดที่เป็นร่าง/ส่งกลับแก้ · เปลี่ยน BOQ ได้ (Rev ล่าสุดของ BOQ ในโครงการเดียวกัน)
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_QUOTE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const parsed = readQuoteContent(body.content ?? {});
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const kind = body.kind === "estimate" || body.kind === "confirmed" ? body.kind : null;
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const cur = (await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT project_id, boq_id, status, is_latest, updated_at FROM b2b_quotations WITH (UPDLOCK, ROWLOCK) WHERE id = @id`)).recordset[0];
    if (!cur) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 }); }
    if (!cur.is_latest || !editableStatus(cur.status as QuoteStatus)) {
      await tx.rollback();
      return NextResponse.json({ error: "แก้ได้เฉพาะใบร่าง/ส่งกลับแก้ของ Revision ล่าสุด" }, { status: 409 });
    }
    if (body.expected_updated_at && new Date(body.expected_updated_at).getTime() !== new Date(cur.updated_at).getTime()) {
      await tx.rollback();
      return NextResponse.json({ error: "มีคนบันทึกใบนี้ไปก่อนแล้ว — โหลดหน้าใหม่แล้วแก้อีกครั้ง" }, { status: 409 });
    }
    let boqId = cur.boq_id as number;
    if (body.boq_id != null && Number(body.boq_id) !== boqId) {
      const b = (await new sql.Request(tx).input("b", sql.Int, Number(body.boq_id))
        .query(`SELECT project_id, is_latest FROM b2b_boqs WHERE id = @b`)).recordset[0];
      if (!b || b.project_id !== cur.project_id || !b.is_latest) {
        await tx.rollback();
        return NextResponse.json({ error: "เลือกได้เฉพาะ BOQ Revision ล่าสุดของโครงการนี้" }, { status: 400 });
      }
      boqId = Number(body.boq_id);
    }
    const c = parsed.value;
    const t = quoteTotals(c);
    await new sql.Request(tx).input("id", sql.Int, id).input("b", sql.Int, boqId)
      .input("c", sql.NVarChar(sql.MAX), JSON.stringify(c)).input("kind", sql.VarChar(10), kind)
      .input("sub", sql.Decimal(16, 2), t.subtotal).input("vat", sql.Decimal(16, 2), t.vat).input("tot", sql.Decimal(16, 2), t.total)
      .input("u", sql.Int, gate.userId)
      .query(`
        UPDATE b2b_quotations SET boq_id = @b, content_json = @c, kind = COALESCE(@kind, kind),
          subtotal = @sub, vat = @vat, total = @tot, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
        WHERE id = @id`);
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("PUT /api/b2b/quotations/[id] error:", e);
    return NextResponse.json({ error: "บันทึกใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json(await loadQuote(db, id));
}
