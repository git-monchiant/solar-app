import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

type Stage = "booking" | "order_before" | "order_after";

const fmt0 = (n: number) => new Intl.NumberFormat("en-US").format(n);

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get("booking_id");
  const leadIdParam = req.nextUrl.searchParams.get("lead_id");
  const stageParam = (req.nextUrl.searchParams.get("stage") as Stage | null) || "booking";

  if (!bookingId && !leadIdParam) {
    return NextResponse.json({ error: "Missing booking_id or lead_id" }, { status: 400 });
  }

  try {
    const db = await getDb();
    let leadId: number | null = leadIdParam ? parseInt(leadIdParam) : null;

    // booking_id is now the same as lead_id (booking lives on the lead row itself)
    if (!leadId && bookingId) leadId = parseInt(bookingId);

    const leadRes = await db.request().input("id", sql.Int, leadId!).query(`
      SELECT l.id, l.full_name, l.phone, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.interested_package_id, l.interested_package_ids,
             l.order_total, l.order_pct_before, l.install_extra_cost, l.install_extra_note, l.install_completed_at,
             l.pre_doc_no as booking_number,
             l.pre_total_price as booking_price,
             l.pre_booked_at as booking_created_at,
             l.pre_package_id as booked_package_id,
             pr.name as project_name
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE l.id = @id
    `);
    if (leadRes.recordset.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const l = leadRes.recordset[0];

    // Prefer the survey-selected package (single). Fall back to booked package or the
    // pre-survey interested list (only for the booking stage where multiple options may apply).
    let packages: { id: number; name: string; kwp: number; price: number }[] = [];
    const selectedId: number | null = l.interested_package_id || l.booked_package_id || null;
    if (selectedId) {
      const r = await db.request().input("id", sql.Int, selectedId).query(
        `SELECT id, name, kwp, price FROM packages WHERE id = @id`
      );
      packages = r.recordset;
    }
    if (packages.length === 0 && stageParam === "booking" && l.interested_package_ids) {
      const pkgIds = l.interested_package_ids.split(",").map(Number).filter(Boolean);
      if (pkgIds.length > 0) {
        const r = await db.request().query(
          `SELECT id, name, kwp, price FROM packages WHERE id IN (${pkgIds.join(",")}) ORDER BY kwp`
        );
        packages = r.recordset;
      }
    }

    const orderTotal = Number(l.order_total || 0);
    const pctBefore = l.order_pct_before ?? 100;
    const bookingPrice = Number(l.booking_price || 0);
    const beforeAmount = Math.round(orderTotal * pctBefore / 100);
    const afterAmount = orderTotal - beforeAmount;
    const extraCost = Number(l.install_extra_cost || 0);

    type LineItem = { label: string; amount: number };
    let totalPrice = 0;
    let description = "";
    let lineItems: LineItem[] = [];
    let remarks: string | null = null;
    let receiptNumber = l.booking_number || `SSE-${new Date().getFullYear().toString().slice(-2)}${String(leadId).padStart(4, "0")}`;
    let receiptDate: Date | string = new Date().toISOString();

    if (stageParam === "booking") {
      totalPrice = bookingPrice;
      description = `มัดจำการจอง · Solar Rooftop Booking Deposit`;
      lineItems = [{ label: description, amount: bookingPrice }];
      receiptNumber = l.booking_number || receiptNumber;
      receiptDate = l.booking_created_at || new Date().toISOString();
    } else if (stageParam === "order_before") {
      // Full pre-install portion (deposit is credited to the final payment, not this one)
      totalPrice = beforeAmount;
      description = `งวดที่ 1/2 · ชำระก่อนติดตั้ง ${pctBefore}%`;
      lineItems = [{ label: description, amount: beforeAmount }];
      receiptNumber = `${l.booking_number || `SSE-${String(leadId).padStart(4, "0")}`}-1`;
      receiptDate = new Date().toISOString();
    } else if (stageParam === "order_after") {
      // Final payment = remaining portion + extra cost − deposit credit
      const pctAfter = 100 - pctBefore;
      totalPrice = afterAmount + extraCost - bookingPrice;
      description = `งวดที่ 2/2 · ชำระหลังติดตั้ง ${pctAfter}%`;
      lineItems = [{ label: description, amount: afterAmount }];
      if (extraCost > 0) {
        lineItems.push({ label: "ค่าใช้จ่ายเพิ่มเติม", amount: extraCost });
        const extraNote = (l.install_extra_note || "").trim();
        if (extraNote) remarks = `ค่าใช้จ่ายเพิ่มเติม ${extraNote}`;
      }
      if (bookingPrice > 0) {
        lineItems.push({ label: `หักมัดจำการจอง (${fmt0(bookingPrice)} บาท)`, amount: -bookingPrice });
      }
      receiptNumber = `${l.booking_number || `SSE-${String(leadId).padStart(4, "0")}`}-2`;
      receiptDate = l.install_completed_at || new Date().toISOString();
    }

    return NextResponse.json({
      ...fixDates([l])[0],
      stage: stageParam,
      description,
      total_price: totalPrice,
      line_items: lineItems,
      remarks,
      booking_number: receiptNumber,
      created_at: receiptDate,
      packages,
    });
  } catch (error) {
    console.error("Receipt data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
