import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

type Stage = "deposit" | "order_before" | "order_after";

const fmt0 = (n: number) => new Intl.NumberFormat("en-US").format(n);

export async function GET(req: NextRequest) {
  const leadIdParam = req.nextUrl.searchParams.get("lead_id");
  const stageParam = (req.nextUrl.searchParams.get("stage") as Stage | null) || "deposit";

  if (!leadIdParam) {
    return NextResponse.json({ error: "Missing lead_id" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const leadId = parseInt(leadIdParam);

    const leadRes = await db.request().input("id", sql.Int, leadId).query(`
      SELECT l.id, l.full_name, l.phone, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.interested_package_id, l.interested_package_ids,
             l.order_total, l.order_pct_before, l.install_extra_cost, l.install_extra_note, l.install_completed_at,
             l.pre_doc_no, l.pre_total_price, l.pre_booked_at, l.pre_package_id,
             pr.name as project_name
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE l.id = @id
    `);
    if (leadRes.recordset.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const l = leadRes.recordset[0];

    // Prefer the survey-selected package (single). Fall back to pre-survey package
    // or the interested list (only for the deposit stage where multiple options may apply).
    let packages: { id: number; name: string; kwp: number; price: number }[] = [];
    const selectedId: number | null = l.interested_package_id || l.pre_package_id || null;
    if (selectedId) {
      const r = await db.request().input("id", sql.Int, selectedId).query(
        `SELECT id, name, kwp, price FROM packages WHERE id = @id`
      );
      packages = r.recordset;
    }
    if (packages.length === 0 && stageParam === "deposit" && l.interested_package_ids) {
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
    const depositPrice = Number(l.pre_total_price || 0);
    const beforeAmount = Math.round(orderTotal * pctBefore / 100);
    const afterAmount = orderTotal - beforeAmount;
    const extraCost = Number(l.install_extra_cost || 0);
    // Distribute deposit credit: งวด 2 first, spillover to งวด 1.
    const creditAfter = Math.min(afterAmount, depositPrice);
    const creditBefore = Math.min(beforeAmount, depositPrice - creditAfter);

    type LineItem = { label: string; amount: number };
    let totalPrice = 0;
    let description = "";
    let lineItems: LineItem[] = [];
    let remarks: string | null = null;
    const fallbackDocNo = `SSE-${new Date().getFullYear().toString().slice(-2)}${String(leadId).padStart(4, "0")}`;
    let receiptNumber = l.pre_doc_no || fallbackDocNo;
    let receiptDate: Date | string = new Date().toISOString();

    if (stageParam === "deposit") {
      totalPrice = depositPrice;
      description = `ค่าสำรวจ · Solar Rooftop Survey Fee`;
      lineItems = [{ label: description, amount: depositPrice }];
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-0`;
      receiptDate = l.pre_booked_at || new Date().toISOString();
    } else if (stageParam === "order_before") {
      // Pre-install portion. Deposit normally credits to งวด 2, but if งวด 2
      // can't absorb it all, spillover lands here.
      totalPrice = beforeAmount - creditBefore;
      description = `งวดที่ 1/2 · ชำระก่อนติดตั้ง ${pctBefore}%`;
      lineItems = [{ label: description, amount: beforeAmount }];
      if (creditBefore > 0) {
        lineItems.push({ label: `หักค่าสำรวจ (ส่วนที่เหลือ)`, amount: -creditBefore });
      }
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-1`;
      receiptDate = new Date().toISOString();
    } else if (stageParam === "order_after") {
      // Final payment = remaining portion + extra cost − deposit credit (capped to งวด 2)
      const pctAfter = 100 - pctBefore;
      totalPrice = afterAmount + extraCost - creditAfter;
      description = `งวดที่ 2/2 · ชำระหลังติดตั้ง ${pctAfter}%`;
      lineItems = [{ label: description, amount: afterAmount }];
      if (extraCost > 0) {
        lineItems.push({ label: "ค่าใช้จ่ายเพิ่มเติม", amount: extraCost });
        const extraNote = (l.install_extra_note || "").trim();
        if (extraNote) remarks = `ค่าใช้จ่ายเพิ่มเติม ${extraNote}`;
      }
      if (creditAfter > 0) {
        lineItems.push({ label: `หักค่าสำรวจ (${fmt0(creditAfter)} บาท)`, amount: -creditAfter });
      }
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-2`;
      receiptDate = l.install_completed_at || new Date().toISOString();
    }

    return NextResponse.json({
      ...fixDates([l])[0],
      stage: stageParam,
      description,
      total_price: totalPrice,
      line_items: lineItems,
      remarks,
      receipt_no: receiptNumber,
      created_at: receiptDate,
      packages,
    });
  } catch (error) {
    console.error("Receipt data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
