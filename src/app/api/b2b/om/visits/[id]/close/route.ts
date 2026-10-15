import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { isIsoDate, thaiDateShort } from "@/lib/b2b/project";
import { B2B_OM_ROLES, todayThIso, type VisitFile } from "@/lib/b2b/om";
import { logOm } from "@/lib/b2b/om-server";
import { ALLOWED_B2B_FILE_MIME, MAX_B2B_FILE_BYTES, buildB2bFileName, removeB2bFile, saveB2bFile } from "@/lib/b2b/file-store";

// ปิดครั้งเข้างาน O&M B2B (แผน 20261015-09 เฟส 1) — multipart: done_date · note · files (รายงาน/รูป ≥ 1 ไฟล์ ≤ 20)
// เฟส 1 ปิดด้วยการแนบรายงาน/รูป · ใบตรวจบนมือถือ + ลายเซ็น + PDF มาในเฟส 2
const MAX_FILES = 20;
class UserError extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const doneDate = form?.get("done_date");
  if (!isIsoDate(doneDate)) return NextResponse.json({ error: "กรุณาระบุวันที่เข้างาน" }, { status: 400 });
  if (doneDate > todayThIso()) return NextResponse.json({ error: "วันที่เข้างานต้องไม่เกินวันนี้" }, { status: 400 });
  const note = String(form?.get("note") ?? "").trim().slice(0, 1000) || null;
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "แนบรายงานหรือรูปหน้างานอย่างน้อย 1 ไฟล์" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `แนบได้ไม่เกิน ${MAX_FILES} ไฟล์` }, { status: 400 });
  for (const f of files) {
    if (!ALLOWED_B2B_FILE_MIME.includes((f.type || "").toLowerCase())) return NextResponse.json({ error: `"${f.name}" — แนบได้เฉพาะรูป หรือ PDF` }, { status: 400 });
    if (f.size > MAX_B2B_FILE_BYTES) return NextResponse.json({ error: `"${f.name}" ใหญ่เกิน 15 MB` }, { status: 413 });
  }

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  const saved: VisitFile[] = [];
  try {
    await tx.begin();
    const v = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT v.id, v.contract_id, v.project_id, v.seq_no, v.status, c.visits_total, c.cancelled_at, CONVERT(char(10), c.start_date, 23) AS start_date
      FROM b2b_om_visits v WITH (UPDLOCK, ROWLOCK) JOIN b2b_om_contracts c ON c.id = v.contract_id WHERE v.id = @id`)).recordset[0];
    if (!v) throw new UserError("ไม่พบครั้งเข้างาน");
    if (v.cancelled_at) throw new UserError("สัญญานี้ยกเลิกแล้ว");
    if (v.status !== "planned" && v.status !== "scheduled") throw new UserError("ครั้งนี้ปิด/ข้ามไปแล้ว");
    if (doneDate < v.start_date) throw new UserError("วันที่เข้างานต้องไม่ก่อนวันเริ่มสัญญา");
    for (const f of files) {
      const mime = f.type.toLowerCase();
      const name = buildB2bFileName(v.project_id, `om${v.seq_no}`, mime);
      await saveB2bFile(name, Buffer.from(await f.arrayBuffer()));
      saved.push({ file: name, name: f.name.slice(0, 200), mime });
    }
    await new sql.Request(tx).input("id", sql.Int, id).input("d", sql.Date, doneDate).input("n", sql.NVarChar(1000), note)
      .input("f", sql.NVarChar(sql.MAX), JSON.stringify(saved)).input("u", sql.Int, gate.userId)
      .query(`UPDATE b2b_om_visits SET status = 'done', done_date = @d, result_note = @n, files_json = @f, closed_by = @u, closed_at = SYSDATETIMEOFFSET(),
                updated_by = @u, updated_at = SYSDATETIMEOFFSET() WHERE id = @id`);
    await logOm(tx, v.contract_id, id, "closed",
      `ปิดครั้งที่ ${v.seq_no}/${v.visits_total} · เข้างาน ${thaiDateShort(doneDate)}${note ? ` — ${note}` : ""} · ไฟล์ ${saved.length}`, gate.userId);
    await new sql.Request(tx).input("c", sql.Int, v.contract_id).query(`UPDATE b2b_om_contracts SET updated_at = SYSDATETIMEOFFSET() WHERE id = @c`);
    await tx.commit();
    return NextResponse.json({ ok: true });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    for (const f of saved) await removeB2bFile(f.file);
    if (e instanceof UserError) return NextResponse.json({ error: e.message }, { status: e.message === "ไม่พบครั้งเข้างาน" ? 404 : 400 });
    console.error("POST /api/b2b/om/visits/[id]/close error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
}
