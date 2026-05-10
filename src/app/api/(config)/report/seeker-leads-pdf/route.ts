import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Single-row KPI summary — same 5 metrics as the dashboard top KPI cards,
// each cell shows the cumulative all-time count + today's increment.
type Kpi = {
  total: number;       total_today: number;       // ทั้งหมด — prospect universe
  visited: number;     visited_today: number;     // เยี่ยมแล้ว
  interested: number;  interested_today: number;  // สนใจ
  line_oa: number;     line_oa_today: number;     // Add LINE OA
  leads: number;       leads_today: number;       // สร้างลีด
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderReportHtml(k: Kpi, asOfDate: string): string {
  const fmt = (n: number) => n.toLocaleString("en");
  const cell = (sum: number, today: number) =>
    `<div class="big">${fmt(sum)}</div><div class="sub">วันนี้ +${fmt(today)}</div>`;

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Seeker KPI Report</title>
<style>
  @page { size: A4 landscape; margin: 12mm; }
  body { font-family: "Sarabun", "Noto Sans Thai", sans-serif; font-size: 12px; color: #111; margin: 0; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub-title { font-size: 11px; color: #555; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 12px 10px; vertical-align: middle; text-align: center; }
  th { background: #fde68a; font-weight: 700; font-size: 12px; }
  td .big { font-size: 22px; font-weight: 800; line-height: 1.1; color: #111; }
  td .sub { font-size: 11px; color: #6b7280; margin-top: 4px; }
</style></head><body>
  <h1>จำนวน Lead ของ Lead Seeker (กระบวนการหา Lead)</h1>
  <div class="sub-title">สะสมทั้งหมด · พร้อมยอดวันนี้ ณ ${escapeHtml(asOfDate)}</div>
  <table>
    <thead>
      <tr>
        <th>ทั้งหมด</th>
        <th>เยี่ยมแล้ว</th>
        <th>สนใจ</th>
        <th>Add LINE OA</th>
        <th>สร้างลีด</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>${cell(k.total, k.total_today)}</td>
        <td>${cell(k.visited, k.visited_today)}</td>
        <td>${cell(k.interested, k.interested_today)}</td>
        <td>${cell(k.line_oa, k.line_oa_today)}</td>
        <td>${cell(k.leads, k.leads_today)}</td>
      </tr>
    </tbody>
  </table>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();

    // One round-trip query: cumulative + today's increment for each of the 5
    // KPIs shown on the seeker dashboard. "Today" uses each metric's natural
    // timestamp column:
    //   total       → prospects.created_at
    //   visited     → prospects.visited_at
    //   interested  → visited_at (proxy — interest is set during the visit)
    //   line_oa     → prospects.updated_at (no dedicated linked_at column)
    //   leads       → leads.created_at (seeker-flow only, excludes legacy
    //                 sheet imports that linked prospects.lead_id but didn't
    //                 originate from the seeker UI)
    const result = await db.request().query(`
      DECLARE @today date = CAST(GETDATE() AS date);

      SELECT
        (SELECT COUNT(*) FROM prospects) AS total,
        (SELECT COUNT(*) FROM prospects WHERE CAST(created_at AS date) = @today) AS total_today,

        (SELECT COUNT(*) FROM prospects WHERE visited_at IS NOT NULL) AS visited,
        (SELECT COUNT(*) FROM prospects WHERE CAST(visited_at AS date) = @today) AS visited_today,

        (SELECT COUNT(*) FROM prospects WHERE interest = N'interested') AS interested,
        (SELECT COUNT(*) FROM prospects WHERE interest = N'interested' AND CAST(visited_at AS date) = @today) AS interested_today,

        (SELECT COUNT(*) FROM prospects WHERE line_id IS NOT NULL AND line_id <> N'') AS line_oa,
        (SELECT COUNT(*) FROM prospects WHERE line_id IS NOT NULL AND line_id <> N'' AND CAST(updated_at AS date) = @today) AS line_oa_today,

        -- Mirror the dashboard KPI definition exactly: every prospect with a
        -- lead_id counts, no extra filter. (KPI source: seeker-summary/route.ts
        -- "leads_created" = SUM(CASE WHEN p.lead_id IS NOT NULL ...).)
        (SELECT COUNT(*) FROM prospects WHERE lead_id IS NOT NULL) AS leads,
        (SELECT COUNT(*) FROM prospects p
           INNER JOIN leads l ON l.id = p.lead_id
           WHERE p.lead_id IS NOT NULL
             AND CAST(l.created_at AS date) = @today
        ) AS leads_today
    `);

    const r = result.recordset[0] as Kpi;
    const kpi: Kpi = {
      total: r.total ?? 0, total_today: r.total_today ?? 0,
      visited: r.visited ?? 0, visited_today: r.visited_today ?? 0,
      interested: r.interested ?? 0, interested_today: r.interested_today ?? 0,
      line_oa: r.line_oa ?? 0, line_oa_today: r.line_oa_today ?? 0,
      leads: r.leads ?? 0, leads_today: r.leads_today ?? 0,
    };

    const now = new Date();
    const asOfDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543}`;
    const html = renderReportHtml(kpi, asOfDate);

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 10000 });
    const pdfBuffer = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });
    await browser.close();

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=seeker_leads_${now.toISOString().slice(0, 10)}.pdf`,
      },
    });
  } catch (error) {
    console.error("seeker-leads-pdf error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
