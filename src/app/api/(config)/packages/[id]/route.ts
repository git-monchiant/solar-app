import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const body = await req.json();
    const db = await getDb();

    const sets: string[] = [];
    const request = db.request().input("id", sql.Int, parseInt(id));

    const fields: Record<string, { type: unknown; value: unknown }> = {
      name: { type: sql.NVarChar(100), value: body.name },
      kwp: { type: sql.Decimal(5, 1), value: body.kwp },
      phase: { type: sql.Int, value: body.phase },
      has_battery: { type: sql.Bit, value: body.has_battery },
      has_panel: { type: sql.Bit, value: body.has_panel },
      has_inverter: { type: sql.Bit, value: body.has_inverter },
      is_upgrade: { type: sql.Bit, value: body.is_upgrade },
      is_other: { type: sql.Bit, value: body.is_other },
      battery_kwh: { type: sql.Decimal(5, 1), value: body.battery_kwh },
      battery_brand: { type: sql.NVarChar(50), value: body.battery_brand },
      battery_model: { type: sql.NVarChar(150), value: body.battery_model },
      inverter_kw: { type: sql.Decimal(5, 1), value: body.inverter_kw },
      inverter_brand: { type: sql.NVarChar(50), value: body.inverter_brand },
      inverter_model: { type: sql.NVarChar(100), value: body.inverter_model },
      installed_kwp: { type: sql.Decimal(6, 2), value: body.installed_kwp },
      panel_count: { type: sql.Int, value: body.panel_count },
      panel_watt: { type: sql.Int, value: body.panel_watt },
      panel_brand: { type: sql.NVarChar(100), value: body.panel_brand },
      price: { type: sql.Decimal(12, 2), value: body.price },
      monthly_installment: { type: sql.NVarChar(20), value: body.monthly_installment },
      monthly_saving: { type: sql.Decimal(10, 2), value: body.monthly_saving },
      warranty_years: { type: sql.Int, value: body.warranty_years },
      is_active: { type: sql.Bit, value: body.is_active },
      start_date: { type: sql.Date, value: body.start_date ? toSqlDate(body.start_date) : undefined },
      expire_date: { type: sql.Date, value: body.expire_date ? toSqlDate(body.expire_date) : undefined },
    };

    for (const [key, { type, value }] of Object.entries(fields)) {
      if (value !== undefined) {
        request.input(key, type as sql.ISqlTypeWithLength, value);
        sets.push(`${key} = @${key}`);
      }
    }

    if (sets.length === 0) return NextResponse.json({ error: "No fields" }, { status: 400 });

    const result = await request.query(`UPDATE packages SET ${sets.join(", ")} OUTPUT INSERTED.* WHERE id = @id`);
    return NextResponse.json(fixDates(result.recordset)[0]);
  } catch (error) {
    console.error("PATCH /api/packages/[id] error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const { id } = await params;
    const db = await getDb();
    await db.request().input("id", sql.Int, parseInt(id)).query(`UPDATE packages SET is_active = 0 WHERE id = @id`);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/packages/[id] error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
