import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getUserIdFromReq } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const leadId = req.nextUrl.searchParams.get("lead_id");
  const stage = req.nextUrl.searchParams.get("stage") || "deposit";
  // Prefer ?user_id from caller; fallback to whoever's authenticated. The view
  // page is public, so this is the only place we can read the auth cookie.
  const userId = req.nextUrl.searchParams.get("user_id") || (getUserIdFromReq(req)?.toString() ?? null);
  // Forward an optional title override to the view page so the rendered PDF
  // can show document kinds like "Temporary Receipt" or "Booking Confirmation".
  const title = req.nextUrl.searchParams.get("title");
  // Per-installment receipts identify the source row by payment_id.
  const paymentId = req.nextUrl.searchParams.get("payment_id");

  if (!leadId) {
    return NextResponse.json({ error: "Missing lead_id" }, { status: 400 });
  }

  const identifier = `lead-${leadId}-${stage}`;

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

    const qs = new URLSearchParams();
    qs.set("lead_id", leadId);
    qs.set("stage", stage);
    if (userId) qs.set("user_id", userId);
    if (title) qs.set("title", title);
    if (paymentId) qs.set("payment_id", paymentId);
    const url = `http://localhost:${port}/receipt/view?${qs.toString()}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#receipt table", { timeout: 10000 });
    // Wait for webfonts (DB Heavent) to finish loading so PDF doesn't render
    // with the fallback system font.
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

    const format = req.nextUrl.searchParams.get("format") || "image";

    if (format === "pdf") {
      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      await browser.close();
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=receipt_${identifier}.pdf`,
        },
      });
    }

    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 2 });
    const el = await page.$("#receipt");
    const imgBuffer = await el!.screenshot({ type: "png" });
    await browser.close();

    return new NextResponse(Buffer.from(imgBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename=receipt_${identifier}.png`,
      },
    });
  } catch (error) {
    console.error("Receipt PDF error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
