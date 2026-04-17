import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  try {
    const port = process.env.PORT || 3700;
    const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"], env: { ...process.env, TZ: "Asia/Bangkok" } });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");

    await page.goto(`http://localhost:${port}/warranty/${id}`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#warranty", { timeout: 10000 });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await browser.close();

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(pdfBuffer), {
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
