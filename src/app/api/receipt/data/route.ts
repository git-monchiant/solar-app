import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get("booking_id");
  if (!bookingId) return NextResponse.json({ error: "Missing booking_id" }, { status: 400 });

  try {
    const db = await getDb();
    const result = await db.request().input("id", sql.Int, parseInt(bookingId)).query(`
      SELECT b.id, b.booking_number, b.total_price, b.package_id, b.created_at,
             l.full_name, l.phone, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.interested_package_ids,
             p.name as package_name, p.kwp, p.price as package_price,
             pr.name as project_name
      FROM bookings b
      JOIN leads l ON b.lead_id = l.id
      JOIN packages p ON b.package_id = p.id
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE b.id = @id
    `);

    if (result.recordset.length === 0) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    const b = result.recordset[0];

    const pkgIds = b.interested_package_ids ? b.interested_package_ids.split(",").map(Number).filter(Boolean) : [];
    let packages: { id: number; name: string; kwp: number; price: number }[] = [];
    if (pkgIds.length > 0) {
      const pkgResult = await db.request().query(
        `SELECT id, name, kwp, price FROM packages WHERE id IN (${pkgIds.join(",")}) ORDER BY kwp`
      );
      packages = pkgResult.recordset;
    }
    if (packages.length === 0) {
      packages = [{ id: b.package_id, name: b.package_name, kwp: b.kwp, price: b.package_price }];
    }

    return NextResponse.json({ ...fixDates([b])[0], packages });
  } catch (error) {
    console.error("Receipt data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
