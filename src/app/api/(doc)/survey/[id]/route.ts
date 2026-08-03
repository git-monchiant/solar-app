import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { getUserIdFromReq } from "@/lib/auth";
import { dispositionForLead } from "@/lib/doc-filename";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const leadId = parseInt(id);
  if (!leadId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    const port = process.env.PORT || 3700;
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
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
    // Wait for EVERY image to actually be painted — not just "load fired".
    //
    // The signatures load from /api/leads/[id]/signature/... with a ?v cache
    // buster, so the request can still be in flight when networkidle0 fires, and
    // the old `img.onload || onerror` wait resolved the moment either fired —
    // including onerror on a cold endpoint — capturing a blank signature. Poll
    // until each image reports naturalWidth > 0 (i.e. it has real pixels), then
    // decode() it so it's committed to a paint, before taking the PDF.
    await page.evaluate(async () => {
      const ready = (img: HTMLImageElement) => img.complete && img.naturalWidth > 0;
      const deadline = Date.now() + 12000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const imgs = Array.from(document.images);
        const pending = imgs.filter(img => !ready(img));
        if (pending.length === 0 || Date.now() > deadline) break;
        await new Promise<void>(res => setTimeout(res, 150));
      }
      await Promise.all(
        Array.from(document.images).map(img =>
          (img.decode ? img.decode() : Promise.resolve()).catch(() => undefined)
        )
      );
    });

    const bytes = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "0", right: "0", bottom: "0", left: "0" },
    });
    const download = req.nextUrl.searchParams.get("download") === "1";
    const disposition = await dispositionForLead(leadId, {
      base: `survey_${id}`,
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
    console.error("Survey PDF error:", error);
    return NextResponse.json({ error: "Failed to generate survey PDF" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
