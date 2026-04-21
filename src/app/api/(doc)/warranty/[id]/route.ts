import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { getDb, sql } from "@/lib/db";

// Fetch any attached PDFs from the lead and append them to the generated warranty
// cover so the final PDF is a single document: warranty template → inverter cert
// → panel cert → panel serials → other docs.
async function fetchAttachmentUrls(leadId: number): Promise<string[]> {
  try {
    const db = await getDb();
    const r = await db.request().input("id", sql.Int, leadId).query(
      `SELECT warranty_inverter_cert_url, warranty_panel_cert_url, warranty_panel_serials_url, warranty_other_docs_url
       FROM leads WHERE id = @id`
    );
    if (r.recordset.length === 0) return [];
    const row = r.recordset[0];
    const urls: string[] = [];
    if (row.warranty_inverter_cert_url) urls.push(row.warranty_inverter_cert_url);
    if (row.warranty_panel_cert_url) urls.push(row.warranty_panel_cert_url);
    if (row.warranty_panel_serials_url) urls.push(row.warranty_panel_serials_url);
    if (row.warranty_other_docs_url) {
      for (const u of String(row.warranty_other_docs_url).split(",").map(s => s.trim()).filter(Boolean)) urls.push(u);
    }
    return urls;
  } catch { return []; }
}

async function fetchPdfBytes(url: string, port: number | string): Promise<Uint8Array | null> {
  try {
    const full = url.startsWith("/") ? `http://localhost:${port}${url}` : url;
    const res = await fetch(full);
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.toLowerCase().includes("pdf")) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch { return null; }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  try {
    const port = process.env.PORT || 3700;
    const browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter", "--no-zygote", "--single-process"],
      env: { ...process.env, TZ: "Asia/Bangkok" },
    });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");

    await page.goto(`http://localhost:${port}/warranty/${id}`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#warranty", { timeout: 10000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

    const coverBytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await browser.close();

    // Merge cover + attached PDFs (skip anything non-PDF silently)
    const merged = await PDFDocument.create();
    const cover = await PDFDocument.load(coverBytes);
    (await merged.copyPages(cover, cover.getPageIndices())).forEach(p => merged.addPage(p));

    const attachUrls = await fetchAttachmentUrls(leadId);
    for (const url of attachUrls) {
      const bytes = await fetchPdfBytes(url, port);
      if (!bytes) continue;
      try {
        const doc = await PDFDocument.load(bytes);
        (await merged.copyPages(doc, doc.getPageIndices())).forEach(p => merged.addPage(p));
      } catch (e) { console.error("skip attachment (load failed):", url, e); }
    }

    const finalBytes = await merged.save();
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(finalBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename=warranty_${id}.pdf`,
      },
    });
  } catch (error) {
    console.error("Warranty PDF error:", error);
    return NextResponse.json({ error: "Failed to generate warranty PDF" }, { status: 500 });
  }
}
