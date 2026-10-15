import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { logActivity } from "@/lib/b2b/project-server";
import {
  B2B_QUOTE_EDIT_ROLES, B2B_QUOTE_VIEW_ROLES, PENDING_STATUS, REVIEW_ROLE, editableStatus, tierOfStatus,
  type QuoteStatus, type ReviewTier,
} from "@/lib/b2b/quotation";
import { buildSnapshot, loadQuote, todayBangkok } from "@/lib/b2b/quotation-server";

// ทางเดียวที่สถานะใบเสนอราคา B2B เปลี่ยน — ยกกลไกจากใบเสนอราคา B2C (api/(lead)/quotations/[id]/action)
//   submit   ร่าง/ส่งกลับแก้ → รอผู้ตรวจสอบ 1 · แช่ snapshot + ลายเซ็นผู้เสนอราคา · ล้างการอนุมัติรอบก่อน
//            BOQ ที่อ้างต้องไม่มีบรรทัดรอราคา (รอราคาคิดเป็น 0 ใบจะออกราคาต่ำกว่าจริง)
//   approve  { certify: true, note? } ผู้ตรวจสอบชั้นที่รอ (หรือ admin) — แช่ชื่อ/ลายเซ็น · ต้องมีลายเซ็นในโปรไฟล์
//            คนเดียวกันอนุมัติ 2 ชั้นในใบเดียวไม่ได้ ยกเว้น admin (เคาะ 15 ต.ค.)
//   return   { note } ผู้ตรวจสอบชั้นที่รอ (หรือ admin) → ส่งกลับแก้ · ส่งใหม่เริ่มชั้น 1
//   revise   อนุมัติแล้ว/ส่งลูกค้าแล้ว → Rev ใหม่ (ร่าง) — ลูกค้าต่อรอง
//   send     อนุมัติแล้ว → ส่งลูกค้าแล้ว
// ทุกการกระทำล็อกแถวใบ (UPDLOCK) กันสองคนกดพร้อมกัน · ลง timeline ของโครงการ
class UserError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_QUOTE_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 1000) : null;
  const roles = gate.roles;
  const isAdmin = roles.includes("admin");
  const canEdit = B2B_QUOTE_EDIT_ROLES.some((r) => roles.includes(r));
  const userId = gate.userId;

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  let resultId = id;
  try {
    await tx.begin();
    const q = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT q.id, q.project_id, q.boq_id, q.doc_no, q.revision, q.root_id, q.is_latest, q.status, q.kind,
             q.r1_by, q.r2_by, b.pending_lines
      FROM b2b_quotations q WITH (UPDLOCK, ROWLOCK) JOIN b2b_boqs b ON b.id = q.boq_id WHERE q.id = @id`)).recordset[0];
    if (!q) throw new UserError("ไม่พบใบเสนอราคา");
    const status = q.status as QuoteStatus;
    const label = `${q.doc_no} Rev ${q.revision}`;
    const log = (kind: string, message: string) => logActivity(tx, q.project_id, kind, { message, userId });

    if (action === "submit") {
      if (!canEdit) throw new UserError("ส่งอนุมัติได้เฉพาะ Solar B2B");
      if (!q.is_latest || !editableStatus(status)) throw new UserError("ส่งอนุมัติได้เฉพาะใบร่าง/ส่งกลับแก้ของ Revision ล่าสุด");
      if (q.pending_lines > 0) throw new UserError(`BOQ ที่ใช้ยังมีบรรทัดรอราคา ${q.pending_lines} บรรทัด — รอ Purchase ใส่ราคาก่อนส่งอนุมัติ`);
      // วันที่บนใบ = วันส่ง — ตั้งก่อนสร้าง snapshot ให้ snapshot มีวันที่ด้วย
      await new sql.Request(tx).input("id", sql.Int, id).input("d", sql.Date, todayBangkok()).query(`UPDATE b2b_quotations SET issue_date = @d WHERE id = @id`);
      const snap = await buildSnapshot(tx, id, userId);
      if (!snap) throw new UserError("ไม่พบใบเสนอราคา");
      const me = (await new sql.Request(tx).input("u", sql.Int, userId)
        .query(`SELECT full_name, signature_data, signature_mime FROM users WHERE id = @u`)).recordset[0];
      await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, userId)
        .input("snap", sql.NVarChar(sql.MAX), JSON.stringify(snap))
        .input("pn", sql.NVarChar(150), me?.full_name ?? null)
        .input("ps", sql.VarBinary(sql.MAX), me?.signature_data ?? null).input("pm", sql.NVarChar(50), me?.signature_mime ?? null)
        .query(`
          UPDATE b2b_quotations SET status = 'pending_review1', snapshot_json = @snap, submitted_by = @u, submitted_at = SYSDATETIMEOFFSET(),
            proposer_name = @pn, proposer_sig = @ps, proposer_sig_mime = @pm,
            r1_by = NULL, r1_at = NULL, r1_note = NULL, r1_name = NULL, r1_sig = NULL, r1_sig_mime = NULL,
            r2_by = NULL, r2_at = NULL, r2_note = NULL, r2_name = NULL, r2_sig = NULL, r2_sig_mime = NULL,
            r3_by = NULL, r3_at = NULL, r3_note = NULL, r3_name = NULL, r3_sig = NULL, r3_sig_mime = NULL,
            updated_by = @u, updated_at = SYSDATETIMEOFFSET()
          WHERE id = @id`);
      await log("quote_submitted", `ส่งอนุมัติ ${label} — รอผู้ตรวจสอบ 1`);
    } else if (action === "approve" || action === "return") {
      const tier = tierOfStatus(status);
      if (!tier) throw new UserError("ใบนี้ไม่ได้รออนุมัติ");
      if (!isAdmin && !roles.includes(REVIEW_ROLE[tier])) throw new UserError(`ขั้นนี้ต้องเป็นผู้ตรวจสอบ ${tier}`);
      if (action === "return") {
        if (!note) throw new UserError("กรุณาระบุเหตุผลที่ส่งกลับแก้");
        await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, userId).input("t", sql.Int, tier).input("n", sql.NVarChar(1000), note)
          .query(`UPDATE b2b_quotations SET status = 'changes_required', returned_tier = @t, returned_by = @u, returned_at = SYSDATETIMEOFFSET(),
                    return_note = @n, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
        await log("quote_returned", `ผู้ตรวจสอบ ${tier} ส่งกลับแก้ ${label} — ${note}`);
      } else {
        if (b.certify !== true) throw new UserError("กรุณาติ๊กยืนยันว่าตรวจสอบเอกสารแล้วก่อนอนุมัติ");
        if (!isAdmin && [q.r1_by, q.r2_by].includes(userId)) throw new UserError("อนุมัติชั้นก่อนหน้าของใบนี้ไปแล้ว — คนเดียวกันอนุมัติ 2 ชั้นไม่ได้");
        const me = (await new sql.Request(tx).input("u", sql.Int, userId)
          .query(`SELECT full_name, signature_data, signature_mime FROM users WHERE id = @u`)).recordset[0];
        if (!me?.signature_data) throw new UserError("กรุณาบันทึกภาพลายเซ็นในหน้าโปรไฟล์ก่อนอนุมัติ (ลายเซ็นขึ้นในช่องผู้ตรวจสอบของใบ)");
        const next: QuoteStatus = tier === 3 ? "approved" : PENDING_STATUS[(tier + 1) as ReviewTier];
        const c = `r${tier}`;
        await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, userId).input("n", sql.NVarChar(1000), note)
          .input("name", sql.NVarChar(150), me.full_name).input("sig", sql.VarBinary(sql.MAX), me.signature_data)
          .input("mime", sql.NVarChar(50), me.signature_mime ?? "image/png").input("next", sql.VarChar(20), next)
          .query(`UPDATE b2b_quotations SET status = @next, ${c}_by = @u, ${c}_at = SYSDATETIMEOFFSET(), ${c}_note = @n,
                    ${c}_name = @name, ${c}_sig = @sig, ${c}_sig_mime = @mime, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
                  WHERE id = @id`);
        await log("quote_approved", `ผู้ตรวจสอบ ${tier} อนุมัติ ${label}${tier === 3 ? " — ครบ 3 ชั้น พร้อมส่งลูกค้า" : ` — รอผู้ตรวจสอบ ${tier + 1}`}${note ? ` · ${note}` : ""}`);
      }
    } else if (action === "revise") {
      if (!canEdit) throw new UserError("ออก Revision ใหม่ได้เฉพาะ Solar B2B");
      if (!q.is_latest || (status !== "approved" && status !== "sent")) throw new UserError("ออก Revision ใหม่ได้จากใบล่าสุดที่อนุมัติแล้ว/ส่งลูกค้าแล้ว — ใบร่างแก้ได้เลย");
      const ins = await new sql.Request(tx).input("id", sql.Int, id).input("root", sql.Int, q.root_id ?? q.id).input("u", sql.Int, userId)
        .query(`
          INSERT INTO b2b_quotations (project_id, boq_id, doc_no, revision, root_id, is_latest, kind, status, content_json, subtotal, vat, total, created_by, updated_by)
          OUTPUT INSERTED.id, INSERTED.revision
          SELECT project_id, boq_id, doc_no, revision + 1, @root, 1, kind, 'draft', content_json, subtotal, vat, total, @u, @u
          FROM b2b_quotations WHERE id = @id;
          UPDATE b2b_quotations SET is_latest = 0 WHERE id = @id;`);
      resultId = ins.recordset[0].id;
      await log("quote_revision", `${q.doc_no} ออก Rev ${ins.recordset[0].revision} (ร่าง) — ต่อรองจาก Rev ${q.revision}`);
    } else if (action === "send") {
      if (!canEdit) throw new UserError("บันทึกส่งลูกค้าได้เฉพาะ Solar B2B");
      if (status !== "approved") throw new UserError("ส่งลูกค้าได้เฉพาะใบที่อนุมัติครบ 3 ชั้นแล้ว");
      await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, userId)
        .query(`UPDATE b2b_quotations SET status = 'sent', sent_by = @u, sent_at = SYSDATETIMEOFFSET(), updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
      await log("quote_sent", `ส่งลูกค้า ${label}`);
    } else {
      throw new UserError("ไม่รู้จักคำสั่งนี้");
    }
    // โครงการขยับเวลาอัปเดต — รายการโครงการเรียงตามความเคลื่อนไหวล่าสุด
    await new sql.Request(tx).input("p", sql.Int, q.project_id).input("u", sql.Int, userId)
      .query(`UPDATE b2b_projects SET updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบใบเสนอราคา" ? 404 : 400 });
    console.error("POST /api/b2b/quotations/[id]/action error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json(await loadQuote(db, resultId));
}
