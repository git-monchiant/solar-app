import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_PROJECT_VIEW_ROLES } from "@/lib/b2b/project";
import type { MilestoneFile } from "@/lib/b2b/execution";
import { b2bFilePath, isSafeB2bName } from "@/lib/b2b/file-store";

// เปิดรูป/ไฟล์ของ milestone — ตรวจว่าไฟล์อยู่ในรายการของแถวนี้จริงก่อนแตะดิสก์ (แบบรูปหน้างาน O&M)
// คนเปิดหน้าโครงการได้ + Purchase (เห็นไฟล์ของ "สั่งของครบ" ในหน้าจัดซื้อ)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; name: string }> }) {
  const gate = await requireAnyActiveRole(req, [...B2B_PROJECT_VIEW_ROLES, "purchase"]);
  if (gate.error) return gate.error;
  const { id, name } = await params;
  if (!isSafeB2bName(name)) return NextResponse.json({ error: "ชื่อไฟล์ไม่ถูกต้อง" }, { status: 400 });
  const r = (await (await getB2bDb()).request().input("id", sql.Int, parseInt(id) || 0)
    .query(`SELECT kind, files_json FROM b2b_project_milestones WHERE id = @id`)).recordset[0];
  if (!r) return NextResponse.json({ error: "ไม่พบรายการ" }, { status: 404 });
  if (!gate.roles.some((x) => x !== "purchase") && r.kind !== "procured") return NextResponse.json({ error: "ไม่มีสิทธิ์" }, { status: 403 });
  const f = (r.files_json ? (JSON.parse(r.files_json) as MilestoneFile[]) : []).find((x) => x.file === name);
  const p = f ? await b2bFilePath(f.file) : null;
  if (!f || !p) return NextResponse.json({ error: "ไม่พบไฟล์" }, { status: 404 });
  return new NextResponse(new Uint8Array(await readFile(p)), {
    headers: {
      "Content-Type": f.mime,
      "Content-Disposition": `inline; filename="${f.name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
