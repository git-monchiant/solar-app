import { NextRequest, NextResponse } from "next/server";
import { requireAnyRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { listSettings } from "@/lib/om/settings";

// ค่าตั้งของโมดูล O&M — ทุกกติกาการจอง/เลื่อนนัด/ความจุ อยู่ที่นี่
// ★ ผู้ใช้เคาะ 31 ส.ค.: ห้าม hardcode ค่าพวกนี้ในโค้ด แก้ได้จากหน้าเว็บโดยไม่ต้อง deploy

const ADMIN = ["admin", "solar_sup", "sales_sup"] as const;

export async function GET(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;
  return NextResponse.json({ settings: await listSettings() });
}

// PATCH { key, value }  — value เป็น number | boolean | string | null (null = กลับไปใช้ค่าผ่อนปรน)
export async function PATCH(req: NextRequest) {
  const gate = await requireAnyRole(req, ADMIN);
  if (gate.error) return gate.error;

  const b = await req.json().catch(() => ({}));
  const key = typeof b.key === "string" ? b.key.trim() : "";
  if (!key) return NextResponse.json({ error: "ต้องระบุ key" }, { status: 400 });

  const db = await getOmDb();
  const cur = await db.request().input("k", sql.NVarChar(80), key)
    .query(`SELECT [key] FROM om_settings WHERE [key] = @k COLLATE Latin1_General_BIN2`);
  if (!cur.recordset[0]) return NextResponse.json({ error: "ไม่รู้จักค่านี้" }, { status: 404 });

  // เก็บเป็น JSON — number/boolean/null เท่านั้นที่ผ่าน CHECK ในฐาน
  let json: string | null = null;
  if (b.value !== null && b.value !== undefined && b.value !== "") {
    if (typeof b.value === "boolean" || typeof b.value === "number") json = JSON.stringify(b.value);
    else if (typeof b.value === "string") {
      const n = Number(b.value);
      if (b.value === "true" || b.value === "false") json = b.value;
      else if (Number.isFinite(n)) json = String(n);
      else return NextResponse.json({ error: "ค่าต้องเป็นตัวเลขหรือ true/false" }, { status: 400 });
    }
  }
  // ตัวเลขต้องไม่ติดลบ (ชั่วโมง/จำนวนครั้ง/จำนวนคิว)
  if (json !== null && Number.isFinite(Number(json)) && Number(json) < 0) {
    return NextResponse.json({ error: "ค่าต้องไม่ติดลบ" }, { status: 400 });
  }

  await db.request()
    .input("k", sql.NVarChar(80), key)
    .input("v", sql.NVarChar(sql.MAX), json)
    .input("u", sql.Int, gate.userId)
    .query(`UPDATE om_settings SET value_json = @v, updated_by = @u, updated_at = SYSDATETIMEOFFSET()
            WHERE [key] = @k COLLATE Latin1_General_BIN2`);

  return NextResponse.json({ ok: true, key, value: json === null ? null : JSON.parse(json) });
}
