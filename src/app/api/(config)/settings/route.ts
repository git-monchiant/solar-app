import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const result = await db.request().query(`SELECT [key], value FROM app_settings`);
    const settings: Record<string, string> = {};
    for (const row of result.recordset) settings[row.key] = row.value;
    return NextResponse.json(settings);
  } catch (error) {
    console.error("GET /api/settings error:", error);
    return NextResponse.json({ error: "Failed to fetch settings" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const body = await req.json() as Record<string, string | boolean>;
    const db = await getDb();
    for (const [key, value] of Object.entries(body)) {
      await db.request()
        .input("key", sql.NVarChar(100), key)
        .input("value", sql.NVarChar(sql.MAX), String(value))
        .query(`
          MERGE app_settings AS target
          USING (SELECT @key AS [key], @value AS value) AS src
          ON target.[key] = src.[key]
          WHEN MATCHED THEN UPDATE SET value = src.value, updated_at = GETDATE()
          WHEN NOT MATCHED THEN INSERT ([key], value) VALUES (src.[key], src.value);
        `);
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("PATCH /api/settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
