import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_STAGE, isIsoDate, stageLabel, thaiDateShort } from "@/lib/b2b/project";
import { milestoneDef, type MilestoneFile } from "@/lib/b2b/execution";
import { logActivity } from "@/lib/b2b/project-server";
import { removeB2bFile } from "@/lib/b2b/file-store";

// แก้ / ยกเลิก milestone (แผน 20261015-07 เฟส 4)
//   PATCH  { done_date, note } แก้วันที่/หมายเหตุ — ไม่ย้อนเปลี่ยนขั้น/งวด · ปิด/แพ้/ยกเลิกโครงการแล้วแก้ไม่ได้ทั้งคู่
//   DELETE ยกเลิกการบันทึก "ล่าสุด" ของโครงการเท่านั้น (กดผิด) — ถอยขั้นกลับ (ถ้ายังไม่มีอะไรขยับต่อ)
//          + งวดที่ถึงกำหนดเพราะตัวนี้กลับเป็นยังไม่ถึง · งวดที่แนบหลักฐาน/รับเงินแล้ว = ยกเลิกไม่ได้
//   Solar B2B / admin ทุกชนิด · Purchase เฉพาะ "สั่งของครบ"
class UserError extends Error {}

async function load(tx: sql.Transaction, id: number) {
  const m = (await new sql.Request(tx).input("id", sql.Int, id).query(`
    SELECT m.id, m.project_id, m.kind, m.done_date, m.files_json, m.stage_before, m.stage_after, p.stage
    FROM b2b_project_milestones m WITH (UPDLOCK, ROWLOCK) JOIN b2b_projects p WITH (UPDLOCK) ON p.id = m.project_id WHERE m.id = @id`)).recordset[0];
  if (!m) throw new UserError("ไม่พบรายการ");
  if (m.stage >= B2B_STAGE.closed) throw new UserError("โครงการปิดแล้ว — แก้บันทึกหน้างานไม่ได้");
  return m;
}
const canTouch = (roles: string[], kind: string) =>
  roles.includes("b2b") || roles.includes("admin") || (roles.includes("purchase") && !!milestoneDef(kind)?.purchase);

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, ["b2b", "purchase", "admin"]);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  const b = await req.json().catch(() => ({}));
  if (!isIsoDate(b.done_date)) return NextResponse.json({ error: "กรุณาระบุวันที่" }, { status: 400 });
  const note = typeof b.note === "string" && b.note.trim() ? b.note.trim().slice(0, 500) : null;
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const m = await load(tx, id);
    if (!canTouch(gate.roles, m.kind)) throw new UserError("ไม่มีสิทธิ์แก้รายการนี้");
    await new sql.Request(tx).input("id", sql.Int, id).input("d", sql.Date, b.done_date).input("n", sql.NVarChar(500), note).input("u", sql.Int, gate.userId)
      .query(`UPDATE b2b_project_milestones SET done_date = @d, note = @n, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
    await logActivity(tx, m.project_id, "milestone_edited", { message: `แก้ "${milestoneDef(m.kind)!.label}" เป็น ${thaiDateShort(b.done_date)}${note ? ` — ${note}` : ""}`, userId: gate.userId });
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: 400 });
    console.error("PATCH /api/b2b/milestones/[id] error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, ["b2b", "purchase", "admin"]);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  let files: MilestoneFile[] = [];
  try {
    await tx.begin();
    const m = await load(tx, id);
    const def = milestoneDef(m.kind)!;
    if (!canTouch(gate.roles, m.kind)) throw new UserError("ไม่มีสิทธิ์ยกเลิกรายการนี้");
    const last = (await new sql.Request(tx).input("p", sql.Int, m.project_id)
      .query(`SELECT TOP 1 id FROM b2b_project_milestones WHERE project_id = @p ORDER BY created_at DESC, id DESC`)).recordset[0];
    if (last?.id !== m.id) throw new UserError("ยกเลิกได้เฉพาะรายการที่บันทึกล่าสุด");
    // โครงการต้องยังอยู่ขั้นเดียวกับตอนบันทึกเสร็จ — ขยับต่อแล้ว (เช่นกดเข้าขั้นส่งมอบ) ยกเลิกไม่ได้
    if (m.stage !== m.stage_after) throw new UserError("โครงการขยับขั้นต่อไปแล้ว — ยกเลิกไม่ได้");
    if (def.trigger) {
      const used = (await new sql.Request(tx).input("p", sql.Int, m.project_id).input("t", sql.VarChar(30), def.trigger)
        .query(`SELECT COUNT(*) AS n FROM b2b_project_installments WHERE project_id = @p AND trigger_key = @t AND status IN ('submitted', 'paid')`)).recordset[0].n;
      if (used > 0) throw new UserError("งวดที่ผูกกับเหตุการณ์นี้แนบหลักฐาน/รับเงินแล้ว — ยกเลิกไม่ได้");
      await new sql.Request(tx).input("p", sql.Int, m.project_id).input("t", sql.VarChar(30), def.trigger)
        .query(`UPDATE b2b_project_installments SET status = 'pending', due_at = NULL, updated_at = SYSDATETIMEOFFSET()
                WHERE project_id = @p AND trigger_key = @t AND status = 'due'`);
    }
    files = m.files_json ? JSON.parse(m.files_json) : [];
    await new sql.Request(tx).input("id", sql.Int, id).query(`DELETE FROM b2b_project_milestones WHERE id = @id`);
    const back = m.stage_after !== m.stage_before;
    await new sql.Request(tx).input("p", sql.Int, m.project_id).input("s", sql.Int, back ? m.stage_before : m.stage).input("u", sql.Int, gate.userId)
      .query(`UPDATE b2b_projects SET stage = @s, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    await logActivity(tx, m.project_id, "milestone_undone", {
      from: back ? m.stage_after : null, to: back ? m.stage_before : null, userId: gate.userId,
      message: `ยกเลิกการบันทึก "${def.label}"${back ? ` · กลับไปขั้น ${stageLabel(m.stage_before)}` : ""}`,
    });
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบรายการ" ? 404 : 400 });
    console.error("DELETE /api/b2b/milestones/[id] error:", e);
    return NextResponse.json({ error: "ยกเลิกไม่สำเร็จ" }, { status: 500 });
  }
  for (const f of files) await removeB2bFile(f.file);   // ไฟล์ลบหลัง commit
  return NextResponse.json({ ok: true });
}
