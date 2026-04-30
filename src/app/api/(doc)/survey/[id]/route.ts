import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getUserIdFromReq } from "@/lib/auth";

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

    // Prefer ?user_id from caller, fallback to whoever's authenticated.
    const userId = req.nextUrl.searchParams.get("user_id") || (getUserIdFromReq(req)?.toString() ?? null);
    const viewQs = userId ? `?user_id=${userId}` : "";
    await page.goto(`http://localhost:${port}/survey/${id}${viewQs}`, { waitUntil: "networkidle0", timeout: 15000 });
    await page.waitForSelector("#survey", { timeout: 10000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    // Wait for all images (incl. signature) to finish loading; networkidle0 alone
    // can fire before <img> sources are decoded.
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = img.onerror = () => res(); })));
    });

    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    await browser.close();

    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename=survey_${id}.pdf`,
      },
    });
  } catch (error) {
    console.error("Survey PDF error:", error);
    return NextResponse.json({ error: "Failed to generate survey PDF" }, { status: 500 });
  }
}
