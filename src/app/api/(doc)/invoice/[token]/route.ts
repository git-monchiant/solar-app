import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 });

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

    await page.goto(`http://localhost:${port}/invoice/${token}`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#receipt", { timeout: 10000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);

    const format = req.nextUrl.searchParams.get("format") || "image";

    if (format === "pdf") {
      const pdfBuffer = await page.pdf({
        format: "A5",
        printBackground: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      await browser.close();
      return new NextResponse(Buffer.from(pdfBuffer), {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename=invoice_${token}.pdf`,
        },
      });
    }

    // A5 at 2x: 560 x 794
    await page.setViewport({ width: 560, height: 794, deviceScaleFactor: 2 });
    const el = await page.$("#receipt");
    const imgBuffer = await el!.screenshot({ type: "png" });
    await browser.close();

    return new NextResponse(Buffer.from(imgBuffer), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": `inline; filename=invoice_${token}.png`,
      },
    });
  } catch (error) {
    console.error("Invoice PDF error:", error);
    return NextResponse.json({ error: "Failed to generate document" }, { status: 500 });
  }
}
