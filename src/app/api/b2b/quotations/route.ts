import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_STAGE } from "@/lib/b2b/project";
import { logActivity } from "@/lib/b2b/project-server";
import { B2B_QUOTE_EDIT_ROLES, quoteTotals, type QuoteKind } from "@/lib/b2b/quotation";
import { buildDefaultContent, nextQuoteDocNo } from "@/lib/b2b/quotation-server";

// สร้างใบเสนอราคา B2B จาก BOQ ตัวเลือกหนึ่งของโครงการ (Rev ล่าสุดของ BOQ) — แผน 20261015-07 เฟส 2
// ชนิดใบตามขั้น: ราคาประมาณการ (3200) = ประมาณการ · ราคายืนยัน (3400) = ยืนยัน — เนื้อหาตั้งต้นตามแม่แบบ SSE
export async function POST(req: NextRequest) {
  const gate = await requireAnyActiveRole(req, B2B_QUOTE_EDIT_ROLES);
  if (gate.error) return gate.error;
  const b = await req.json().catch(() => ({}));
  const projectId = Number(b.project_id);
  const boqId = Number(b.boq_id);
  if (!Number.isInteger(projectId) || !Number.isInteger(boqId)) return NextResponse.json({ error: "กรุณาเลือก BOQ" }, { status: 400 });
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const p = (await new sql.Request(tx).input("p", sql.Int, projectId).query(`SELECT id, stage FROM b2b_projects WHERE id = @p`)).recordset[0];
    if (!p) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 404 }); }
    if (p.stage !== B2B_STAGE.estimate && p.stage !== B2B_STAGE.confirm) {
      await tx.rollback();
      return NextResponse.json({ error: "ออกใบเสนอราคาได้ในขั้นราคาประมาณการ หรือราคายืนยัน/ต่อรอง" }, { status: 409 });
    }
    const boq = (await new sql.Request(tx).input("b", sql.Int, boqId)
      .query(`SELECT id, project_id, is_latest, doc_no, revision, option_label FROM b2b_boqs WHERE id = @b`)).recordset[0];
    if (!boq || boq.project_id !== projectId) { await tx.rollback(); return NextResponse.json({ error: "BOQ ไม่ได้อยู่ในโครงการนี้" }, { status: 400 }); }
    if (!boq.is_latest) { await tx.rollback(); return NextResponse.json({ error: "เลือกได้เฉพาะ BOQ Revision ล่าสุด" }, { status: 409 }); }
    const kind: QuoteKind = p.stage === B2B_STAGE.estimate ? "estimate" : "confirmed";
    const content = await buildDefaultContent(tx, boqId, kind);
    if (!content) throw new Error("BOQ not found");
    const t = quoteTotals(content);
    const docNo = await nextQuoteDocNo(tx);
    const ins = await new sql.Request(tx)
      .input("p", sql.Int, projectId).input("b", sql.Int, boqId).input("doc", sql.NVarChar(30), docNo)
      .input("kind", sql.VarChar(10), kind).input("c", sql.NVarChar(sql.MAX), JSON.stringify(content))
      .input("sub", sql.Decimal(16, 2), t.subtotal).input("vat", sql.Decimal(16, 2), t.vat).input("tot", sql.Decimal(16, 2), t.total)
      .input("u", sql.Int, gate.userId)
      .query(`
        INSERT INTO b2b_quotations (project_id, boq_id, doc_no, revision, kind, status, content_json, subtotal, vat, total, created_by, updated_by)
        OUTPUT INSERTED.id
        VALUES (@p, @b, @doc, 0, @kind, 'draft', @c, @sub, @vat, @tot, @u, @u)`);
    await logActivity(tx, projectId, "quote_created", {
      message: `สร้างใบเสนอราคา${kind === "estimate" ? "ประมาณการ" : "ยืนยัน"} ${docNo} จาก ${boq.doc_no} Rev ${boq.revision}${boq.option_label ? ` · ${boq.option_label}` : ""}`,
      userId: gate.userId,
    });
    await tx.commit();
    return NextResponse.json({ id: ins.recordset[0].id, doc_no: docNo }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    console.error("POST /api/b2b/quotations error:", e);
    return NextResponse.json({ error: "สร้างใบเสนอราคาไม่สำเร็จ" }, { status: 500 });
  }
}
