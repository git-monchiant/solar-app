import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import fs from "fs";
import { getDb, sql } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { dispositionForLead } from "@/lib/doc-filename";
import { buildSurveyReportHtml, quotationPdfPath } from "@/lib/docs/survey-report";

export const runtime = "nodejs";
// Puppeteer + a ~1 MB merge; never serve this from cache.
export const dynamic = "force-dynamic";

// GET /api/survey-report/[id] → 15-page site-survey report as one PDF, with the
// customer's accepted quotation appended as ภาคผนวก ก.
//
// Unlike the sibling doc routes this does NOT screenshot a public page — the
// HTML is built server-side by @/lib/docs/survey-report and handed straight to
// setContent. That keeps the report off the public surface (it contains the
// full questionnaire) and removes the localhost round-trip those routes need.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  const { id } = await params;
  const leadId = parseInt(id || "");
  if (!leadId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const db = await getDb();
    const leadRes = await db.request().input("id", sql.Int, leadId).query(`
      SELECT l.*, p.name AS pname, p.district, p.province, u.full_name AS surveyor
      FROM leads l
      LEFT JOIN projects p ON l.project_id = p.id
      LEFT JOIN users u ON l.assigned_user_id = u.id
      WHERE l.id = @id`);
    const L = leadRes.recordset[0];
    if (!L) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const dataRes = await db.request().input("id", sql.Int, leadId)
      .query(`SELECT * FROM lead_data WHERE lead_id = @id`);
    const D = dataRes.recordset[0] || {};

    // interested_package_id wins over pre_package_id — the former is what sales
    // actually quoted, the latter is whatever was picked at booking time.
    const pkgId = L.interested_package_id || L.pre_package_id || null;
    const PKG = pkgId
      ? (await db.request().input("pid", sql.Int, pkgId)
          .query(`SELECT * FROM packages WHERE id = @pid`)).recordset[0] || null
      : null;

    const html = buildSurveyReportHtml(L, D, PKG);

    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
      env: { ...process.env, TZ: "Asia/Bangkok" },
    });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");
    // domcontentloaded, not networkidle0: every asset is already a data URI, so
    // there is no network to go idle and networkidle0 would just burn 500ms.
    await page.setContent(html, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const reportPdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await browser.close();
    browser = null;

    // Append the real quotation PDF so the appendix page is followed by the
    // actual document instead of a promise of one.
    let bytes: Uint8Array = reportPdf;
    const quotPath = quotationPdfPath(L);
    if (quotPath) {
      try {
        const merged = await PDFDocument.load(reportPdf);
        const quot = await PDFDocument.load(fs.readFileSync(quotPath));
        const copied = await merged.copyPages(quot, quot.getPageIndices());
        copied.forEach(p => merged.addPage(p));
        bytes = await merged.save();
      } catch (e) {
        // A corrupt/encrypted quotation must not cost the user the whole
        // report — ship the 15 pages and log the reason.
        console.error(`survey-report ${leadId}: quotation merge failed`, e);
      }
    }

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": await dispositionForLead(leadId, { base: `รายงานสำรวจ-${leadId}`, ext: "pdf", disposition: "inline" }),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error(`GET /api/survey-report/${leadId} error:`, error);
    return NextResponse.json({ error: "Failed to generate survey report" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
}
