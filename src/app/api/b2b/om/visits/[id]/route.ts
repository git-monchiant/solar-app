import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { isIsoDate, thaiDateShort } from "@/lib/b2b/project";
import { B2B_OM_ROLES, type VisitFile } from "@/lib/b2b/om";
import { logOm } from "@/lib/b2b/om-server";
import { removeB2bFile } from "@/lib/b2b/file-store";

// การกระทำกับครั้งเข้างาน O&M B2B (แผน 20261015-09) — ปิดงาน (แนบรายงาน) อยู่ที่ /close
//   schedule    { scheduled_date, days?, lead_user_id?, note?, reason? } นัด / เลื่อนนัด — ภายในอายุสัญญา (เลื่อนได้ไม่จำกัด · เคาะ 15 ต.ค.)
//   unschedule  { reason } ยกเลิกนัด → กลับเป็นรอนัด
//   skip        { reason } ลูกค้าขอข้ามครั้งนี้ = ใช้สิทธิ์ครั้งนั้นแล้ว (เคาะ 15 ต.ค.)
//   reopen      { reason } เปิดครั้งที่ปิด/ข้ามแล้วกลับมา (กดผิด) — ไฟล์รายงานเดิมถูกลบ
class UserError extends Error {}
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const reason = text(b.reason, 500);
  const userId = gate.userId;

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  let removeFiles: VisitFile[] = [];
  try {
    await tx.begin();
    const v = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT v.id, v.contract_id, v.seq_no, v.status, CONVERT(char(10), v.scheduled_date, 23) AS scheduled_date, v.files_json,
             CONVERT(char(10), c.start_date, 23) AS start_date, CONVERT(char(10), c.end_date, 23) AS end_date, c.visits_total, c.cancelled_at
      FROM b2b_om_visits v WITH (UPDLOCK, ROWLOCK) JOIN b2b_om_contracts c ON c.id = v.contract_id WHERE v.id = @id`)).recordset[0];
    if (!v) throw new UserError("ไม่พบครั้งเข้างาน");
    if (v.cancelled_at) throw new UserError("สัญญานี้ยกเลิกแล้ว");
    const tag = `ครั้งที่ ${v.seq_no}/${v.visits_total}`;
    const log = (kind: string, message: string) => logOm(tx, v.contract_id, id, kind, message, userId);
    const set = (sqlSet: string, r = new sql.Request(tx)) =>
      r.input("id", sql.Int, id).input("u", sql.Int, userId).query(`UPDATE b2b_om_visits SET ${sqlSet}, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);

    if (action === "schedule") {
      if (v.status !== "planned" && v.status !== "scheduled") throw new UserError("ครั้งนี้ปิด/ข้ามไปแล้ว");
      if (!isIsoDate(b.scheduled_date)) throw new UserError("กรุณาระบุวันนัด");
      if (b.scheduled_date < v.start_date || b.scheduled_date > v.end_date) throw new UserError(`วันนัดต้องอยู่ในอายุสัญญา (${thaiDateShort(v.start_date)} – ${thaiDateShort(v.end_date)})`);
      const days = Math.min(Math.max(parseInt(b.days) || 1, 1), 14);
      const lead = Number.isInteger(Number(b.lead_user_id)) && Number(b.lead_user_id) > 0 ? Number(b.lead_user_id) : null;
      const note = text(b.note, 500);
      await set(`status = 'scheduled', scheduled_date = @d, days = @n, lead_user_id = @l, schedule_note = @sn`,
        new sql.Request(tx).input("d", sql.Date, b.scheduled_date).input("n", sql.TinyInt, days).input("l", sql.Int, lead).input("sn", sql.NVarChar(500), note));
      const when = `${thaiDateShort(b.scheduled_date)}${days > 1 ? ` (${days} วัน)` : ""}`;
      if (v.scheduled_date) await log("rescheduled", `เลื่อน${tag} จาก ${thaiDateShort(v.scheduled_date)} เป็น ${when}${reason ? ` — ${reason}` : ""}`);
      else await log("scheduled", `นัด${tag} ${when}${note ? ` · ${note}` : ""}`);
    } else if (action === "unschedule") {
      if (v.status !== "scheduled") throw new UserError("ครั้งนี้ยังไม่ได้นัด");
      if (!reason) throw new UserError("กรุณาระบุเหตุผล");
      await set(`status = 'planned', scheduled_date = NULL, days = NULL, schedule_note = NULL`);
      await log("unscheduled", `ยกเลิกนัด${tag} (${thaiDateShort(v.scheduled_date)}) — ${reason}`);
    } else if (action === "skip") {
      if (v.status !== "planned" && v.status !== "scheduled") throw new UserError("ครั้งนี้ปิด/ข้ามไปแล้ว");
      if (!reason) throw new UserError("กรุณาระบุเหตุผลที่ลูกค้าขอข้าม");
      await set(`status = 'skipped', skip_reason = @r, closed_by = @u, closed_at = SYSDATETIMEOFFSET()`, new sql.Request(tx).input("r", sql.NVarChar(500), reason));
      await log("skipped", `ข้าม${tag} (นับว่าใช้สิทธิ์แล้ว) — ${reason}`);
    } else if (action === "reopen") {
      if (v.status !== "done" && v.status !== "skipped") throw new UserError("ครั้งนี้ยังไม่ได้ปิด");
      if (!reason) throw new UserError("กรุณาระบุเหตุผล");
      removeFiles = v.files_json ? JSON.parse(v.files_json) : [];
      await set(`status = ${v.scheduled_date ? "'scheduled'" : "'planned'"}, done_date = NULL, result_note = NULL, files_json = NULL,
                 skip_reason = NULL, closed_by = NULL, closed_at = NULL`);
      await log("reopened", `เปิด${tag} กลับมา — ${reason}${removeFiles.length ? ` · ลบไฟล์รายงาน ${removeFiles.length} ไฟล์` : ""}`);
    } else {
      throw new UserError("ไม่รู้จักคำสั่งนี้");
    }
    await new sql.Request(tx).input("c", sql.Int, v.contract_id).query(`UPDATE b2b_om_contracts SET updated_at = SYSDATETIMEOFFSET() WHERE id = @c`);
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบครั้งเข้างาน" ? 404 : 400 });
    console.error("POST /api/b2b/om/visits/[id] error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  for (const f of removeFiles) await removeB2bFile(f.file);   // ไฟล์ลบหลัง commit
  return NextResponse.json({ ok: true });
}
