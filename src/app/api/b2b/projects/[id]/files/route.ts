import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_ROLES, isClosedStage } from "@/lib/b2b/project";
import { logActivity } from "@/lib/b2b/project-server";
import { ALLOWED_B2B_FILE_MIME, MAX_B2B_FILE_BYTES, buildB2bFileName, removeB2bFile, saveB2bFile } from "@/lib/b2b/file-store";

// แนบรูป/ไฟล์ของโครงการ (แผน 20261015-10) — multipart: kind=survey · files (รูป/PDF ≤ 20 ไฟล์ ไฟล์ละ 15 MB) · note?
//   แนบได้ทุกขั้นที่โครงการยังเปิด (ลูกค้าส่งแบบหลังคามาก่อนนัดสำรวจได้ · สำรวจซ้ำต่อท้ายได้) · Solar B2B / admin
const KINDS = ["survey"] as const;
const KIND_LABEL: Record<string, string> = { survey: "ไฟล์สำรวจ" };
const MAX_FILES = 20;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const kind = String(form?.get("kind") ?? "");
  if (!(KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: "ชนิดไฟล์ไม่ถูกต้อง" }, { status: 400 });
  const note = String(form?.get("note") ?? "").trim().slice(0, 300) || null;
  const files = (form?.getAll("files") ?? []).filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return NextResponse.json({ error: "กรุณาเลือกไฟล์" }, { status: 400 });
  if (files.length > MAX_FILES) return NextResponse.json({ error: `แนบได้ครั้งละไม่เกิน ${MAX_FILES} ไฟล์` }, { status: 400 });
  for (const f of files) {
    if (!ALLOWED_B2B_FILE_MIME.includes((f.type || "").toLowerCase())) return NextResponse.json({ error: `"${f.name}" — แนบได้เฉพาะรูป หรือ PDF` }, { status: 400 });
    if (f.size > MAX_B2B_FILE_BYTES) return NextResponse.json({ error: `"${f.name}" ใหญ่เกิน 15 MB` }, { status: 413 });
  }

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  const saved: string[] = [];
  try {
    await tx.begin();
    const p = (await new sql.Request(tx).input("id", sql.Int, id).query(`SELECT stage FROM b2b_projects WITH (UPDLOCK) WHERE id = @id`)).recordset[0];
    if (!p) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 404 }); }
    if (isClosedStage(p.stage)) { await tx.rollback(); return NextResponse.json({ error: "โครงการปิด/แพ้/ยกเลิกแล้ว — แนบไฟล์ไม่ได้" }, { status: 409 }); }
    for (const f of files) {
      const mime = f.type.toLowerCase();
      const name = buildB2bFileName(id, kind, mime);
      await saveB2bFile(name, Buffer.from(await f.arrayBuffer()));
      saved.push(name);
      await new sql.Request(tx).input("p", sql.Int, id).input("k", sql.VarChar(20), kind).input("f", sql.NVarChar(300), name)
        .input("l", sql.NVarChar(200), f.name.slice(0, 200)).input("m", sql.NVarChar(100), mime).input("n", sql.NVarChar(300), note).input("u", sql.Int, gate.userId)
        .query(`INSERT INTO b2b_project_files (project_id, kind, file_name, label, mime, note, created_by) VALUES (@p, @k, @f, @l, @m, @n, @u)`);
    }
    await logActivity(tx, id, "files_added", { message: `แนบ${KIND_LABEL[kind]} ${files.length} ไฟล์${note ? ` — ${note}` : ""}`, userId: gate.userId });
    await new sql.Request(tx).input("p", sql.Int, id).query(`UPDATE b2b_projects SET updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    await tx.commit();
    return NextResponse.json({ ok: true, count: files.length }, { status: 201 });
  } catch (e) {
    try { await tx.rollback(); } catch {}
    for (const f of saved) await removeB2bFile(f);
    console.error("POST /api/b2b/projects/[id]/files error:", e);
    return NextResponse.json({ error: "แนบไฟล์ไม่สำเร็จ" }, { status: 500 });
  }
}
