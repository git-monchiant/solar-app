import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";

type Stage = "deposit" | "order_before" | "order_after" | "installment";

const fmt0 = (n: number) => new Intl.NumberFormat("en-US").format(n);

export async function GET(req: NextRequest) {
  const leadIdParam = req.nextUrl.searchParams.get("lead_id");
  const stageParam = (req.nextUrl.searchParams.get("stage") as Stage | null) || "deposit";
  const userIdParam = req.nextUrl.searchParams.get("user_id");
  // For per-installment receipts (slip_field = order_installment_<i>) we
  // can't derive amount/signer from a fixed lead column. The caller passes
  // the confirmed payments row id and we read straight from that row.
  const paymentIdParam = req.nextUrl.searchParams.get("payment_id");

  if (!leadIdParam) {
    return NextResponse.json({ error: "Missing lead_id" }, { status: 400 });
  }

  try {
    const db = await getDb();
    const leadId = parseInt(leadIdParam);

    // Signer = user who confirmed the matching payment stage. Fallback to current viewer.
    const stageUserCol: Record<Exclude<Stage, "installment">, "payment_confirmed_by" | "order_before_paid_by" | "order_after_paid_by"> = {
      deposit: "payment_confirmed_by",
      order_before: "order_before_paid_by",
      order_after: "order_after_paid_by",
    };
    let signer: { full_name: string; signature_url: string | null } | null = null;

    const leadRes = await db.request().input("id", sql.Int, leadId).query(`
      SELECT l.id, l.full_name, l.phone, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.interested_package_id, l.interested_package_ids,
             l.order_total, l.order_pct_before, l.order_installments,
             l.install_extra_cost, l.install_extra_note, l.install_completed_at,
             l.install_customer_signature_url, l.survey_customer_signature_url,
             l.pre_doc_no, l.pre_total_price, l.pre_booked_at, l.pre_package_id,
             l.payment_confirmed_by, l.order_before_paid_by, l.order_after_paid_by,
             pr.name as project_name
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE l.id = @id
    `);
    if (leadRes.recordset.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const l = leadRes.recordset[0];

    // For installment stage, signer comes from payments.confirmed_by; otherwise
    // from the matching lead column.
    let installmentRow: { id: number; slip_field: string; amount: number; confirmed_by: number | null; confirmed_at: string | null; description: string | null; payment_no: string | null } | null = null;
    if (stageParam === "installment" && paymentIdParam) {
      const r = await db.request()
        .input("id", sql.Int, parseInt(paymentIdParam))
        .input("lead_id", sql.Int, leadId)
        .query(`SELECT id, slip_field, amount, confirmed_by, confirmed_at, description, payment_no FROM payments WHERE id = @id AND lead_id = @lead_id`);
      if (r.recordset.length > 0) installmentRow = r.recordset[0];
    }
    const signerId = stageParam === "installment"
      ? (installmentRow?.confirmed_by || (userIdParam ? parseInt(userIdParam) : null))
      : (l[stageUserCol[stageParam as Exclude<Stage, "installment">]] || (userIdParam ? parseInt(userIdParam) : null));
    if (signerId) {
      const u = await db.request().input("id", sql.Int, signerId)
        .query(`SELECT full_name, signature_url FROM users WHERE id = @id`);
      if (u.recordset.length > 0) signer = u.recordset[0];
    }

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
      // Combined receipt for the order/approval step — enumerate every
      // confirmed installment payment for this lead so the line items match
      // what was actually charged. Falls back to the legacy 1/2-split logic
      // when no per-installment payments exist (legacy leads).
      const instRes = await db.request().input("id", sql.Int, leadId).query(`
        SELECT slip_field, amount, confirmed_at FROM payments
        WHERE lead_id = @id AND confirmed_at IS NOT NULL
          AND slip_field LIKE 'order_installment_%'
        ORDER BY slip_field
      `);
      const planArr: Array<{ pct?: number }> = (() => {
        try {
          const raw = (l as { order_installments?: string }).order_installments;
          const p = raw ? JSON.parse(raw) : [];
          return Array.isArray(p) ? p : [];
        } catch { return []; }
      })();
      if (instRes.recordset.length > 0) {
        let latest: string | Date = new Date().toISOString();
        const earlierSum = planArr.slice(0, -1).reduce((s, r) => s + (Number(r?.pct) || 0), 0);
        const lastPct = Math.max(0, 100 - earlierSum);
        // Show gross (pct × order_total) per row + a single deposit-credit line.
        // payments.amount is already net of the credit, but a separate line is
        // clearer on the receipt.
        for (const p of instRes.recordset) {
          const m = /^order_installment_(\d+)$/.exec(p.slip_field);
          const idx = m ? parseInt(m[1]) : 0;
          const pct = idx === planArr.length - 1 ? lastPct : Number(planArr[idx]?.pct) || 0;
          const pctSuffix = pct > 0 ? ` (${pct}%)` : "";
          const gross = orderTotal > 0 && pct > 0 ? Math.round((orderTotal * pct) / 100) : Number(p.amount || 0);
          lineItems.push({ label: `งวดที่ ${idx + 1} · ค่าระบบ Solar Rooftop${pctSuffix}`, amount: gross });
          if (p.confirmed_at && (!latest || new Date(p.confirmed_at) > new Date(latest))) latest = p.confirmed_at;
        }
        if (depositPrice > 0) {
          lineItems.push({ label: "หักค่าสำรวจ", amount: -depositPrice });
        }
        totalPrice = lineItems.reduce((s, li) => s + li.amount, 0);
        description = lineItems[0]?.label || "ค่าระบบ Solar Rooftop";
        receiptDate = latest;
      } else {
        // Legacy fallback (pre-installment leads).
        totalPrice = beforeAmount - creditBefore;
        description = `งวดที่ 1/2 · ชำระก่อนติดตั้ง ${pctBefore}%`;
        lineItems = [{ label: description, amount: beforeAmount }];
        if (creditBefore > 0) lineItems.push({ label: `หักค่าสำรวจ (ส่วนที่เหลือ)`, amount: -creditBefore });
        receiptDate = new Date().toISOString();
      }
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-1`;
    } else if (stageParam === "installment" && installmentRow) {
      // Per-installment receipt — drives entirely off the payments row.
      const m = /^order_installment_(\d+)$/.exec(installmentRow.slip_field);
      const idx = m ? parseInt(m[1]) : 0;
      const amt = Number(installmentRow.amount || 0);
      totalPrice = amt;
      // Pull the installment's pct from order_installments JSON (last row's pct
      // is the auto-computed remainder = 100 − sum of earlier rows).
      let pctSuffix = "";
      try {
        const planArr = (l as { order_installments?: string }).order_installments
          ? JSON.parse((l as { order_installments?: string }).order_installments as string)
          : [];
        if (Array.isArray(planArr) && planArr.length > 0) {
          const earlierSum = planArr.slice(0, planArr.length - 1).reduce((s: number, r: { pct?: number }) => s + (Number(r?.pct) || 0), 0);
          const lastPct = Math.max(0, 100 - earlierSum);
          const pct = idx === planArr.length - 1 ? lastPct : Number(planArr[idx]?.pct) || 0;
          if (pct > 0) pctSuffix = ` (${pct}%)`;
        }
      } catch { /* fall through */ }
      description = `งวดที่ ${idx + 1} · ค่าระบบ Solar Rooftop${pctSuffix}`;
      lineItems = [{ label: description, amount: amt }];
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-${idx + 1}`;
      receiptDate = installmentRow.confirmed_at || new Date().toISOString();
    } else if (stageParam === "order_after") {
      // Install-step receipt. With the per-installment system this slot now
      // covers (a) any leftover legacy "after-install" portion AND (b) the
      // extra cost line(s) added during install. Build the breakdown from
      // what's actually owed instead of the legacy "งวด 2/2" wording.
      const extraNote = (l.install_extra_note || "").trim();
      const remaining = Math.max(0, afterAmount - creditAfter);
      if (remaining > 0) {
        lineItems.push({ label: "ยอดคงค้าง", amount: afterAmount });
        if (creditAfter > 0) lineItems.push({ label: "หักค่าสำรวจ", amount: -creditAfter });
      }
      if (extraCost > 0) {
        lineItems.push({
          label: extraNote ? `ค่าใช้จ่ายเพิ่มเติม · ${extraNote}` : "ค่าใช้จ่ายเพิ่มเติม",
          amount: extraCost,
        });
      }
      // Fallback for legacy leads with no remaining + no extra: show a single
      // line so the receipt isn't blank.
      if (lineItems.length === 0) {
        lineItems.push({ label: "งวดที่ 2/2 · ชำระหลังติดตั้ง", amount: afterAmount });
      }
      totalPrice = lineItems.reduce((s, li) => s + li.amount, 0);
      description = lineItems[0].label;
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-2`;
      receiptDate = l.install_completed_at || new Date().toISOString();
    }

    // Customer signature on the receipt:
    //   • order_before / installment (Approve step) → survey signature
    //   • order_after (Install step)                → install handover signature
    const customerSignatureUrl =
      stageParam === "order_after" ? (l.install_customer_signature_url || null)
      : (stageParam === "order_before" || stageParam === "installment")
        ? (l.survey_customer_signature_url || null)
        : null;

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
      signer,
      customer_signature_url: customerSignatureUrl,
    });
  } catch (error) {
    console.error("Receipt data error:", error);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
