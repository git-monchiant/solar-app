import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";

// Customer-side signatures stored as BLOBs on the leads row.
//
//   GET    /api/leads/:id/signature/:field  -> streams the PNG bytes (public; signed docs need it)
//   PUT    /api/leads/:id/signature/:field  -> body = PNG bytes
//   DELETE /api/leads/:id/signature/:field  -> clears
//
// :field is one of survey_customer | install_customer | warranty_customer.
// Each maps to <field>_signature_data / _mime / _url columns; the _url column
// is updated to point back at this endpoint so <img src={url}> renders inline.

const FIELDS = new Set(["survey_customer", "install_customer", "warranty_customer"]);
const cols = (field: string) => ({
  data: `${field}_signature_data`,
  mime: `${field}_signature_mime`,
  url: `${field}_signature_url`,
});

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; field: string }> }) {
  const { id, field } = await params;
  if (!FIELDS.has(field)) return NextResponse.json({ error: "invalid field" }, { status: 400 });
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const c = cols(field);
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT ${c.data} AS data, ${c.mime} AS mime FROM leads WHERE id = @id`);
    const row = r.recordset[0];
    if (!row?.data) return NextResponse.json({ error: "not found" }, { status: 404 });
    return new NextResponse(new Uint8Array(row.data), {
      headers: {
        "Content-Type": row.mime || "image/png",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error("GET /api/leads/[id]/signature/[field] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string; field: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id, field } = await params;
  if (!FIELDS.has(field)) return NextResponse.json({ error: "invalid field" }, { status: 400 });
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const buf = Buffer.from(await req.arrayBuffer());
    if (buf.length === 0) return NextResponse.json({ error: "empty body" }, { status: 400 });
    const mime = req.headers.get("content-type") || "image/png";
    const url = `/api/leads/${leadId}/signature/${field}?v=${Date.now()}`;
    const c = cols(field);
    const db = await getDb();
    await db.request()
      .input("id", sql.Int, leadId)
      .input("data", sql.VarBinary(sql.MAX), buf)
      .input("mime", sql.NVarChar(50), mime)
      .input("url", sql.NVarChar(200), url)
      .query(`UPDATE leads SET ${c.data} = @data, ${c.mime} = @mime, ${c.url} = @url, updated_at = GETDATE() WHERE id = @id`);
    return NextResponse.json({ url });
  } catch (e) {
    console.error("PUT /api/leads/[id]/signature/[field] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; field: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const { id, field } = await params;
  if (!FIELDS.has(field)) return NextResponse.json({ error: "invalid field" }, { status: 400 });
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ error: "invalid id" }, { status: 400 });
  try {
    const c = cols(field);
    const db = await getDb();
    await db.request().input("id", sql.Int, leadId)
      .query(`UPDATE leads SET ${c.data} = NULL, ${c.mime} = NULL, ${c.url} = NULL, updated_at = GETDATE() WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("DELETE /api/leads/[id]/signature/[field] error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
