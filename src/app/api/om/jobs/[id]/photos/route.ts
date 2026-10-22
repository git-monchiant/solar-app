import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { OM_WORK_ROLES } from "@/lib/om/om-roles";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { omErrorText } from "@/lib/om/api-error";
import {
  ALLOWED_PHOTO_MIME, MAX_PHOTO_BYTES, buildPhotoName, isPhotoKind,
  parsePhotos, removePhoto, savePhoto, type JobPhoto,
} from "@/lib/om/photo-store";

// รูปหน้างานของใบงาน — อัปโหลด / ลบ
// ★ ผู้ใช้เคาะ 16 ก.ย. 69: มีช่องรูปก่อน/หลัง แต่ "ไม่บังคับ" ปิดงานได้โดยไม่มีรูป
//   → 22 ต.ค. 69 เปลี่ยนเป็นบังคับอย่างละ 1 รูป (missingPhotos ใน job-form.ts · กันที่ PUT /report + PATCH ปิดงาน)
// ★ ไฟล์อยู่นอก public/ (ดูเหตุผลใน src/lib/om/photo-store.ts) · ในฐานเก็บชื่อไฟล์ ไม่ใช่ URL

/** อ่าน photos ปัจจุบัน + เช็กว่าใบงานมีจริง — ใช้ร่วมกันทั้ง POST และ DELETE */
async function current(db: sql.ConnectionPool, id: number) {
  const r = await db.request().input("id", sql.Int, id).query(`
    SELECT b.id, r.id report_id, r.photos
      FROM om_bookings b
      LEFT JOIN om_job_report r ON r.booking_id = b.id
     WHERE b.id = @id`);
  const row = r.recordset[0];
  return row ? { reportId: row.report_id as number | null, photos: parsePhotos(row.photos) } : null;
}

/** เขียน photos กลับ — ★ เลี่ยง MERGE: UPDATE ก่อน ไม่โดนแถวค่อย INSERT (กติกาโปรเจกต์) */
async function writeBack(db: sql.ConnectionPool, id: number, photos: JobPhoto[]) {
  const json = JSON.stringify(photos);
  const up = await db.request().input("id", sql.Int, id).input("p", sql.NVarChar(sql.MAX), json)
    .query(`UPDATE om_job_report SET photos = @p, updated_at = SYSDATETIMEOFFSET() WHERE booking_id = @id`);
  if (up.rowsAffected[0] === 0)
    await db.request().input("id", sql.Int, id).input("p", sql.NVarChar(sql.MAX), json)
      .query(`INSERT INTO om_job_report (booking_id, photos, started_at) VALUES (@id, @p, SYSDATETIMEOFFSET())`);
}

// POST (multipart) — field: file, kind = before | after
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "กรุณาแนบไฟล์" }, { status: 400 });
  if (!isPhotoKind(kind)) return NextResponse.json({ error: "กรุณาระบุว่าเป็นรูปก่อนหรือหลังให้บริการ" }, { status: 400 });
  if (!ALLOWED_PHOTO_MIME.includes(file.type))
    return NextResponse.json({ error: "อัปโหลดได้เฉพาะไฟล์รูปภาพ" }, { status: 400 });
  if (file.size > MAX_PHOTO_BYTES)
    return NextResponse.json({ error: "ไฟล์มีขนาดเกิน 15 MB" }, { status: 413 });

  const db = await getOmDb();
  const cur = await current(db, id);
  if (!cur) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });

  const name = buildPhotoName(id, kind, file.type);
  await savePhoto(name, Buffer.from(await file.arrayBuffer()));

  const photos = [...cur.photos, {
    file: name, kind, at: new Date().toISOString(), by: gate.userId ?? null, size: file.size,
  }];
  try {
    await writeBack(db, id, photos);
  } catch (e) {
    // เขียนฐานไม่สำเร็จ = ไฟล์บนดิสก์จะกลายเป็นขยะที่ไม่มีใครอ้างถึง ⇒ เก็บกวาดทันที
    await removePhoto(name);
    return NextResponse.json({ error: omErrorText(e, "บันทึกรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง", "POST /api/om/jobs/[id]/photos") }, { status: 500 });
  }
  return NextResponse.json({ ok: true, photos }, { status: 201 });
}

// DELETE ?file=<ชื่อไฟล์> — ลบออกจากรายการแล้วค่อยลบไฟล์
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyRole(req, OM_WORK_ROLES);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  const name = req.nextUrl.searchParams.get("file") ?? "";

  const db = await getOmDb();
  const cur = await current(db, id);
  if (!cur) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
  if (!cur.photos.some((p) => p.file === name))
    return NextResponse.json({ error: "ไม่พบรูปนี้ในใบงาน" }, { status: 404 });

  const photos = cur.photos.filter((p) => p.file !== name);
  await writeBack(db, id, photos);
  await removePhoto(name);
  return NextResponse.json({ ok: true, photos });
}
