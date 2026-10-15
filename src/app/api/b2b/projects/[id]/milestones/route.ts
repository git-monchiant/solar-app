import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_STAGE, isIsoDate, stageLabel, thaiDateShort } from "@/lib/b2b/project";
import { MILESTONE_MIN_STAGE, isMilestoneKind, milestoneDef, type MilestoneFile } from "@/lib/b2b/execution";
import { logActivity } from "@/lib/b2b/project-server";
import { ALLOWED_B2B_FILE_MIME, MAX_B2B_FILE_BYTES, buildB2bFileName, removeB2bFile, saveB2bFile } from "@/lib/b2b/file-store";

// บันทึก milestone หน้างาน (แผน 20261015-07 เฟส 4) — multipart: kind · done_date · note · files (รูป/PDF ≤ 10 ไฟล์)
//   1 ชนิดต่อโครงการ · ต้องบันทึกตัวก่อนหน้าตาม MILESTONES.requires
//   บันทึกแล้ว: โครงการขยับขั้นตาม moveTo (ถ้ายังอยู่ขั้นก่อนหน้า) · งวดที่ trigger ตรงกันและยังไม่ถึง → ถึงกำหนดเอง
//   Solar B2B / admin ทุกชนิด · Purchase เฉพาะ "สั่งของครบ"
const MAX_FILES = 10;
class UserError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, ["b2b", "purchase", "admin"]);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const kind = form?.get("kind");
  if (!isMilestoneKind(kind)) return NextResponse.json({ error: "ชนิดเหตุการณ์ไม่ถูกต้อง" }, { status: 400 });
  const def = milestoneDef(kind)!;
  const fullRole = gate.roles.includes("b2b") || gate.roles.includes("admin");
  if (!fullRole && !def.purchase) return NextResponse.json({ error: "Purchase บันทึกได้เฉพาะ \"สั่งของครบ\"" }, { status: 403 });
  const doneDate = form?.get("done_date");
  if (!isIsoDate(doneDate)) return NextResponse.json({ error: "กรุณาระบุวันที่" }, { status: 400 });
  const note = String(form?.get("note") ?? "").trim().slice(0, 500) || null;
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > MAX_FILES) return NextResponse.json({ error: `แนบได้ไม่เกิน ${MAX_FILES} ไฟล์` }, { status: 400 });
  for (const f of files) {
    if (!ALLOWED_B2B_FILE_MIME.includes((f.type || "").toLowerCase())) return NextResponse.json({ error: `"${f.name}" — แนบได้เฉพาะรูป หรือ PDF` }, { status: 400 });
    if (f.size > MAX_B2B_FILE_BYTES) return NextResponse.json({ error: `"${f.name}" ใหญ่เกิน 15 MB` }, { status: 413 });
  }

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  const saved: MilestoneFile[] = [];
  try {
    await tx.begin();
    const p = (await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT stage FROM b2b_projects WITH (UPDLOCK, ROWLOCK) WHERE id = @id`)).recordset[0];
    if (!p) throw new UserError("ไม่พบโครงการ");
    const stage = p.stage as number;
    if (stage < MILESTONE_MIN_STAGE || stage >= B2B_STAGE.closed) throw new UserError("บันทึกเหตุการณ์หน้างานได้หลังรับเงินงวด 1 จนก่อนปิดโครงการ");
    const done = (await new sql.Request(tx).input("id", sql.Int, id)
      .query(`SELECT kind FROM b2b_project_milestones WHERE project_id = @id`)).recordset.map((r) => r.kind as string);
    if (done.includes(kind)) throw new UserError(`บันทึก "${def.label}" ไปแล้ว — แก้วันที่/หมายเหตุได้ที่รายการเดิม`);
    if (def.requires && !done.includes(def.requires)) throw new UserError(`ต้องบันทึก "${milestoneDef(def.requires)!.label}" ก่อน`);
    const after = def.moveTo && stage < def.moveTo ? def.moveTo : stage;

    for (const f of files) {
      const mime = f.type.toLowerCase();
      const name = buildB2bFileName(id, kind, mime);
      await saveB2bFile(name, Buffer.from(await f.arrayBuffer()));
      saved.push({ file: name, name: f.name.slice(0, 200), mime });
    }
    await new sql.Request(tx).input("p", sql.Int, id).input("k", sql.VarChar(30), kind).input("d", sql.Date, doneDate)
      .input("n", sql.NVarChar(500), note).input("f", sql.NVarChar(sql.MAX), saved.length ? JSON.stringify(saved) : null)
      .input("sb", sql.Int, stage).input("sa", sql.Int, after).input("u", sql.Int, gate.userId)
      .query(`INSERT INTO b2b_project_milestones (project_id, kind, done_date, note, files_json, stage_before, stage_after, created_by, updated_by)
              VALUES (@p, @k, @d, @n, @f, @sb, @sa, @u, @u)`);
    if (after !== stage) {
      await new sql.Request(tx).input("p", sql.Int, id).input("s", sql.Int, after).input("u", sql.Int, gate.userId)
        .query(`UPDATE b2b_projects SET stage = @s, updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    } else {
      await new sql.Request(tx).input("p", sql.Int, id).query(`UPDATE b2b_projects SET updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    }
    let dueText = "";
    if (def.trigger) {
      const due = await new sql.Request(tx).input("p", sql.Int, id).input("t", sql.VarChar(30), def.trigger).query(`
        UPDATE b2b_project_installments SET status = 'due', due_at = SYSDATETIMEOFFSET(), updated_at = SYSDATETIMEOFFSET()
        OUTPUT INSERTED.no
        WHERE project_id = @p AND trigger_key = @t AND status = 'pending'`);
      if (due.recordset.length) dueText = ` · งวด ${due.recordset.map((r) => r.no).join(", ")} ถึงกำหนดวางบิล`;
    }
    // ส่งมอบ ทั้งที่ทุกงวดรับเงินครบแล้ว (เช่นสัญญาไม่มีงวดผูกการส่งมอบ) → ปิดโครงการเลย
    let closedNow = false;
    if (kind === "handover") {
      const unpaid = (await new sql.Request(tx).input("p", sql.Int, id)
        .query(`SELECT COUNT(*) AS n FROM b2b_project_installments WHERE project_id = @p AND status <> 'paid'`)).recordset[0].n;
      if (unpaid === 0) {
        await new sql.Request(tx).input("p", sql.Int, id).input("u", sql.Int, gate.userId)
          .query(`UPDATE b2b_projects SET stage = ${B2B_STAGE.closed}, closed_at = SYSDATETIMEOFFSET(), updated_by = @u WHERE id = @p`);
        closedNow = true;
      }
    }
    await logActivity(tx, id, "milestone", {
      from: after !== stage ? stage : null, to: after !== stage ? after : null, userId: gate.userId,
      message: `${def.label} ${thaiDateShort(doneDate)}${note ? ` — ${note}` : ""}${saved.length ? ` · ไฟล์ ${saved.length}` : ""}${dueText}${after !== stage ? ` · เข้าขั้น ${stageLabel(after)}` : ""}`,
    });
    if (closedNow) await logActivity(tx, id, "closed", { from: after, to: B2B_STAGE.closed, message: "ส่งมอบแล้วและรับเงินครบทุกงวด — ปิดโครงการ", userId: gate.userId });
    await tx.commit();
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    for (const f of saved) await removeB2bFile(f.file);
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบโครงการ" ? 404 : 400 });
    console.error("POST /api/b2b/projects/[id]/milestones error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
