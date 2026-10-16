import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_ROLES, B2B_INSTALLMENT_VIEW_ROLES, isIsoDate, thaiDateShort } from "@/lib/b2b/project";
import { logActivity } from "@/lib/b2b/project-server";
import {
  ALLOWED_B2B_FILE_MIME, MAX_B2B_FILE_BYTES, b2bFilePath, buildB2bFileName, mimeOfB2bName, removeB2bFile, saveB2bFile,
} from "@/lib/b2b/file-store";

// หลักฐานรับเงินงวด B2B (แผน 20261015-07 เฟส 3)
//   POST (multipart: file · received_date · note) Solar B2B แนบหลักฐาน → งวดเป็น "รอบัญชียืนยัน" · แนบใหม่ได้จนกว่าบัญชีจะยืนยัน
//   GET  เปิดไฟล์ — Solar B2B · ผู้ตรวจสอบ · บัญชี · admin (ไฟล์อยู่นอก public/ เข้าทางนี้ทางเดียว)

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_INSTALLMENT_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const r = (await (await getB2bDb()).request().input("id", sql.Int, id)
    .query(`SELECT evidence_file, evidence_name, evidence_mime FROM b2b_project_installments WHERE id = @id`)).recordset[0];
  const p = await b2bFilePath(r?.evidence_file);
  if (!p) return NextResponse.json({ error: "ไม่พบไฟล์หลักฐาน" }, { status: 404 });
  const name = r.evidence_name || r.evidence_file;
  return new NextResponse(new Uint8Array(await readFile(p)), {
    headers: {
      "Content-Type": r.evidence_mime || mimeOfB2bName(r.evidence_file),
      "Content-Disposition": `inline; filename="${String(name).replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "กรุณาแนบไฟล์หลักฐาน (รูป หรือ PDF)" }, { status: 400 });
  const mime = (file.type || "").toLowerCase();
  if (!ALLOWED_B2B_FILE_MIME.includes(mime)) return NextResponse.json({ error: "แนบได้เฉพาะรูป (JPG/PNG/WebP/HEIC) หรือ PDF" }, { status: 400 });
  if (file.size > MAX_B2B_FILE_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 15 MB" }, { status: 413 });
  const received = form?.get("received_date");
  if (!isIsoDate(received)) return NextResponse.json({ error: "กรุณาระบุวันที่ลูกค้าชำระ" }, { status: 400 });
  const note = String(form?.get("note") ?? "").trim().slice(0, 500) || null;

  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  let saved: string | null = null;
  let oldFile: string | null = null;
  try {
    await tx.begin();
    const it = (await new sql.Request(tx).input("id", sql.Int, id).query(`
      SELECT i.id, i.project_id, i.no, i.status, i.evidence_file, p.stage
      FROM b2b_project_installments i WITH (UPDLOCK, ROWLOCK) JOIN b2b_projects p ON p.id = i.project_id WHERE i.id = @id`)).recordset[0];
    if (!it) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบงวด" }, { status: 404 }); }
    if (it.status !== "due" && it.status !== "submitted") {
      await tx.rollback();
      return NextResponse.json({ error: it.status === "paid" ? "งวดนี้บัญชียืนยันรับเงินแล้ว" : "งวดนี้ยังไม่ถึงกำหนด — กด \"ถึงกำหนด\" ก่อน" }, { status: 409 });
    }
    if (it.stage >= 3950) { await tx.rollback(); return NextResponse.json({ error: "โครงการปิดอยู่" }, { status: 409 }); }
    saved = buildB2bFileName(it.project_id, `inst${it.no}`, mime);
    await saveB2bFile(saved, Buffer.from(await file.arrayBuffer()));
    oldFile = it.evidence_file;
    await new sql.Request(tx).input("id", sql.Int, id).input("f", sql.NVarChar(300), saved)
      .input("n", sql.NVarChar(200), file.name.slice(0, 200)).input("m", sql.NVarChar(100), mime)
      .input("d", sql.Date, received).input("note", sql.NVarChar(500), note).input("u", sql.Int, gate.userId)
      .query(`UPDATE b2b_project_installments SET status = 'submitted', evidence_file = @f, evidence_name = @n, evidence_mime = @m,
                received_date = @d, submit_note = @note, submitted_by = @u, submitted_at = SYSDATETIMEOFFSET(),
                reject_note = NULL, rejected_by = NULL, rejected_at = NULL, updated_at = SYSDATETIMEOFFSET()
              WHERE id = @id`);
    await logActivity(tx, it.project_id, "installment_submitted", { message: `แนบหลักฐานรับเงินงวด ${it.no} (ลูกค้าชำระ ${thaiDateShort(received)}) — รอบัญชียืนยัน${note ? ` · ${note}` : ""}`, userId: gate.userId });
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    await removeB2bFile(saved);
    console.error("POST /api/b2b/installments/[id]/evidence error:", e);
    return NextResponse.json({ error: "แนบหลักฐานไม่สำเร็จ" }, { status: 500 });
  }
  if (oldFile && oldFile !== saved) await removeB2bFile(oldFile);   // แนบใหม่ทับ — ลบไฟล์เก่าหลัง commit
  return NextResponse.json({ ok: true });
}
