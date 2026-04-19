import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get("booking_id");
  const leadId = req.nextUrl.searchParams.get("lead_id");
  const stage = req.nextUrl.searchParams.get("stage") || (bookingId ? "booking" : null);

  if (!bookingId && !leadId) {
    return NextResponse.json({ error: "Missing booking_id or lead_id" }, { status: 400 });
  }

  const identifier = leadId ? `lead-${leadId}-${stage}` : `booking-${bookingId}`;

  try {
    const port = process.env.PORT || 3700;
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], env: { ...process.env, TZ: "Asia/Bangkok" } });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");

    const qs = new URLSearchParams();
    if (leadId) qs.set("lead_id", leadId);
    if (bookingId) qs.set("booking_id", bookingId);
    if (stage) qs.set("stage", stage);
    const url = `http://localhost:${port}/receipt/view?${qs.toString()}`;
    await page.goto(url, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#receipt table", { timeout: 10000 });

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
