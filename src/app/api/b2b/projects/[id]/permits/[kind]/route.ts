import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_ROLES, B2B_PROJECT_VIEW_ROLES, B2B_STAGE, isIsoDate } from "@/lib/b2b/project";
import { PERMITS, PERMIT_STATUS_LABEL, isPermitKind, isPermitStatus } from "@/lib/b2b/execution";
import { logActivity } from "@/lib/b2b/project-server";
import {
  ALLOWED_B2B_FILE_MIME, MAX_B2B_FILE_BYTES, b2bFilePath, buildB2bFileName, mimeOfB2bName, removeB2bFile, saveB2bFile,
} from "@/lib/b2b/file-store";

// เช็กลิสต์ขออนุญาต 3 อย่างของโครงการ (แผน 20261015-07 เฟส 4) — ทำคู่ขนานตั้งแต่ได้งานจนก่อนปิดโครงการ
//   PUT (multipart: status · submitted_date · approved_date · note · file?) Solar B2B / admin
//     ยื่นแล้ว ต้องมีวันยื่น · ได้แล้ว ต้องมีวันที่ได้ · ไฟล์เดียว (เอกสารที่ได้) แนบใหม่ทับ
//   GET เปิดไฟล์เอกสาร — คนเปิดหน้าโครงการได้

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_VIEW_ROLES);
  if (gate.error) return gate.error;
  const { id, kind } = await params;
  if (!isPermitKind(kind)) return NextResponse.json({ error: "ชนิดไม่ถูกต้อง" }, { status: 400 });
  const r = (await (await getB2bDb()).request().input("p", sql.Int, parseInt(id) || 0).input("k", sql.VarChar(20), kind)
    .query(`SELECT file_name, file_label, file_mime FROM b2b_project_permits WHERE project_id = @p AND kind = @k`)).recordset[0];
  const path = await b2bFilePath(r?.file_name);
  if (!path) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  const label = r.file_label || r.file_name;
  return new NextResponse(new Uint8Array(await readFile(path)), {
    headers: {
      "Content-Type": r.file_mime || mimeOfB2bName(r.file_name),
      "Content-Disposition": `inline; filename="${String(label).replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(label)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const { id: rawId, kind } = await params;
  const id = parseInt(rawId);
  if (!Number.isFinite(id) || !isPermitKind(kind)) return NextResponse.json({ error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 });
  const form = await req.formData().catch(() => null);
  const status = form?.get("status");
  if (!isPermitStatus(status)) return NextResponse.json({ error: "สถานะไม่ถูกต้อง" }, { status: 400 });
  const sub = form?.get("submitted_date");
  const appr = form?.get("approved_date");
  const submitted = isIsoDate(sub) ? sub : null;
  const approved = isIsoDate(appr) ? appr : null;
  if (status === "submitted" && !submitted) return NextResponse.json({ error: "กรุณาระบุวันที่ยื่น" }, { status: 400 });
  if (status === "approved" && !approved) return NextResponse.json({ error: "กรุณาระบุวันที่ได้" }, { status: 400 });
  const note = String(form?.get("note") ?? "").trim().slice(0, 500) || null;
  const file = form?.get("file");
  const hasFile = file instanceof File && file.size > 0;
  if (hasFile) {
    if (!ALLOWED_B2B_FILE_MIME.includes((file.type || "").toLowerCase())) return NextResponse.json({ error: "แนบได้เฉพาะรูป หรือ PDF" }, { status: 400 });
    if (file.size > MAX_B2B_FILE_BYTES) return NextResponse.json({ error: "ไฟล์ใหญ่เกิน 15 MB" }, { status: 413 });
  }
  const db = await getB2bDb();
  const tx = new sql.Transaction(db);
  let saved: string | null = null;
  let oldFile: string | null = null;
  try {
    await tx.begin();
    const p = (await new sql.Request(tx).input("id", sql.Int, id).query(`SELECT stage FROM b2b_projects WITH (UPDLOCK) WHERE id = @id`)).recordset[0];
    if (!p) { await tx.rollback(); return NextResponse.json({ error: "ไม่พบโครงการ" }, { status: 404 }); }
    if (p.stage < B2B_STAGE.won || p.stage >= B2B_STAGE.closed) { await tx.rollback(); return NextResponse.json({ error: "ขออนุญาตบันทึกได้หลังได้งานจนก่อนปิดโครงการ" }, { status: 409 }); }
    const cur = (await new sql.Request(tx).input("p", sql.Int, id).input("k", sql.VarChar(20), kind)
      .query(`SELECT file_name FROM b2b_project_permits WITH (UPDLOCK) WHERE project_id = @p AND kind = @k`)).recordset[0];
    oldFile = cur?.file_name ?? null;
    if (hasFile) {
      const mime = (file as File).type.toLowerCase();
      saved = buildB2bFileName(id, `permit_${kind}`, mime);
      await saveB2bFile(saved, Buffer.from(await (file as File).arrayBuffer()));
    }
    const r = new sql.Request(tx).input("p", sql.Int, id).input("k", sql.VarChar(20), kind).input("s", sql.VarChar(15), status)
      .input("sd", sql.Date, submitted).input("ad", sql.Date, approved).input("n", sql.NVarChar(500), note).input("u", sql.Int, gate.userId)
      .input("f", sql.NVarChar(300), saved).input("fl", sql.NVarChar(200), hasFile ? (file as File).name.slice(0, 200) : null)
      .input("fm", sql.NVarChar(100), hasFile ? (file as File).type.toLowerCase() : null);
    await r.query(`
      MERGE b2b_project_permits WITH (HOLDLOCK) AS t
      USING (SELECT @p AS project_id, @k AS kind) AS s ON t.project_id = s.project_id AND t.kind = s.kind
      WHEN MATCHED THEN UPDATE SET status = @s, submitted_date = @sd, approved_date = @ad, note = @n,
        file_name = COALESCE(@f, t.file_name), file_label = COALESCE(@fl, t.file_label), file_mime = COALESCE(@fm, t.file_mime),
        updated_by = @u, updated_at = SYSDATETIMEOFFSET()
      WHEN NOT MATCHED THEN INSERT (project_id, kind, status, submitted_date, approved_date, note, file_name, file_label, file_mime, updated_by)
        VALUES (@p, @k, @s, @sd, @ad, @n, @f, @fl, @fm, @u);`);
    const label = PERMITS.find((x) => x.kind === kind)!.label;
    await logActivity(tx, id, "permit", { message: `${label}: ${PERMIT_STATUS_LABEL[status]}${note ? ` — ${note}` : ""}${hasFile ? " · แนบเอกสาร" : ""}`, userId: gate.userId });
    await new sql.Request(tx).input("p", sql.Int, id).query(`UPDATE b2b_projects SET updated_at = SYSDATETIMEOFFSET() WHERE id = @p`);
    await tx.commit();
  } catch (e) {
    try { await tx.rollback(); } catch {}
    await removeB2bFile(saved);
    console.error("PUT /api/b2b/projects/[id]/permits/[kind] error:", e);
    return NextResponse.json({ error: "บันทึกไม่สำเร็จ" }, { status: 500 });
  }
  if (saved && oldFile && oldFile !== saved) await removeB2bFile(oldFile);
  return NextResponse.json({ ok: true });
}
