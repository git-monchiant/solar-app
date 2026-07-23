import { NextRequest, NextResponse } from "next/server";
import { getDb, sql, fixDates, toSqlDate } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthFirst = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Global filter — every "totals" aggregate composes against the same
    // eligible-lead subquery, so the SELECTs themselves stay simple and the
    // filter logic lives in ONE place. Two modes:
    //
    //   created   — lead.created_at falls inside [from, to]
    //   activity  — lead has ANY tracked event inside [from, to]
    //               (created / survey / install dates on the row itself,
    //                a payment confirmed in the window, or any activity row)
    //
    // Empty from/to → no date constraint (subquery becomes `SELECT id FROM leads`).
    const fromYmd = req.nextUrl.searchParams.get("from") || "";
    const toYmd   = req.nextUrl.searchParams.get("to")   || "";
    const modeIn  = req.nextUrl.searchParams.get("mode") || "created";
    const mode: "created" | "activity" = modeIn === "activity" ? "activity" : "created";
    const fromDate = toSqlDate(fromYmd);
    const toDate   = toSqlDate(toYmd);
    const hasRange = !!fromDate && !!toDate;

    const bindRange = (r: ReturnType<typeof db.request>) => {
      if (fromDate) r.input("from", sql.Date, fromDate);
      if (toDate)   r.input("to",   sql.Date, toDate);
      return r;
    };

    // Predicates for the "this period" block (new leads / closed jobs / value /
    // outstanding). With a filter they follow [from, to]; without one they keep
    // the original month-to-date meaning. `instPredL` is the aliased variant for
    // the outstanding query, which joins payments as `l`.
    const createdPred = hasRange
      ? "CAST(created_at AS DATE) BETWEEN @from AND @to"
      : "created_at >= @first_day";
    const instPred = hasRange
      ? "CAST(install_completed_at AS DATE) BETWEEN @from AND @to"
      : "install_completed_at >= @first_day";
    const instPredL = hasRange
      ? "CAST(l.install_completed_at AS DATE) BETWEEN @from AND @to"
      : "l.install_completed_at >= @first_day";
    // "รับเงินแล้ว" follows the payment's own confirmation date — cash is booked
    // to the period it arrived in. No filter → running all-time total.
    const receivedPred = hasRange
      ? "CAST(p.confirmed_at AS DATE) BETWEEN @from AND @to"
      : "1 = 1";
    // Work booked into the window by its INSTALL APPOINTMENT — regardless of
    // whether it has been paid for or even installed yet. Answers "how much work
    // is on the calendar for this period", which is a different question from
    // revenue (install_completed_at) and from cash (payments.confirmed_at).
    // Follows the SELECTED RANGE only — no month-to-date fallback. With no
    // filter it means every scheduled job, same convention as receivedPred.
    //
    // A date on the calendar isn't enough: the job must also have paid toward
    // the WORK (any confirmed slip that isn't the ฿1,000 survey fee). Otherwise
    // a job pencilled in before the customer put money down would inflate the
    // figure, and it would drop back out if the appointment slipped.
    const schedPredFor = (a: string) => (hasRange
      ? `CAST(${a}.install_date AS DATE) BETWEEN @from AND @to`
      : `${a}.install_date IS NOT NULL`)
      + ` AND EXISTS (SELECT 1 FROM payments fp
                       WHERE fp.lead_id = ${a}.id AND fp.confirmed_at IS NOT NULL
                         AND fp.slip_field <> 'pre_slip_url')`;
    const schedPred = schedPredFor("l");
    // Same cohort as an id list, for excluding it elsewhere. NOT IN is safe here
    // because leads.id is the PK and can never be NULL.
    const schedCohort = `SELECT sl.id FROM leads sl WHERE ${schedPredFor("sl")}`;
    // Forfeited survey fees are recognized on the day the lead was cancelled.
    // Every lost lead holding money has a status_change→lost activity (verified:
    // 0 without one), so no fallback is needed. MAX because a lead can be
    // cancelled, revived, then cancelled again.
    const lostPredL = hasRange
      ? `CAST((SELECT MAX(created_at) FROM lead_activities
                WHERE lead_id = l.id AND activity_type = 'status_change' AND new_status = 'lost')
              AS DATE) BETWEEN @from AND @to`
      : `(SELECT MAX(created_at) FROM lead_activities
           WHERE lead_id = l.id AND activity_type = 'status_change' AND new_status = 'lost') >= @first_day`;
    // Same rule for booking money: the date that matters is when the deposit was
    // confirmed, with pre_booked_at covering ฟรีค่าสำรวจ (no payments row).
    const bookedPredL = hasRange
      ? `CAST(COALESCE(
           (SELECT MIN(confirmed_at) FROM payments
             WHERE lead_id = l.id AND slip_field = 'pre_slip_url' AND confirmed_at IS NOT NULL),
           l.pre_booked_at
         ) AS DATE) BETWEEN @from AND @to`
      : "1 = 1";

    // Returns the inline "lead IDs eligible under the current filter" subquery.
    // Inlined (not a CTE/temp table) so each aggregate can drop it in `IN (...)`
    // without coordinating a shared scope. Without range it degenerates to
    // every lead — keeps the rest of the SQL identical regardless of filter.
    const eligibleSet = !hasRange
      ? "SELECT id FROM leads"
      : mode === "created"
      ? "SELECT id FROM leads WHERE CAST(created_at AS DATE) BETWEEN @from AND @to"
      : `SELECT id FROM leads l WHERE
            CAST(l.created_at AS DATE) BETWEEN @from AND @to
            OR CAST(l.survey_date AS DATE) BETWEEN @from AND @to
            OR CAST(l.install_date AS DATE) BETWEEN @from AND @to
            OR CAST(l.install_completed_at AS DATE) BETWEEN @from AND @to
            OR EXISTS (
              SELECT 1 FROM payments p WHERE p.lead_id = l.id
                AND p.confirmed_at IS NOT NULL
                AND CAST(p.confirmed_at AS DATE) BETWEEN @from AND @to
            )
            OR EXISTS (
              SELECT 1 FROM lead_activities a WHERE a.lead_id = l.id
                AND CAST(a.created_at AS DATE) BETWEEN @from AND @to
            )`;

    const [
      totals,
      thisMonth,
      lastMonth,
      statusBreakdown,
      recentLeads,
      topProjects,
      recentActivities,
      activityHeatmap,
    ] = await Promise.all([
      bindRange(db.request()).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE id IN (${eligibleSet})) as total_leads,
          (SELECT COUNT(*) FROM leads WHERE pre_doc_no IS NOT NULL AND id IN (${eligibleSet})) as total_deposits,
          -- Booking money, scoped by when the deposit was confirmed — same rule
          -- as total_received: a money figure follows the money's own date, not
          -- the lead's created_at. Free surveys have no payments row, so they
          -- fall back to pre_booked_at (matching /api/lifecycle's booking_paid_at).
          (SELECT ISNULL(SUM(l.pre_total_price), 0) FROM leads l
            WHERE l.pre_doc_no IS NOT NULL AND ${bookedPredL}) as total_deposit_value,
          (SELECT COUNT(*) FROM leads WHERE status = 'order' AND id IN (${eligibleSet})) as total_won,
          -- All cash received that accounting has confirmed (level-2 sign-off).
          -- Covers every slip_field — booking deposit, order installments, etc.
          --
          -- Scoped by WHEN THE MONEY LANDED (confirmed_at), not by the lead's
          -- created_at. Money confirmed in June is June's income no matter when
          -- the lead was born. The old eligibleSet scoping dropped every payment
          -- belonging to a lead created before the window: with a 1 May–22 Jul
          -- filter it hid ฿1,541,320 from 10 April-born leads, so the card read
          -- "รับเงินแล้ว 2.3M" against "รายได้ 3.5M" and looked like ฿1.2M was
          -- uncollected — those jobs were in fact paid in full.
          (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
            WHERE p.confirmed_at IS NOT NULL AND ${receivedPred}) as total_received,
          -- The slice of that cash we have NOT earned yet: money confirmed in the
          -- window against a job that is neither delivered nor cancelled. It is a
          -- liability, not revenue — the customer is owed an installation. Splits
          -- total_received into "earned" (closed_value) + "held" so the card adds
          -- up: 3,475,850 delivered + 14,000 forfeited + 395,200 held = 3,885,050.
          (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
             JOIN leads l ON l.id = p.lead_id
            WHERE p.confirmed_at IS NOT NULL AND ${receivedPred}
              AND l.install_completed_at IS NULL AND l.status <> 'lost') as unearned_received,
          -- Job count for that money — only jobs that have actually paid toward
          -- the WORK (slip_field <> pre_slip_url) and are still undelivered.
          -- Counting every lead holding any cash gave 27, but 18 of those had
          -- paid nothing but the ฿1,000 survey fee: a quote exists, no money is
          -- down, and pairing them with ฿395K read as if 27 jobs were funded.
          -- The survey-fee-only leads are reported separately below; their cash
          -- stays inside unearned_received because the card's split must add up.
          -- Deliberately NOT the contract value of those jobs either: the card
          -- splits cash received, and unbilled order value was never that cash.
          (SELECT COUNT(DISTINCT l.id) FROM payments p
             JOIN leads l ON l.id = p.lead_id
            WHERE p.confirmed_at IS NOT NULL AND ${receivedPred}
              AND p.slip_field <> 'pre_slip_url'
              AND l.install_completed_at IS NULL AND l.status <> 'lost') as unearned_count,
          -- Undelivered leads holding ONLY a survey deposit — the remainder of
          -- unearned_received, shown as a footnote so nothing is unaccounted for.
          (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
             JOIN leads l ON l.id = p.lead_id
            WHERE p.confirmed_at IS NOT NULL AND ${receivedPred}
              AND l.install_completed_at IS NULL AND l.status <> 'lost'
              AND NOT EXISTS (SELECT 1 FROM payments p2
                               WHERE p2.lead_id = l.id AND p2.confirmed_at IS NOT NULL
                                 AND p2.slip_field <> 'pre_slip_url')) as survey_only_value,
          (SELECT COUNT(DISTINCT l.id) FROM payments p
             JOIN leads l ON l.id = p.lead_id
            WHERE p.confirmed_at IS NOT NULL AND ${receivedPred}
              AND l.install_completed_at IS NULL AND l.status <> 'lost'
              AND NOT EXISTS (SELECT 1 FROM payments p2
                               WHERE p2.lead_id = l.id AND p2.confirmed_at IS NOT NULL
                                 AND p2.slip_field <> 'pre_slip_url')) as survey_only_count,
          -- HEADLINE: work booked onto the installation calendar in the selected
          -- range, at contract value, paid or not — plus every survey fee taken
          -- in that range, cancelled leads included. Two different questions
          -- deliberately added together: "how much work did we line up" and
          -- "how much survey money came in".
          (
            (SELECT ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0)
                              - ISNULL(l.order_discount_amount,0)), 0)
               FROM leads l WHERE ${schedPred})
            + (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
                WHERE p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
                  AND ${receivedPred} AND p.lead_id NOT IN (${schedCohort}))
          ) as scheduled_total,
          (SELECT ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0)
                            - ISNULL(l.order_discount_amount,0)), 0)
             FROM leads l WHERE ${schedPred}) as scheduled_value,
          (SELECT COUNT(*) FROM leads l WHERE ${schedPred}) as scheduled_count,
          -- The delivered slice of that same cohort: booked into the window and
          -- already handed over. Same predicate + install_completed_at, so it
          -- nests inside scheduled_value instead of being a separate population
          -- (jobs installed in the window but booked outside it are excluded on
          -- purpose — the window is about the appointment, not the sign-off).
          (SELECT ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0)
                            - ISNULL(l.order_discount_amount,0)), 0)
             FROM leads l WHERE ${schedPred} AND l.install_completed_at IS NOT NULL) as delivered_value,
          (SELECT COUNT(*) FROM leads l
            WHERE ${schedPred} AND l.install_completed_at IS NOT NULL) as delivered_count,
          -- Survey fees taken in the range, EXCLUDING the jobs already counted
          -- in scheduled_value: order_total contains that lead's ฿1,000 fee, so
          -- adding the full fee pot on top billed it twice (฿24,000 over the
          -- 1 Jan–22 Jul window). Cancelled leads still count — the whole point
          -- is that a forfeited fee is money we kept.
          (SELECT ISNULL(SUM(p.amount), 0) FROM payments p
            WHERE p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
              AND ${receivedPred} AND p.lead_id NOT IN (${schedCohort})) as survey_fee_value,
          (SELECT COUNT(*) FROM payments p
            WHERE p.slip_field = 'pre_slip_url' AND p.confirmed_at IS NOT NULL
              AND ${receivedPred} AND p.lead_id NOT IN (${schedCohort})) as survey_fee_count,
          -- Receivables are a CURRENT snapshot, deliberately NOT scoped by the
          -- date filter: money owed doesn't stop being owed because the lead was
          -- created outside the selected range. Scoping these by eligibleSet made
          -- a real ฿227K of pending cheques read as ฿0 whenever the filter was
          -- narrower than the lead's created_at.
          --
          -- ONE receivables figure. balance = owed − confirmed cash, which
          -- already contains money that's been submitted but not signed off
          -- (pending payments are not counted as paid) — so pending must NOT be added
          -- on top or it double-counts. Covers delivered jobs plus any lead
          -- sitting on a pending payment, whether or not it shipped yet.
          (SELECT ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0)
                            - ISNULL(l.order_discount_amount,0) - ISNULL(cp.paid,0)), 0)
             FROM leads l
             LEFT JOIN (
               SELECT lead_id, SUM(amount) AS paid FROM payments
               WHERE confirmed_at IS NOT NULL GROUP BY lead_id
             ) cp ON cp.lead_id = l.id
             LEFT JOIN (
               SELECT lead_id, SUM(amount) AS pend FROM payments
               WHERE submitted_at IS NOT NULL AND confirmed_at IS NULL GROUP BY lead_id
             ) pp ON pp.lead_id = l.id
             WHERE l.install_completed_at IS NOT NULL OR ISNULL(pp.pend,0) > 0) as receivable_total,
          (SELECT COUNT(*)
             FROM leads l
             LEFT JOIN (
               SELECT lead_id, SUM(amount) AS pend FROM payments
               WHERE submitted_at IS NOT NULL AND confirmed_at IS NULL GROUP BY lead_id
             ) pp ON pp.lead_id = l.id
             WHERE l.install_completed_at IS NOT NULL OR ISNULL(pp.pend,0) > 0) as receivable_count
      `),
      // Revenue is recognized the moment an install is completed (status moves to
      // warranty → gridtie → closed after that). Filtering on status='closed' would
      // under-count real business done in the month. Use install_completed_at as
      // the single source of truth for "installed this month".
      // Scoped to the global date filter when one is set, so this block moves
      // with the rest of the dashboard instead of always reading "this month".
      // No range → falls back to month-to-date (the original behaviour).
      bindRange(db.request().input("first_day", firstDay)).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE ${createdPred}) as new_leads,
          (SELECT COUNT(*) FROM leads WHERE ${instPred}) as closed_count,
          -- Net of order_discount_amount — the discounted total is what the
          -- customer is actually billed, so that is the revenue. Leaving the
          -- discount in made this figure disagree with closed_outstanding /
          -- receivable_total below, which have always netted it off.
          --
          -- Plus forfeited survey fees: a cancelled job delivers nothing, so its
          -- confirmed deposit is never refunded and is earned income the day the
          -- lead is written off. Recognized on the cancellation date, not the
          -- date the fee was collected — that is when it stopped being refundable.
          (
            (SELECT ISNULL(SUM(ISNULL(order_total,0) + ISNULL(install_extra_cost,0) - ISNULL(order_discount_amount,0)), 0) FROM leads WHERE ${instPred})
            + (SELECT ISNULL(SUM(pm.amount), 0) FROM payments pm
                 JOIN leads l ON l.id = pm.lead_id
                WHERE pm.confirmed_at IS NOT NULL AND l.status = 'lost' AND ${lostPredL})
          ) as closed_value,
          -- Broken out so the card can show what the headline is made of.
          (SELECT ISNULL(SUM(pm.amount), 0) FROM payments pm
             JOIN leads l ON l.id = pm.lead_id
            WHERE pm.confirmed_at IS NOT NULL AND l.status = 'lost' AND ${lostPredL}) as forfeited_value,
          (SELECT COUNT(DISTINCT l.id) FROM payments pm
             JOIN leads l ON l.id = pm.lead_id
            WHERE pm.confirmed_at IS NOT NULL AND l.status = 'lost' AND ${lostPredL}) as forfeited_count,
          -- order_discount_amount must come off the obligation before comparing
          -- to payments: the customer is billed the discounted total, so leaving
          -- it in reported every discounted lead as outstanding by exactly the
          -- discount (a fully-paid lead showed "จ่าย 100%" and a balance).
          (SELECT ISNULL(SUM(ISNULL(l.order_total,0) + ISNULL(l.install_extra_cost,0) - ISNULL(l.order_discount_amount,0) - ISNULL(cp.paid,0)), 0)
             FROM leads l
             LEFT JOIN (
               -- Sum every confirmed payment, not just order_installment_*. The
               -- ฿1,000 booking deposit lives under slip_field='pre_slip_url' and
               -- is part of the customer's total obligation (order_total
               -- includes it), so filtering it out made fully-paid leads look
               -- ฿1K outstanding on the dashboard.
               SELECT lead_id, SUM(amount) AS paid
               FROM payments
               WHERE confirmed_at IS NOT NULL
               GROUP BY lead_id
             ) cp ON cp.lead_id = l.id
             WHERE ${instPredL}) as closed_outstanding
      `),
      db.request().input("lm_start", lastMonthFirst).input("lm_end", lastMonthEnd).query(`
        SELECT
          (SELECT COUNT(*) FROM leads WHERE created_at >= @lm_start AND created_at <= @lm_end) as new_leads,
          (SELECT COUNT(*) FROM leads WHERE install_completed_at >= @lm_start AND install_completed_at <= @lm_end) as closed_count
      `),
      db.request().query(`SELECT status, COUNT(*) as count FROM leads GROUP BY status`),
      db.request().query(`
        SELECT TOP 8 l.id, l.full_name, l.status, l.created_at, p.name as project_name
        FROM leads l LEFT JOIN projects p ON l.project_id = p.id
        ORDER BY l.created_at DESC
      `),
      db.request().query(`
        SELECT TOP 5 p.name, COUNT(*) as lead_count, SUM(CASE WHEN l.status = 'order' THEN 1 ELSE 0 END) as won
        FROM leads l JOIN projects p ON l.project_id = p.id
        GROUP BY p.name ORDER BY lead_count DESC
      `),
      db.request().query(`
        SELECT TOP 5 la.title, la.activity_type, la.created_at, l.full_name, u.full_name as by_name
        FROM lead_activities la
        JOIN leads l ON la.lead_id = l.id
        LEFT JOIN users u ON la.created_by = u.id
        ORDER BY la.created_at DESC
      `),
      // Activity heatmap stays OUTSIDE the global filter — it's a "what's
      // happening recently" snapshot, scoped only to the 33-day rolling
      // window so the "30 วันล่าสุด" title is always honest. Filtering it by
      // cohort would hide normal day-to-day team work that the dashboard's
      // date selector doesn't intend to silence.
      db.request().query(`
        SELECT COALESCE(la.followup_date, CAST(la.created_at AS DATE)) as day, la.lead_id, l.full_name, la.activity_type,
               COALESCE(
                 (SELECT TOP 1
                    CASE WHEN activity_type = 'status_change' THEN new_status ELSE NULL END
                  FROM lead_activities
                  WHERE lead_id = la.lead_id
                    AND CAST(created_at AS DATE) = CAST(la.created_at AS DATE)
                  ORDER BY created_at DESC),
                 'pre_survey'
               ) as lead_status,
               (SELECT COUNT(*) FROM lead_activities
                WHERE lead_id = la.lead_id
                  AND activity_type IN ('call','visit','line','other','follow_up','loan_followup')
                  AND created_at <= DATEADD(day, 1, CAST(la.created_at AS DATE))) as total_activities,
               CASE WHEN EXISTS (
                 SELECT 1 FROM lead_activities
                 WHERE lead_id = la.lead_id AND activity_type = 'payment_confirmed'
                   AND CAST(created_at AS DATE) = COALESCE(la.followup_date, CAST(la.created_at AS DATE))
               ) THEN 1 ELSE 0 END as has_paid
        FROM lead_activities la
        JOIN leads l ON la.lead_id = l.id
        WHERE la.activity_type IN ('lead_created','call','visit','line','other','follow_up','loan_followup')
          AND (la.created_at >= DATEADD(day, -33, CAST(GETDATE() AS DATE))
            OR la.followup_date >= DATEADD(day, -33, CAST(GETDATE() AS DATE)))
        ORDER BY day, la.created_at ASC
      `),
    ]);

    const t = totals.recordset[0];
    const tm = thisMonth.recordset[0];
    const lm = lastMonth.recordset[0];

    return NextResponse.json({
      total_leads: t.total_leads,
      total_deposits: t.total_deposits,
      total_deposit_value: t.total_deposit_value,
      total_won: t.total_won,
      total_received: t.total_received,
      unearned_received: t.unearned_received,
      unearned_count: t.unearned_count,
      survey_only_value: t.survey_only_value,
      survey_only_count: t.survey_only_count,
      // Headline: scheduled-install value + survey fees taken, both over the
      // selected range (no month-to-date fallback).
      scheduled_total: t.scheduled_total,
      scheduled_value: t.scheduled_value,
      scheduled_count: t.scheduled_count,
      delivered_value: t.delivered_value,
      delivered_count: t.delivered_count,
      survey_fee_value: t.survey_fee_value,
      survey_fee_count: t.survey_fee_count,
      // Receivables snapshot — current, not scoped by the date filter.
      receivable_total: t.receivable_total,
      receivable_count: t.receivable_count,
      conversion_rate: t.total_leads > 0 ? Math.round((t.total_won / t.total_leads) * 100) : 0,
      this_month: tm,
      last_month: lm,
      status_breakdown: statusBreakdown.recordset,
      recent_leads: fixDates(recentLeads.recordset),
      top_projects: topProjects.recordset,
      recent_activities: fixDates(recentActivities.recordset),
      activity_heatmap: fixDates(activityHeatmap.recordset),
    });
  } catch (error) {
    console.error("GET /api/dashboard error:", error);
    return NextResponse.json({ error: "Failed to fetch dashboard" }, { status: 500 });
  }
}
