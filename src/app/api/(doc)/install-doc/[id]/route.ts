import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getUserIdFromReq } from "@/lib/auth";
import { dispositionForLead } from "@/lib/doc-filename";

// Puppeteer-rendered post-install inspection PDF. Same recipe as the survey/
// warranty endpoints — render the public HTML page, screenshot to A4 PDF.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
      env: { ...process.env, TZ: "Asia/Bangkok" },
    });
    const page = await browser.newPage();
    await page.emulateTimezone("Asia/Bangkok");

    const userId = req.nextUrl.searchParams.get("user_id") || (getUserIdFromReq(req)?.toString() ?? null);
    const viewQs = userId ? `?user_id=${userId}` : "";

    // Try the request's own origin first (works behind ngrok / prod), then
    // fall back through the usual dev ports — historically this route
    // hardcoded 3700, but the dev server actually runs on 3010, which caused
    // ECONNREFUSED 500s. Same fallback shape as the OCR/verify-slip routes.
    const reqOrigin = req.nextUrl.origin;
    const candidates = [
      reqOrigin,
      process.env.PORT ? `http://localhost:${process.env.PORT}` : null,
      "http://localhost:3010",
      "http://localhost:3700",
      "http://localhost:3000",
    ].filter((v): v is string => !!v);

    let lastErr: unknown = null;
    let loaded = false;
    for (const base of candidates) {
      try {
        await page.goto(`${base}/install-doc/${id}${viewQs}`, { waitUntil: "networkidle0", timeout: 15000 });
        loaded = true;
        break;
      } catch (e) { lastErr = e; }
    }
    if (!loaded) throw lastErr || new Error("Could not reach install-doc page");

    await page.waitForSelector("#install-doc", { timeout: 10000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    await page.evaluate(async () => {
      const imgs = Array.from(document.images);
      await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(res => { img.onload = img.onerror = () => res(); })));
    });

    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const download = req.nextUrl.searchParams.get("download") === "1";
    const disposition = await dispositionForLead(leadId, {
      base: `install-doc_${id}`,
      ext: "pdf",
      disposition: download ? "attachment" : "inline",
    });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
      },
    });
  } catch (error) {
    console.error("Install-doc PDF error:", error);
    return NextResponse.json({ error: "Failed to generate install-doc PDF" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
