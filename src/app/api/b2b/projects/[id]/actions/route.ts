import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import {
  B2B_LOSABLE_MAX_STAGE, B2B_MAX_MOVABLE_STAGE, B2B_PROJECT_ROLES, B2B_STAGE, isClosedStage, isIsoDate, stageLabel,
} from "@/lib/b2b/project";
import { loadProject, logActivity } from "@/lib/b2b/project-server";

// เปลี่ยนขั้นโครงการ — ทางเดียวที่ stage เปลี่ยน (แผน 20261015-07 หัวข้อ 1) · ทุกการกระทำลง timeline
//   move             { to_stage, reason? }        เดินหน้า/ข้ามขั้นได้ถึง 3400 (เฟส 1) · ถอยหลังต้องมีเหตุผล
//   schedule_survey  { survey_date, surveyor_id?, note? }  นัด/เลื่อนนัดสำรวจ → ขั้น 3300
//   record_survey    { survey_date?, note }      บันทึกผลสำรวจ → ขั้น 3400 เอง
//   lost             { reason }                  แพ้งาน (ถึงขั้น 3400) · cancel { reason } ยกเลิก (ขั้นไหนก็ได้)
//   reopen           { reason? }                 เปิดกลับไปขั้นก่อนแพ้/ยกเลิก
//   note             { message }                 บันทึกทั่วไปลง timeline
const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

class UserError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const action = String(b.action ?? "");
  const userId = gate.userId;

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  try {
    await tx.begin();
    const cur = (await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT stage, stage_before_close FROM b2b_projects WITH (UPDLOCK, ROWLOCK) WHERE id = @id`)).recordset[0];
    if (!cur) throw new UserError("ไม่พบโครงการ");
    const stage = cur.stage as number;
    const closed = isClosedStage(stage);
    const setStage = async (to: number, extra = "", inputs: (r: sql.Request) => sql.Request = (r) => r) => {
      await inputs(new sql.Request(tx).input("id", sql.Int, id).input("to", sql.Int, to).input("u", sql.Int, userId))
        .query(`UPDATE b2b_projects SET stage = @to${extra}, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
    };

    if (action === "move") {
      const to = Number(b.to_stage);
      const reason = text(b.reason, 500);
      if (closed) throw new UserError("โครงการปิดอยู่ — เปิดกลับก่อน");
      if (!Number.isInteger(to) || to < B2B_STAGE.lead || to > B2B_MAX_MOVABLE_STAGE || to % 100 !== 0) throw new UserError(`ย้ายได้ถึงขั้น "${stageLabel(B2B_MAX_MOVABLE_STAGE)}" — ขั้นถัดไปเปิดเมื่อมีใบเสนอราคา`);
      if (to === stage) throw new UserError("อยู่ขั้นนี้แล้ว");
      if (to < stage && !reason) throw new UserError("ถอยขั้นต้องระบุเหตุผล");
      await setStage(to);
      await logActivity(tx, id, "stage", { from: stage, to, message: reason, userId });
    } else if (action === "schedule_survey") {
      if (closed) throw new UserError("โครงการปิดอยู่ — เปิดกลับก่อน");
      if (stage > B2B_STAGE.survey) throw new UserError("ผ่านขั้นสำรวจแล้ว — ถอยกลับมาขั้นสำรวจก่อน (ระบุเหตุผล) แล้วค่อยนัดใหม่");
      if (!isIsoDate(b.survey_date)) throw new UserError("กรุณาเลือกวันนัดสำรวจ");
      const surveyor = Number.isInteger(Number(b.surveyor_id)) && Number(b.surveyor_id) > 0 ? Number(b.surveyor_id) : null;
      const note = text(b.note, 500);
      // นัดใหม่ = ล้างเวลาบันทึกผลเดิม (การ์ดกลับเป็น "รอบันทึกผล") · ผลเดิมยังอยู่ใน timeline
      await setStage(B2B_STAGE.survey, ", survey_date = @d, surveyor_id = @s, survey_done_at = NULL",
        (r) => r.input("d", sql.Date, b.survey_date).input("s", sql.Int, surveyor));
      await logActivity(tx, id, "survey_scheduled", {
        from: stage, to: B2B_STAGE.survey, userId,
        message: `นัดสำรวจ ${b.survey_date}${note ? ` — ${note}` : ""}`,
      });
    } else if (action === "record_survey") {
      if (stage !== B2B_STAGE.survey) throw new UserError("บันทึกผลสำรวจได้เฉพาะตอนอยู่ขั้นสำรวจ");
      const note = text(b.note, 2000);
      if (!note) throw new UserError("กรุณาสรุปผลสำรวจ");
      const date = isIsoDate(b.survey_date) ? b.survey_date : null;
      await setStage(B2B_STAGE.confirm, ", survey_note = @n, survey_done_at = SYSDATETIMEOFFSET(), survey_date = COALESCE(@d, survey_date)",
        (r) => r.input("n", sql.NVarChar(2000), note).input("d", sql.Date, date));
      await logActivity(tx, id, "survey_done", { from: stage, to: B2B_STAGE.confirm, message: note, userId });
    } else if (action === "lost" || action === "cancel") {
      const reason = text(b.reason, 500);
      if (!reason) throw new UserError(action === "lost" ? "กรุณาระบุเหตุผลที่แพ้งาน" : "กรุณาระบุเหตุผลที่ยกเลิก");
      if (closed) throw new UserError("โครงการปิดอยู่แล้ว");
      if (action === "lost" && stage > B2B_LOSABLE_MAX_STAGE) throw new UserError("ได้งานแล้ว — ใช้ \"ยกเลิก\" แทน");
      const to = action === "lost" ? B2B_STAGE.lost : B2B_STAGE.cancelled;
      await setStage(to, ", stage_before_close = @from, close_reason = @why, closed_at = SYSDATETIMEOFFSET()",
        (r) => r.input("from", sql.Int, stage).input("why", sql.NVarChar(500), reason));
      await logActivity(tx, id, action === "lost" ? "lost" : "cancelled", { from: stage, to, message: reason, userId });
    } else if (action === "reopen") {
      if (stage !== B2B_STAGE.lost && stage !== B2B_STAGE.cancelled) throw new UserError("เปิดกลับได้เฉพาะโครงการที่แพ้งาน/ยกเลิก");
      const to = (cur.stage_before_close as number | null) ?? B2B_STAGE.lead;
      await setStage(to, ", stage_before_close = NULL, close_reason = NULL, closed_at = NULL");
      await logActivity(tx, id, "reopened", { from: stage, to, message: text(b.reason, 500), userId });
    } else if (action === "note") {
      const message = text(b.message, 1000);
      if (!message) throw new UserError("กรุณาพิมพ์ข้อความ");
      await new sql.Request(tx).input("id", sql.Int, id).input("u", sql.Int, userId)
        .query(`UPDATE b2b_projects SET updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
      await logActivity(tx, id, "note", { message, userId });
    } else {
      throw new UserError("ไม่รู้จักคำสั่งนี้");
    }
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบโครงการ" ? 404 : 400 });
    console.error("POST /api/b2b/projects/[id]/actions error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  return NextResponse.json(await loadProject(db, id));
}
