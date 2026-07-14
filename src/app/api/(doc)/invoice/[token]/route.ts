import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getDb, sql } from "@/lib/db";
import { buildContentDisposition } from "@/lib/doc-filename";

// Token → customer name. Invoice URLs are tokenised (no lead_id in the URL),
// so we resolve via leads.pre_pay_token same as the data endpoint.
async function nameForToken(token: string): Promise<string | null> {
  try {
    const db = await getDb();
    const r = await db.request().input("token", sql.NVarChar(64), token)
      .query(`SELECT full_name FROM leads WHERE pre_pay_token = @token`);
    const v = r.recordset[0]?.full_name;
    return typeof v === "string" ? v : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      // `--single-process` / `--no-zygote` make Chromium's print target close
      // intermittently on Windows. Keep the portable sandbox/resource flags
      // and let Chromium manage its normal child processes.
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
      env: { ...process.env, TZ: "Asia/Bangkok" },
    });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");
    await page.setViewport({ width: 560, height: 794, deviceScaleFactor: 2 });

    // Fetch the server-rendered invoice HTML first and inject it into the page.
    // This avoids navigating Chromium through Next dev's HMR lifecycle (which
    // can delay DOM readiness indefinitely under load). The <base> keeps CSS,
    // fonts, and the QR image resolving against the application origin.
    const invoiceUrl = `${req.nextUrl.origin}/invoice/${token}`;
    const invoiceResponse = await fetch(invoiceUrl, { cache: "no-store" });
    if (!invoiceResponse.ok) throw new Error(`Invoice page HTTP ${invoiceResponse.status}`);
    const rawInvoiceHtml = await invoiceResponse.text();
    const stylesheetHrefs = Array.from(rawInvoiceHtml.matchAll(
      /<link\b[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi,
    )).map((match) => match[1]);
    const inlineCss = (await Promise.all(stylesheetHrefs.map(async (href) => {
      const cssResponse = await fetch(new URL(href, req.nextUrl.origin), { cache: "no-store" });
      return cssResponse.ok ? cssResponse.text() : "";
    }))).join("\n");
    const invoiceHtml = rawInvoiceHtml
      // The receipt is already fully server-rendered. Dropping Next's client
      // scripts prevents HMR/hydration work from delaying or replacing the DOM
      // while Chromium prints it.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi, "")
      .replace(
        "<head>",
        `<head><base href="${req.nextUrl.origin}/"><style>${inlineCss}</style>`,
      );
    await page.setContent(invoiceHtml, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector("#receipt", { timeout: 10000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    await page.evaluate(() => Promise.all(Array.from(document.images).map((img) => {
      if (img.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        img.addEventListener("error", () => resolve(), { once: true });
      });
    })));

    const format = req.nextUrl.searchParams.get("format") || "image";

    const customerName = await nameForToken(token);

    if (format === "pdf") {
      const pdfBuffer = await page.pdf({
        format: "A5",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": buildContentDisposition({ base: `invoice_${token}`, ext: "pdf", customerName }),
        },
      });
    }

    const el = await page.$("#receipt");
    const imgBuffer = await el!.screenshot({ type: "png" });

    return new NextResponse(Buffer.from(imgBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": buildContentDisposition({ base: `invoice_${token}`, ext: "png", customerName }),
      },
    });
  } catch (error) {
    console.error("Invoice PDF error:", error);
    return NextResponse.json({ error: "Failed to generate document" }, { status: 500 });
  } finally {
    await browser?.close().catch(() => {});
  }
}
