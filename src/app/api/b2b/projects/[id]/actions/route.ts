import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import {
  B2B_LOSABLE_MAX_STAGE, B2B_MAX_MOVABLE_STAGE, B2B_PROJECT_ROLES, B2B_STAGE, isClosedStage, isIsoDate, stageLabel, thaiDateShort,
} from "@/lib/b2b/project";
import { loadProject, logActivity } from "@/lib/b2b/project-server";
import { buildInstallments } from "@/lib/b2b/installment";

// เปลี่ยนขั้นโครงการ — ทางเดียวที่ stage เปลี่ยน (แผน 20261015-07 หัวข้อ 1) · ทุกการกระทำลง timeline
//   move             { to_stage, reason? }        เดินหน้า/ข้ามขั้นได้ถึง 3400 (เฟส 1) · ถอยหลังต้องมีเหตุผล
//   schedule_survey  { survey_date, surveyor_id?, note? }  นัด/เลื่อนนัดสำรวจ → ขั้น 3300
//   record_survey    { survey_date?, note }      บันทึกผลสำรวจ → ขั้น 3400 เอง
//   lost             { reason }                  แพ้งาน (ถึงขั้น 3400) · cancel { reason } ยกเลิก (ขั้นไหนก็ได้)
//   reopen           { reason? }                 เปิดกลับไปขั้นก่อนแพ้/ยกเลิก
//   note             { message }                 บันทึกทั่วไปลง timeline
//   won              { quote_id, contract_no?, contract_date? }  ได้งาน (เฟส 3) — จากขั้น 3200/3400 · ใบต้องเป็น Rev ล่าสุดที่ส่งลูกค้าแล้ว
//                    ใบนั้น = สัญญา (won) · ใบอื่นของโครงการปิดเอง (closed) · BOQ ของใบ = งบโครงการ · งวดเงินคัดลอกจากใบ (งวด 1 ถึงกำหนดทันที)
//   contract         { contract_no?, contract_date }  บันทึก/แก้เลข PO-สัญญา + วันลงนาม (หลังได้งาน)
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
        message: `นัดสำรวจ ${thaiDateShort(b.survey_date)}${note ? ` — ${note}` : ""}`,
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
    } else if (action === "won") {
      if (closed) throw new UserError("โครงการปิดอยู่ — เปิดกลับก่อน");
      if (stage !== B2B_STAGE.estimate && stage !== B2B_STAGE.confirm) throw new UserError("กดได้งานได้จากขั้นราคาประมาณการ หรือราคายืนยัน/ต่อรอง");
      const qt = (await new sql.Request(tx).input("q", sql.Int, Number(b.quote_id) || 0).query(`
        SELECT id, project_id, boq_id, doc_no, revision, status, is_latest, subtotal, content_json
        FROM b2b_quotations WITH (UPDLOCK, ROWLOCK) WHERE id = @q`)).recordset[0];
      if (!qt || qt.project_id !== id) throw new UserError("ไม่พบใบเสนอราคาในโครงการนี้");
      if (!qt.is_latest || qt.status !== "sent") throw new UserError("เลือกได้เฉพาะใบ Revision ล่าสุดที่ส่งลูกค้าแล้ว");
      const paid = (await new sql.Request(tx).input("p", sql.Int, id)
        .query(`SELECT COUNT(*) AS n FROM b2b_project_installments WHERE project_id = @p AND status <> 'pending' AND status <> 'due'`)).recordset[0].n;
      if (paid > 0) throw new UserError("โครงการนี้มีงวดเงินที่แนบหลักฐาน/รับเงินแล้ว — ได้งานซ้ำไม่ได้");
      const content = JSON.parse(qt.content_json);
      const subtotal = Number(qt.subtotal);
      const vatPct = Number(content.vat_pct ?? 7);
      const contractNo = text(b.contract_no, 100);
      const contractDate = isIsoDate(b.contract_date) ? b.contract_date : null;
      await setStage(B2B_STAGE.won,
        `, won_quote_id = @q, won_boq_id = @b, contract_no = @cn, contract_date = @cd, contract_value = @cv, contract_vat_pct = @vp,
           won_at = SYSDATETIMEOFFSET(), won_by = @u, om_years = @oy, om_visits_per_year = @ov`,
        (r) => r.input("q", sql.Int, qt.id).input("b", sql.Int, qt.boq_id).input("cn", sql.NVarChar(100), contractNo)
          .input("cd", sql.Date, contractDate).input("cv", sql.Decimal(16, 2), subtotal).input("vp", sql.Decimal(5, 2), vatPct)
          .input("oy", sql.Int, content.om_years ?? null).input("ov", sql.Int, content.om_visits_per_year ?? null));
      await new sql.Request(tx).input("q", sql.Int, qt.id).input("p", sql.Int, id).input("u", sql.Int, userId).query(`
        UPDATE b2b_quotations SET status = 'won', updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @q;
        UPDATE b2b_quotations SET status = 'closed', updated_by = @u, updated_at = SYSDATETIMEOFFSET()
        WHERE project_id = @p AND is_latest = 1 AND id <> @q AND status NOT IN ('won', 'closed');
        DELETE FROM b2b_project_installments WHERE project_id = @p;`);
      for (const it of buildInstallments(content.installments ?? [], subtotal, vatPct)) {
        await new sql.Request(tx).input("p", sql.Int, id).input("no", sql.Int, it.no).input("pct", sql.Decimal(6, 2), it.pct)
          .input("c", sql.NVarChar(300), it.condition).input("t", sql.VarChar(30), it.trigger_key)
          .input("a", sql.Decimal(16, 2), it.amount).input("v", sql.Decimal(16, 2), it.vat).input("tt", sql.Decimal(16, 2), it.total)
          .input("st", sql.VarChar(12), it.no === 1 ? "due" : "pending")
          .query(`INSERT INTO b2b_project_installments (project_id, no, pct, condition, trigger_key, amount, vat, total, status, due_at)
                  VALUES (@p, @no, @pct, @c, @t, @a, @v, @tt, @st, CASE WHEN @st = 'due' THEN SYSDATETIMEOFFSET() END)`);
      }
      await logActivity(tx, id, "won", {
        from: stage, to: B2B_STAGE.won, userId,
        message: `ได้งาน — ${qt.doc_no} Rev ${qt.revision} · มูลค่าสัญญา ${subtotal.toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท (ก่อน VAT)${contractNo ? ` · PO/สัญญา ${contractNo}` : ""}`,
      });
    } else if (action === "contract") {
      if (closed || stage < B2B_STAGE.won) throw new UserError("บันทึกสัญญาได้หลังได้งาน");
      if (!isIsoDate(b.contract_date)) throw new UserError("กรุณาระบุวันลงนาม");
      const contractNo = text(b.contract_no, 100);
      await new sql.Request(tx).input("id", sql.Int, id).input("cn", sql.NVarChar(100), contractNo).input("cd", sql.Date, b.contract_date).input("u", sql.Int, userId)
        .query(`UPDATE b2b_projects SET contract_no = @cn, contract_date = @cd, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
      await logActivity(tx, id, "contract", { message: `บันทึกสัญญา${contractNo ? ` ${contractNo}` : ""} ลงนาม ${thaiDateShort(b.contract_date)}`, userId });
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
