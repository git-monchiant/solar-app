import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const all = req.nextUrl.searchParams.get("all");
    const query = all
      ? `SELECT * FROM packages ORDER BY is_active DESC, has_battery, kwp, phase`
      : `SELECT * FROM packages WHERE is_active = 1 AND start_date <= CAST(GETDATE() AS DATE) AND expire_date >= CAST(GETDATE() AS DATE) ORDER BY has_battery, kwp, phase`;
    const result = await db.request().query(query);
    return NextResponse.json(fixDates(result.recordset));
  } catch (error) {
    console.error("GET /api/packages error:", error);
    return NextResponse.json({ error: "Failed to fetch packages" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const body = await req.json();
    const db = await getDb();
    const today = new Date();
    const default99 = new Date(today.getFullYear() + 99, today.getMonth(), today.getDate());

    const result = await db.request()
      .input("name", sql.NVarChar(100), body.name)
      .input("kwp", sql.Decimal(5, 1), body.kwp || 0)
      .input("phase", sql.Int, body.phase || 1)
      .input("has_battery", sql.Bit, body.has_battery ? 1 : 0)
      .input("has_panel", sql.Bit, body.has_panel ? 1 : 0)
      .input("has_inverter", sql.Bit, body.has_inverter ? 1 : 0)
      .input("is_upgrade", sql.Bit, body.is_upgrade ? 1 : 0)
      .input("battery_kwh", sql.Decimal(5, 1), body.battery_kwh || null)
      .input("battery_brand", sql.NVarChar(50), body.battery_brand || null)
      .input("solar_panels", sql.Int, body.solar_panels || null)
      .input("panel_watt", sql.Int, body.panel_watt || null)
      .input("inverter_kw", sql.Decimal(5, 1), body.inverter_kw || null)
      .input("inverter_brand", sql.NVarChar(50), body.inverter_brand || null)
      .input("price", sql.Decimal(12, 2), body.price || 0)
      .input("monthly_installment", sql.NVarChar(20), body.monthly_installment || null)
      .input("monthly_saving", sql.Decimal(10, 2), body.monthly_saving || null)
      .input("warranty_years", sql.Int, body.warranty_years || 10)
      .input("start_date", sql.Date, body.start_date ? new Date(body.start_date + "T12:00:00") : today)
      .input("expire_date", sql.Date, body.expire_date ? new Date(body.expire_date + "T12:00:00") : default99)
      .query(`
        INSERT INTO packages (name, kwp, phase, has_battery, has_panel, has_inverter, is_upgrade,
          battery_kwh, battery_brand, solar_panels, panel_watt, inverter_kw, inverter_brand,
          price, monthly_installment, monthly_saving, warranty_years, start_date, expire_date)
        OUTPUT INSERTED.*
        VALUES (@name, @kwp, @phase, @has_battery, @has_panel, @has_inverter, @is_upgrade,
          @battery_kwh, @battery_brand, @solar_panels, @panel_watt, @inverter_kw, @inverter_brand,
          @price, @monthly_installment, @monthly_saving, @warranty_years, @start_date, @expire_date)
      `);
    return NextResponse.json(result.recordset[0], { status: 201 });
  } catch (error) {
    console.error("POST /api/packages error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
