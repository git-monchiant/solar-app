import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates } from "@/lib/db";
import { COMBINED_EXTRA_MARKER, parseCombinedPaymentAllocation } from "@/lib/combined-payment";

// om = ค่าบริการงาน O&M (แถว payments slip_field om_quote_<ใบเสนอราคา>) — 2 ต.ค. 69 ผู้ใช้สั่ง "ทำเหมือนฝั่งขาย"
type Stage = "deposit" | "order_before" | "order_after" | "installment" | "om";

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
    const stageUserCol: Record<Exclude<Stage, "installment" | "om">, "payment_confirmed_by" | "order_before_paid_by" | "order_after_paid_by"> = {
      deposit: "payment_confirmed_by",
      order_before: "order_before_paid_by",
      order_after: "order_after_paid_by",
    };
    let signer: { full_name: string; signature_url: string | null } | null = null;

    const leadRes = await db.request().input("id", sql.Int, leadId).query(`
      SELECT l.id, l.full_name, l.phone, l.email, l.installation_address, l.id_card_address, l.id_card_number,
             l.survey_date, l.survey_time_slot, l.interested_package_id, l.interested_package_ids,
             l.order_total, l.order_pct_before, l.order_installments,
             l.install_extra_cost, l.install_extra_note, l.install_completed_at,
             l.install_customer_signature_url, l.survey_customer_signature_url,
             l.pre_doc_no, l.pre_total_price, l.pre_booked_at, l.pre_package_id,
             l.payment_confirmed_by, l.order_before_paid_by, l.order_after_paid_by,
             -- Show project_alias when set (e.g. when the lead lives under the
             -- catch-all "โครงการอื่นทั่วไป" but has its own real name) — else
             -- fall back to the joined project's official name.
             COALESCE(NULLIF(l.project_alias, N''), pr.name) as project_name
      FROM leads l
      LEFT JOIN projects pr ON l.project_id = pr.id
      WHERE l.id = @id
    `);
    if (leadRes.recordset.length === 0) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    const l = leadRes.recordset[0];

    // For installment stage, signer comes from payments.confirmed_by; otherwise
    // from the matching lead column.
    let installmentRow: { id: number; slip_field: string; amount: number; confirmed_by: number | null; confirmed_at: string | null; description: string | null; payment_no: string | null; cc_surcharge_pct: number | null; cc_surcharge_amount: number | null } | null = null;
    if ((stageParam === "installment" || stageParam === "om") && paymentIdParam) {
      const r = await db.request()
        .input("id", sql.Int, parseInt(paymentIdParam))
        .input("lead_id", sql.Int, leadId)
        .query(`SELECT id, slip_field, amount, confirmed_by, confirmed_at, description, payment_no, cc_surcharge_pct, cc_surcharge_amount FROM payments WHERE id = @id AND lead_id = @lead_id`);
      if (r.recordset.length > 0) installmentRow = r.recordset[0];
    }
    // payments.confirmed_by is nvarchar (accountant name as string), unlike
    // the lead-level *_by columns which are user_ids. Detect by type and
    // look up by name vs id accordingly.
    const rawSigner: string | number | null = stageParam === "installment" || stageParam === "om"
      ? (installmentRow?.confirmed_by ?? (userIdParam ? parseInt(userIdParam) : null))
      : (l[stageUserCol[stageParam as Exclude<Stage, "installment" | "om">]] ?? (userIdParam ? parseInt(userIdParam) : null));
    if (rawSigner !== null && rawSigner !== undefined && rawSigner !== "") {
      const asNum = typeof rawSigner === "number" ? rawSigner : (/^\d+$/.test(String(rawSigner)) ? parseInt(String(rawSigner)) : null);
      if (asNum !== null) {
        const u = await db.request().input("id", sql.Int, asNum)
          .query(`SELECT full_name, signature_url FROM users WHERE id = @id`);
        if (u.recordset.length > 0) signer = u.recordset[0];
      } else {
        // String name — try to find a matching user row for the signature,
        // fall back to just showing the name with no signature.
        const name = String(rawSigner);
        const u = await db.request().input("name", sql.NVarChar(100), name)
          .query(`SELECT TOP 1 full_name, signature_url FROM users WHERE full_name = @name`);
        signer = u.recordset[0] ?? { full_name: name, signature_url: null };
      }
    }

    // Prefer the survey-selected package (single). Fall back to pre-survey package
    // or the interested list (only for the deposit stage where multiple options may apply).
    let packages: { id: number; name: string; kwp: number; price: number }[] = [];
    // งาน O&M ไม่ใช่การขายแพ็กเกจโซลาร์ — ไม่แสดงแพ็กเกจที่ lead เคยสนใจ (บ้านที่ใช้ lead ร่วมกับฝั่งขายจะติดมา)
    const selectedId: number | null = stageParam === "om" ? null : (l.interested_package_id || l.pre_package_id || null);
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
    const discountAmount = Math.min(orderTotal, Number(l.order_discount_amount || 0));
    // effOrderTotal = price after the special discount (VIP/promo). All
    // before/after-install splits are computed off this discounted total —
    // matches OrderStep's `effTotal` / `netTotal` and what the customer is
    // actually billed.
    const effOrderTotal = Math.max(0, orderTotal - discountAmount);
    const pctBefore = l.order_pct_before ?? 100;
    const depositPrice = Number(l.pre_total_price || 0);
    const beforeAmount = Math.round(effOrderTotal * pctBefore / 100);
    const afterAmount = effOrderTotal - beforeAmount;
    const extraCost = Number(l.install_extra_cost || 0);
    // Distribute deposit credit: งวด 2 first, spillover to งวด 1.
    const creditAfter = Math.min(afterAmount, depositPrice);
    const creditBefore = Math.min(beforeAmount, depositPrice - creditAfter);

    type LineItem = { label: string; amount: number };
    let totalPrice = 0;
    let description = "";
    let lineItems: LineItem[] = [];
    const remarks: string | null = null;
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
        SELECT slip_field, amount, confirmed_at, cc_surcharge_pct, cc_surcharge_amount FROM payments
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
        // Single-installment plan: drop the "งวดที่ N" prefix and the "(100%)"
        // suffix — both are noise when there's only one row.
        const onlyOne = planArr.length === 1;
        for (const p of instRes.recordset) {
          const m = /^order_installment_(\d+)$/.exec(p.slip_field);
          const idx = m ? parseInt(m[1]) : 0;
          const pct = idx === planArr.length - 1 ? lastPct : Number(planArr[idx]?.pct) || 0;
          const pctSuffix = !onlyOne && pct > 0 ? ` (${pct}%)` : "";
          const gross = effOrderTotal > 0 && pct > 0 ? Math.round((effOrderTotal * pct) / 100) : Number(p.amount || 0);
          const label = onlyOne ? "ค่าระบบ Solar Rooftop" : `งวดที่ ${idx + 1} · ค่าระบบ Solar Rooftop${pctSuffix}`;
          lineItems.push({ label, amount: gross });
          const ccFee = Number(p.cc_surcharge_amount || 0);
          if (ccFee > 0) {
            const ccPct = p.cc_surcharge_pct != null ? Number(p.cc_surcharge_pct) : null;
            const ccLabel = onlyOne
              ? `ค่าธรรมเนียมบัตรเครดิต${ccPct ? ` (${ccPct}%)` : ""}`
              : `งวดที่ ${idx + 1} · ค่าธรรมเนียมบัตรเครดิต${ccPct ? ` (${ccPct}%)` : ""}`;
            lineItems.push({ label: ccLabel, amount: ccFee });
          }
          if (p.confirmed_at && (!latest || new Date(p.confirmed_at) > new Date(latest))) latest = p.confirmed_at;
        }
        // Only show the deposit credit on this receipt if งวด-after couldn't
        // fully absorb it. creditBefore = spillover after งวด-after took its share.
        if (creditBefore > 0) {
          lineItems.push({ label: "หักค่าสำรวจ", amount: -creditBefore });
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
      const ccFee = Number(installmentRow.cc_surcharge_amount || 0);
      const ccPct = installmentRow.cc_surcharge_pct != null ? Number(installmentRow.cc_surcharge_pct) : null;
      totalPrice = amt + ccFee;
      // Pull the installment's pct from order_installments JSON (last row's pct
      // is the auto-computed remainder = 100 − sum of earlier rows).
      let pctSuffix = "";
      let onlyOneInstallment = false;
      let installmentAmount = amt;
      let combinedExtraAmount = 0;
      try {
        const planArr = (l as { order_installments?: string }).order_installments
          ? JSON.parse((l as { order_installments?: string }).order_installments as string)
          : [];
        if (Array.isArray(planArr) && planArr.length > 0) {
          onlyOneInstallment = planArr.length === 1;
          const earlierSum = planArr.slice(0, planArr.length - 1).reduce((s: number, r: { pct?: number }) => s + (Number(r?.pct) || 0), 0);
          const lastPct = Math.max(0, 100 - earlierSum);
          const pct = idx === planArr.length - 1 ? lastPct : Number(planArr[idx]?.pct) || 0;
          if (!onlyOneInstallment && pct > 0) pctSuffix = ` (${pct}%)`;
          if ((installmentRow.description || "").includes(COMBINED_EXTRA_MARKER) && pct > 0) {
            const allocation = parseCombinedPaymentAllocation(installmentRow.description);
            if (allocation) {
              installmentAmount = allocation.base;
              combinedExtraAmount = allocation.extra;
            } else {
              const netOrderDue = Math.max(0, effOrderTotal - depositPrice);
              installmentAmount = Math.min(amt, Math.max(0, Math.round(netOrderDue * pct / 100)));
              combinedExtraAmount = Math.max(0, amt - installmentAmount);
            }
          }
        }
      } catch { /* fall through */ }
      description = onlyOneInstallment
        ? "ค่าระบบ Solar Rooftop"
        : `งวดที่ ${idx + 1} · ค่าระบบ Solar Rooftop${pctSuffix}`;
      lineItems = [{ label: description, amount: installmentAmount }];
      if (combinedExtraAmount > 0) {
        const extraNote = String(l.install_extra_note || "").trim();
        lineItems.push({
          label: extraNote ? `ค่าใช้จ่ายเพิ่มเติม · ${extraNote}` : "ค่าใช้จ่ายเพิ่มเติม",
          amount: combinedExtraAmount,
        });
      }
      if (ccFee > 0) {
        lineItems.push({ label: `ค่าธรรมเนียมบัตรเครดิต${ccPct ? ` (${ccPct}%)` : ""}`, amount: ccFee });
      }
      receiptNumber = `${l.pre_doc_no || fallbackDocNo}-${idx + 1}`;
      receiptDate = installmentRow.confirmed_at || new Date().toISOString();
    } else if (stageParam === "om" && installmentRow) {
      // ค่าบริการ O&M — รายการจากใบเสนอราคา O&M ที่ผูกกับเงินก้อนนี้ (แพ็กเกจ + รายการเพิ่ม + ส่วนลด)
      //   1 ใบเสนอราคา = เงิน 1 ก้อนเต็มจำนวน ⇒ เลขที่ใบเสร็จ = เลขใบเสนอราคา-1 (แบบ <เลขเอกสาร>-<งวด> ของฝั่งขาย)
      const qid = parseInt(installmentRow.slip_field.replace(/^om_quote_/, ""));
      const qr = await db.request().input("q", sql.Int, qid).input("lead_id", sql.Int, leadId).query(`
        SELECT doc_no, om_package_id, package_name_snapshot, package_price_snapshot, discount_amount, discount_reason
          FROM quotations WHERE id = @q AND lead_id = @lead_id;
        -- ไม่เอาบรรทัดรายละเอียดใต้หัวข้อ (custom_detail · ไม่มียอด · แผน 20261002-05) — ใบเสร็จแสดงเฉพาะหัวข้อที่มีเงิน
        SELECT item_name_snapshot, quantity, unit, line_total FROM quotation_items
         WHERE quotation_id = @q AND ISNULL(source_type, '') <> 'custom_detail' ORDER BY sort_order, id;
        SELECT h.house_number, h.address, COALESCE(pj.name_th, h.project_name) project_name
          FROM quotations q JOIN om_bookings b ON b.id = q.om_booking_id JOIN om_houses h ON h.id = b.house_id
          LEFT JOIN om_projects pj ON pj.project_id = h.project_id
         WHERE q.id = @q AND q.lead_id = @lead_id;`);
      const sets = qr.recordsets as unknown as Array<Array<Record<string, unknown>>>;
      const q = sets[0]?.[0];
      // lead ของบ้าน O&M (om_only) ไม่มีโครงการฝั่งขาย/ที่อยู่ — เติมจากทะเบียนบ้าน O&M ที่ใบงานนี้ผูกอยู่
      const h = sets[2]?.[0];
      if (h) {
        if (!l.project_name && h.project_name) l.project_name = h.project_name;
        if (!l.installation_address) {
          const addr = [h.house_number ? `บ้านเลขที่ ${h.house_number}` : null, h.address].filter(Boolean).join(" ");
          if (addr) l.installation_address = addr;
        }
      }
      if (q?.om_package_id) lineItems.push({ label: String(q.package_name_snapshot || "Package O&M"), amount: Number(q.package_price_snapshot || 0) });
      for (const it of q ? sets[1] ?? [] : []) {
        const qty = Number(it.quantity || 0);
        const label = String(it.item_name_snapshot || "");
        lineItems.push({ label: qty !== 1 ? `${label} (${qty}${it.unit ? ` ${it.unit}` : ""})` : label, amount: Number(it.line_total || 0) });
      }
      const disc = Number(q?.discount_amount || 0);
      if (disc > 0) lineItems.push({ label: `ส่วนลด${q?.discount_reason ? ` (${q.discount_reason})` : ""}`, amount: -disc });
      totalPrice = Number(installmentRow.amount || 0);
      if (lineItems.length === 0) lineItems.push({ label: "ค่าบริการ O&M", amount: totalPrice });
      // บัตรเครดิต (แผน 20261002-11) — บรรทัดค่าธรรมเนียมแบบใบเสร็จงวดฝั่งขาย
      const omCcFee = Number(installmentRow.cc_surcharge_amount || 0);
      if (omCcFee > 0) {
        const omCcPct = installmentRow.cc_surcharge_pct != null ? Number(installmentRow.cc_surcharge_pct) : null;
        lineItems.push({ label: `ค่าธรรมเนียมบัตรเครดิต${omCcPct ? ` (${omCcPct}%)` : ""}`, amount: omCcFee });
        totalPrice += omCcFee;
      }
      description = lineItems[0].label;
      receiptNumber = `${q?.doc_no || installmentRow.slip_field}-1`;
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
