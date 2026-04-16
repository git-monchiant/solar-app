import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 30;

// POST /api/slips   multipart: file, lead_id, slip_field  → { id, url }
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const leadId = parseInt(String(form.get("lead_id") || ""));
    const slipField = String(form.get("slip_field") || "");
    if (!file || !leadId || !slipField) {
      return NextResponse.json({ error: "file, lead_id, slip_field required" }, { status: 400 });
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    const db = await getDb();

    // Upsert semantics: only 1 row per (lead_id, slip_field). A new verified
    // upload replaces the previous one so /api/slips/<old_id> URLs retire cleanly.
    await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`DELETE FROM slip_files WHERE lead_id = @lead_id AND slip_field = @slip_field`);

    const result = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .input("data", sql.VarBinary(sql.MAX), bytes)
      .input("mime", sql.NVarChar(50), file.type || "image/jpeg")
      .input("filename", sql.NVarChar(200), file.name || null)
      .query(`
        INSERT INTO slip_files (lead_id, slip_field, data, mime, filename)
        OUTPUT INSERTED.id
        VALUES (@lead_id, @slip_field, @data, @mime, @filename)
      `);
    const id = result.recordset[0].id;
    return NextResponse.json({ id, url: `/api/slips/${id}` });
  } catch (e) {
    console.error("POST /api/slips error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
