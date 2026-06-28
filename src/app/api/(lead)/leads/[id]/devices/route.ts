import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// /api/leads/[id]/devices
//
// GET  → { inverters, batteries, panels } — all three device types in one
//        roundtrip so the Warranty step can hydrate its form without 3 fetches.
// PUT  → replace all of one type. Body: { type, items }. The "replace" pattern
//        matches the WarrantyStep UI which always saves the full set on each
//        submit; spares us a per-row diff. Empty items array clears the type.
//
// Returns are after-write reads so the client gets canonical ids + timestamps
// to render without a follow-up GET.

type DeviceType = "inverters" | "batteries" | "panels";
const TYPES: DeviceType[] = ["inverters", "batteries", "panels"];

const TABLE: Record<DeviceType, string> = {
  inverters: "lead_inverters",
  batteries: "lead_batteries",
  panels:    "lead_panels",
};

interface InverterRow { brand?: string | null; kw?: number | null; serial_no?: string | null; photo_url?: string | null; cert_url?: string | null; }
interface BatteryRow  { brand?: string | null; kwh?: number | null; serial_no?: string | null; photo_url?: string | null; }
interface PanelRow    { brand?: string | null; serial_no?: string | null; }

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const db = await getDb();
    const [inv, batt, pan] = await Promise.all([
      db.request().input("id", sql.Int, leadId).query(`
        SELECT id, brand, kw, serial_no, photo_url, cert_url, position, created_at, updated_at
        FROM lead_inverters WHERE lead_id = @id ORDER BY position, id
      `),
      db.request().input("id", sql.Int, leadId).query(`
        SELECT id, brand, kwh, serial_no, photo_url, position, created_at, updated_at
        FROM lead_batteries WHERE lead_id = @id ORDER BY position, id
      `),
      db.request().input("id", sql.Int, leadId).query(`
        SELECT id, brand, serial_no, position, created_at, updated_at
        FROM lead_panels WHERE lead_id = @id ORDER BY position, id
      `),
    ]);
    return NextResponse.json({
      inverters: fixDates(inv.recordset),
      batteries: fixDates(batt.recordset),
      panels:    fixDates(pan.recordset),
    });
  } catch (e) {
    console.error("GET /api/leads/[id]/devices error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const leadId = parseInt(id);
    if (!leadId) return NextResponse.json({ error: "invalid lead id" }, { status: 400 });

    const body = await req.json() as { type?: string; items?: Array<InverterRow | BatteryRow | PanelRow> };
    const type = body.type as DeviceType;
    if (!TYPES.includes(type)) {
      return NextResponse.json({ error: `type must be one of ${TYPES.join("|")}` }, { status: 400 });
    }
    const items = Array.isArray(body.items) ? body.items : [];

    const db = await getDb();
    const table = TABLE[type];

    // Transaction: clear current rows, insert new set in declared order.
    // Position comes from the array index so the UI can preserve ordering
    // (panel rows especially — installer-supplied SN sequence matters).
    const tx = new sql.Transaction(db);
    await tx.begin();
    try {
      await new sql.Request(tx).input("id", sql.Int, leadId)
        .query(`DELETE FROM ${table} WHERE lead_id = @id`);

      for (let i = 0; i < items.length; i++) {
        const it = items[i] as Record<string, unknown>;
        const r = new sql.Request(tx)
          .input("lead_id",   sql.Int,           leadId)
          .input("brand",     sql.NVarChar(100), (it.brand as string | null) ?? null)
          .input("serial_no", sql.NVarChar(100), (it.serial_no as string | null) ?? null)
          .input("position",  sql.Int,           i);
        if (type === "inverters") {
          r.input("kw",        sql.Decimal(10, 3), it.kw != null && it.kw !== "" ? Number(it.kw) : null);
          r.input("photo_url", sql.NVarChar(500), (it.photo_url as string | null) ?? null);
          r.input("cert_url",  sql.NVarChar(500), (it.cert_url  as string | null) ?? null);
          await r.query(`
            INSERT INTO lead_inverters (lead_id, brand, kw, serial_no, photo_url, cert_url, position)
            VALUES (@lead_id, @brand, @kw, @serial_no, @photo_url, @cert_url, @position)
          `);
        } else if (type === "batteries") {
          r.input("kwh",       sql.Decimal(10, 3), it.kwh != null && it.kwh !== "" ? Number(it.kwh) : null);
          r.input("photo_url", sql.NVarChar(500), (it.photo_url as string | null) ?? null);
          await r.query(`
            INSERT INTO lead_batteries (lead_id, brand, kwh, serial_no, photo_url, position)
            VALUES (@lead_id, @brand, @kwh, @serial_no, @photo_url, @position)
          `);
        } else {
          await r.query(`
            INSERT INTO lead_panels (lead_id, brand, serial_no, position)
            VALUES (@lead_id, @brand, @serial_no, @position)
          `);
        }
      }
      await tx.commit();
    } catch (e) {
      await tx.rollback();
      throw e;
    }

    // Read back so the client sees ids/timestamps without a follow-up GET.
    const select = type === "inverters"
      ? `SELECT id, brand, kw, serial_no, photo_url, cert_url, position, created_at, updated_at FROM lead_inverters WHERE lead_id = @id ORDER BY position, id`
      : type === "batteries"
      ? `SELECT id, brand, kwh, serial_no, photo_url, position, created_at, updated_at FROM lead_batteries WHERE lead_id = @id ORDER BY position, id`
      : `SELECT id, brand, serial_no, position, created_at, updated_at FROM lead_panels WHERE lead_id = @id ORDER BY position, id`;
    const result = await db.request().input("id", sql.Int, leadId).query(select);
    return NextResponse.json({ items: fixDates(result.recordset) });
  } catch (e) {
    console.error("PUT /api/leads/[id]/devices error:", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
