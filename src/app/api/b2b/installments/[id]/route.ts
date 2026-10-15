import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_INSTALLMENT_VIEW_ROLES, B2B_STAGE } from "@/lib/b2b/project";
import { logActivity } from "@/lib/b2b/project-server";

// สถานะงวดเงิน B2B (แผน 20261015-07 เฟส 3) — แนบหลักฐานไปที่ /evidence
//   due      Solar B2B กด "ถึงกำหนด" เอง (งวดที่ยังไม่ถึง — milestone อัตโนมัติมาในเฟส 4)
//   confirm  บัญชี/admin ยืนยันรับเงิน → รับแล้ว · งวด 1 ทำให้โครงการขยับ 3500 → 3600 เอง
//   reject   { reason } บัญชี/admin ตีกลับ → กลับเป็น "ถึงกำหนด" ให้แนบใหม่
//   ★ บัญชียืนยันได้เฉพาะ role ที่สวมอยู่เป็น account/admin (แบบ /api/om/payments/[id]) · ล็อกแถวกันกดพร้อมกัน
class UserError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_INSTALLMENT_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const reason = typeof b.reason === "string" && b.reason.trim() ? b.reason.trim().slice(0, 500) : null;
  const roles = gate.roles;
  const isAccount = roles.includes("account") || roles.includes("admin");
  const isB2b = roles.includes("b2b") || roles.includes("admin");
  const userId = gate.userId;

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const it = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT i.id, i.project_id, i.no, i.status, i.total, p.stage
      FROM b2b_project_installments i WITH (UPDLOCK, ROWLOCK) JOIN b2b_projects p WITH (UPDLOCK) ON p.id = i.project_id WHERE i.id = @id`)).recordset[0];
    if (!it) throw new UserError("ไม่พบงวด");
    if (it.stage >= B2B_STAGE.closed) throw new UserError("โครงการปิดอยู่");
    const log = (kind: string, message: string, extra?: { from: number; to: number }) => logActivity(tx, it.project_id, kind, { message, userId, ...extra });
    const money = Number(it.total).toLocaleString("th-TH", { minimumFractionDigits: 2 });

    if (action === "due") {
      if (!isB2b) throw new UserError("กดถึงกำหนดได้เฉพาะ Solar B2B");
      if (it.status !== "pending") throw new UserError("งวดนี้ถึงกำหนดแล้ว");
      await new sql.Request(tx).input("id", sql.Int, id)
        .query(`UPDATE b2b_project_installments SET status = 'due', due_at = SYSDATETIMEOFFSET(), updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
      await log("installment_due", `งวด ${it.no} ถึงกำหนดวางบิล ${money} บาท (รวม VAT)`);
    } else if (action === "confirm" || action === "reject") {
      if (!isAccount) throw new UserError("ยืนยันรับเงินได้เฉพาะบัญชี");
      if (it.status !== "submitted") throw new UserError("งวดนี้ไม่ได้รอบัญชียืนยัน");
      if (action === "reject") {
        if (!reason) throw new UserError("กรุณาระบุเหตุผลที่ตีกลับ");
        await new sql.Request(tx).input("id", sql.Int, id).input("r", sql.NVarChar(500), reason).input("u", sql.Int, userId)
          .query(`UPDATE b2b_project_installments SET status = 'due', reject_note = @r, rejected_by = @u, rejected_at = SYSDATETIMEOFFSET(),
                    updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
        await log("installment_rejected", `บัญชีตีกลับหลักฐานงวด ${it.no} — ${reason}`);
      } else {
        await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, userId)
          .query(`UPDATE b2b_project_installments SET status = 'paid', confirmed_by = @u, confirmed_at = SYSDATETIMEOFFSET(),
                    updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
        await log("installment_paid", `บัญชียืนยันรับเงินงวด ${it.no} ${money} บาท`);
        // งวด 1 = เริ่มงานได้ → ขั้นขออนุญาต + จัดซื้อ
        if (it.no === 1 && it.stage === B2B_STAGE.won) {
          await new sql.Request(tx).input("p", sql.Int, it.project_id).input("u", sql.Int, userId)
            .query(`UPDATE b2b_projects SET stage = ${B2B_STAGE.permit}, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
          await log("stage", "รับเงินงวด 1 แล้ว — เริ่มขออนุญาต + จัดซื้อ", { from: B2B_STAGE.won, to: B2B_STAGE.permit });
        }
      }
    } else {
      throw new UserError("ไม่รู้จักคำสั่งนี้");
    }
    await new sql.Request(tx).input("p", sql.Int, it.project_id)
      .query(`UPDATE b2b_projects SET updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    await tx.commit();
    return NextResponse.json({ ok: true, project_id: it.project_id });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบงวด" ? 404 : 400 });
    console.error("POST /api/b2b/installments/[id] error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
