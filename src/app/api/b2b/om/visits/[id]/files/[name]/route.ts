import { readFile } from "fs/promises";
import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb, sql } from "@/lib/b2b/db";
import { B2B_OM_ROLES, type VisitFile } from "@/lib/b2b/om";
import { b2bFilePath, isSafeB2bName } from "@/lib/b2b/file-store";

// เปิดรายงาน/รูปของครั้งเข้างาน — ตรวจว่าไฟล์อยู่ในรายการของแถวนี้จริงก่อนแตะดิสก์ (แบบไฟล์ milestone)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; name: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_OM_ROLES);
  if (gate.error) return gate.error;
  const { id, name } = await params;
  if (!isSafeB2bName(name)) return NextResponse.json({ error: "ชื่อไฟล์ไม่ถูกต้อง" }, { status: 400 });
  const r = (await (await getB2bDb()).request().input("id", sql.Int, parseInt(id) || 0)
    .query(`SELECT files_json FROM b2b_om_visits WHERE id = @id`)).recordset[0];
  const f = (r?.files_json ? (JSON.parse(r.files_json) as VisitFile[]) : []).find((x) => x.file === name);
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
