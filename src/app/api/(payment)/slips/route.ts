import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_SLIPS = 5;

// GET /api/slips?lead_id=<id>&slip_field=<field>
// List staging slips for a (lead, slip_field) pair. Used by PaymentSection to
// render up to MAX_SLIPS slot thumbnails before confirm.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { searchParams } = new URL(req.url);
    const leadId = parseInt(searchParams.get("lead_id") || "0");
    const slipField = searchParams.get("slip_field") || "";
    if (!leadId || !slipField) {
      return NextResponse.json({ error: "lead_id and slip_field required" }, { status: 400 });
    }
    const db = await getDb();
    const r = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`
        SELECT id, mime, filename, uploaded_at, DATALENGTH(data) AS bytes
        FROM slip_files
        WHERE lead_id = @lead_id AND slip_field = @slip_field
        ORDER BY id ASC
      `);
    return NextResponse.json({
      slips: r.recordset.map((row) => ({
        id: row.id,
        url: `/api/slips/${row.id}`,
        mime: row.mime,
        filename: row.filename,
        bytes: row.bytes,
        uploaded_at: row.uploaded_at,
      })),
    });
  } catch (e) {
    console.error("GET /api/slips error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

// POST /api/slips   multipart: file, lead_id, slip_field  → { id, url }
// Append semantics: up to MAX_SLIPS rows per (lead_id, slip_field). Each new verified
// upload creates a new slot. Rejects when the cap is already reached.
export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
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

    const countRes = await db.request()
      .input("lead_id", sql.Int, leadId)
      .input("slip_field", sql.NVarChar(50), slipField)
      .query(`SELECT COUNT(*) AS n FROM slip_files WHERE lead_id = @lead_id AND slip_field = @slip_field`);
    if ((countRes.recordset[0]?.n ?? 0) >= MAX_SLIPS) {
      return NextResponse.json({ error: `Max ${MAX_SLIPS} slips per payment` }, { status: 400 });
    }

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
