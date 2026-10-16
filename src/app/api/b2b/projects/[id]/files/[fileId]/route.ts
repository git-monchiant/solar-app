import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_ROLES, B2B_PROJECT_VIEW_ROLES, isClosedStage } from "@/lib/b2b/project";
import { logActivity } from "@/lib/b2b/project-server";
import { b2bFilePath, removeB2bFile } from "@/lib/b2b/file-store";

// ไฟล์ของโครงการ 1 ไฟล์ (แผน 20261015-10) — GET เปิด (คนเปิดหน้าโครงการได้) · DELETE ลบ (Solar B2B / admin · โครงการยังเปิด)
// ตรวจว่าไฟล์เป็นของโครงการใน URL จริงก่อนแตะดิสก์
async function find(projectId: number, fileId: number) {
  return (await (await getB2bDb()).request().input("p", sql.Int, projectId).input("f", sql.Int, fileId)
    .query(`SELECT f.id, f.kind, f.file_name, f.label, f.mime, p.stage FROM b2b_project_files f JOIN b2b_projects p ON p.id = f.project_id
            WHERE f.id = @f AND f.project_id = @p`)).recordset[0];
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_VIEW_ROLES);
  if (gate.error) return gate.error;
  const { id, fileId } = await params;
  const f = await find(parseInt(id) || 0, parseInt(fileId) || 0);
  const path = f ? await b2bFilePath(f.file_name) : null;
  if (!f || !path) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  return new NextResponse(new Uint8Array(await readFile(path)), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${String(f.label).replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(f.label)}`,
      "Cache-Control": "private, no-store",
    },
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; fileId: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_PROJECT_ROLES);
  if (gate.error) return gate.error;
  const { id: rawId, fileId } = await params;
  const id = parseInt(rawId) || 0;
  const f = await find(id, parseInt(fileId) || 0);
  if (!f) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  if (isClosedStage(f.stage)) return NextResponse.json({ error: "โครงการปิด/แพ้/ยกเลิกแล้ว — ลบไฟล์ไม่ได้" }, { status: 409 });
  const db = await getB2bDb();
  await db.request().input("f", sql.Int, f.id).query(`DELETE FROM b2b_project_files WHERE id = @f`);
  await logActivity(db, id, "file_removed", { message: `ลบไฟล์ "${f.label}"`, userId: gate.userId });
  await removeB2bFile(f.file_name);
  return NextResponse.json({ ok: true });
}
