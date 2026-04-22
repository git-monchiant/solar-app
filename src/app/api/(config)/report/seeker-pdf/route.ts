import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getDb } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

type Row = {
  name: string;
  total: number;
  has_solar: number;
  no_solar: number;
  line_count: number;
  interested_new: number;
  interested_upgrade: number;
  undecided: number;
  not_home: number;
  pending: number;
  not_interested: number;
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

function renderReportHtml(rows: Row[], asOfDate: string): string {
  const totals = rows.reduce<Row>((acc, r) => ({
    name: "",
    total: acc.total + r.total,
    has_solar: acc.has_solar + r.has_solar,
    no_solar: acc.no_solar + r.no_solar,
    line_count: acc.line_count + r.line_count,
    interested_new: acc.interested_new + r.interested_new,
    interested_upgrade: acc.interested_upgrade + r.interested_upgrade,
    undecided: acc.undecided + r.undecided,
    not_home: acc.not_home + r.not_home,
    pending: acc.pending + r.pending,
    not_interested: acc.not_interested + r.not_interested,
  }), { name: "", total: 0, has_solar: 0, no_solar: 0, line_count: 0, interested_new: 0, interested_upgrade: 0, undecided: 0, not_home: 0, pending: 0, not_interested: 0 });

  const num = (n: number) => (n > 0 ? n.toLocaleString("en") : "-");
  const tr = (r: Row, idx: number | null) => `
    <tr>
      <td class="c idx">${idx === null ? "" : idx + 1}</td>
      <td class="l">${escapeHtml(r.name)}</td>
      <td class="c total">${num(r.total)}</td>
      <td class="c">${num(r.has_solar)}</td>
      <td class="c">${num(r.no_solar)}</td>
      <td class="c">${num(r.line_count)}</td>
      <td class="c">${num(r.interested_new)}</td>
      <td class="c">${num(r.interested_upgrade)}</td>
      <td class="c">${num(r.undecided)}</td>
      <td class="c">${num(r.not_home)}</td>
      <td class="c">${num(r.pending)}</td>
      <td class="c">${num(r.not_interested)}</td>
    </tr>`;

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>Seeker Report</title>
<style>
  @page { size: A4 landscape; margin: 10mm; }
  body { font-family: "Sarabun", "Noto Sans Thai", sans-serif; font-size: 11px; color: #111; margin: 0; }
  h1 { font-size: 14px; margin: 0 0 2px; }
  .sub { font-size: 10px; color: #555; margin-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #bbb; padding: 4px 6px; vertical-align: middle; }
  th { background: #f3f4f6; font-weight: 700; font-size: 10px; text-align: center; }
  .group-hdr th { background: #fde68a; }
  .c { text-align: center; }
  .l { text-align: left; }
  .idx { width: 36px; color: #6b7280; }
  .total { font-weight: 700; background: #fff7ed; }
  tfoot td { font-weight: 700; background: #fef3c7; }
</style></head><body>
  <h1>ข้อมูลการนำเสนอ Solar ของ Lead Seeker (Sen X PM)</h1>
  <div class="sub">ข้อมูล ณ วันที่ ${escapeHtml(asOfDate)}</div>
  <table>
    <thead>
      <tr class="group-hdr">
        <th rowspan="2">ลำดับ</th>
        <th rowspan="2">โครงการ</th>
        <th rowspan="2">จำนวนบ้านทั้งหมด<br/>ในโครงการ</th>
        <th colspan="2">การติดตั้ง Solar (กี่หลัง)</th>
        <th rowspan="2">Add LINE<br/>OA</th>
        <th colspan="6">ข้อมูลการนำเสนอ Solar ของ Lead Seeker (Sen X PM)</th>
      </tr>
      <tr class="group-hdr">
        <th>มี Solar</th>
        <th>ไม่มี Solar</th>
        <th>สนใจ - ติดตั้ง</th>
        <th>สนใจ - Upgrade</th>
        <th>ยังไม่ตัดสินใจ</th>
        <th>ไม่อยู่บ้าน</th>
        <th>ยังไม่ระบุ</th>
        <th>ไม่สนใจ</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map((r, i) => tr(r, i)).join("")}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="2" class="c">รวม</td>
        <td class="c">${num(totals.total)}</td>
        <td class="c">${num(totals.has_solar)}</td>
        <td class="c">${num(totals.no_solar)}</td>
        <td class="c">${num(totals.line_count)}</td>
        <td class="c">${num(totals.interested_new)}</td>
        <td class="c">${num(totals.interested_upgrade)}</td>
        <td class="c">${num(totals.undecided)}</td>
        <td class="c">${num(totals.not_home)}</td>
        <td class="c">${num(totals.pending)}</td>
        <td class="c">${num(totals.not_interested)}</td>
      </tr>
    </tfoot>
  </table>
</body></html>`;
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  try {
    const db = await getDb();
    const result = await db.request().query(`
      SELECT p.name,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id) AS total,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.line_id IS NOT NULL AND pr.line_id <> N'') AS line_count,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND ((pr.installed_kw IS NOT NULL AND pr.installed_kw > 0)
             OR (pr.installed_product IS NOT NULL AND LTRIM(RTRIM(pr.installed_product)) <> N'')
             OR (pr.existing_solar IS NOT NULL
                 AND LTRIM(RTRIM(pr.existing_solar)) <> N''
                 AND pr.existing_solar NOT LIKE N'ไม่มี%'
                 AND pr.existing_solar NOT LIKE N'ยังไม่มี%'
                 AND pr.existing_solar NOT IN (N'no', N'none', N'-')))
        ) AS has_solar,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.interest = N'interested' AND pr.interest_type = N'new') AS interested_new,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.interest = N'interested' AND pr.interest_type = N'upgrade') AS interested_upgrade,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.interest = N'undecided') AS undecided,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.interest = N'not_home') AS not_home,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.interest IS NULL AND pr.visited_at IS NULL
           AND (pr.note IS NULL OR pr.note = N'')) AS pending,
        (SELECT COUNT(*) FROM prospects pr WHERE pr.project_id = p.id
           AND pr.interest = N'not_interested') AS not_interested
      FROM projects p
      WHERE p.is_active = 1
        AND EXISTS (SELECT 1 FROM prospects pr WHERE pr.project_id = p.id)
      ORDER BY p.name
    `);
    const rows: Row[] = result.recordset.map((r: Row & { total: number }) => ({
      ...r,
      no_solar: (r.total || 0) - (r.has_solar || 0),
    }));

    const now = new Date();
    const asOfDate = `${now.getDate()}/${now.getMonth() + 1}/${now.getFullYear() + 543}`;
    const html = renderReportHtml(rows, asOfDate);

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
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    await browser.close();

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=seeker_report_${now.toISOString().slice(0, 10)}.pdf`,
      },
    });
  } catch (error) {
    console.error("seeker-pdf error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
