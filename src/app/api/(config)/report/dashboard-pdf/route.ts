import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer";
import { PDFDocument } from "pdf-lib";
import { requireAuth } from "@/lib/auth";

export const runtime = "nodejs";
export const maxDuration = 60;

// Renders /dashboard via headless Chromium, screenshots the dashboard root as
// a single tall PNG, then embeds the PNG in an A4 landscape PDF (auto-paginates
// if the dashboard is taller than one page). Auth cookies are forwarded so the
// page renders as the logged-in user.
export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    // Puppeteer is in-process — talk to the server over plain http/localhost
    // instead of the (possibly-HTTPS, possibly-ngrok) external origin so we
    // don't hit SSL errors or extra latency.
    const internalPort = process.env.PORT || "3000";
    // ?path= picks which dashboard to capture. Whitelist so we never let a
    // request point puppeteer at an arbitrary URL.
    const searchParams = new URL(req.url).searchParams;
    const rawPath = searchParams.get("path") || "/dashboard";
    const ALLOWED = new Set(["/dashboard", "/dashboard-dev"]);
    const path = ALLOWED.has(rawPath) ? rawPath : "/dashboard";
    // Forward the global filter the user has applied on screen so the captured
    // PDF mirrors their view. Embed the filter in the URL query (the dashboard
    // reads ?from/?to/?mode as its initial state) so the very first render
    // already fires the filtered fetch — localStorage-only would let the
    // unfiltered fetch escape during the brief window before the effect runs.
    const filterFrom = searchParams.get("from") || "";
    const filterTo   = searchParams.get("to")   || "";
    const filterModeRaw = searchParams.get("mode") || "created";
    const filterMode = filterModeRaw === "activity" ? "activity" : "created";
    const dashUrl = new URL(`http://localhost:${internalPort}${path}`);
    if (filterFrom) dashUrl.searchParams.set("from", filterFrom);
    if (filterTo)   dashUrl.searchParams.set("to",   filterTo);
    dashUrl.searchParams.set("mode", filterMode);
    const dashboardUrl = dashUrl.toString();
    const userId = String(gate.userId);

    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const page = await browser.newPage();
    // 1440 width matches a typical desktop view so the 9-station grid + Source
    // chart render at their intended size before being captured.
    await page.setViewport({ width: 1440, height: 1024, deviceScaleFactor: 2 });

    // Auth in this app = x-user-id header sourced from localStorage in
    // src/lib/api.ts. Seed localStorage before the first navigation so the
    // page's apiFetch calls authenticate as the logged-in user. Also seed the
    // dashboard's date-range filter keys so the report renders the same slice.
    await page.evaluateOnNewDocument((seed: { uid: string; from: string; to: string; mode: string }) => {
      try {
        localStorage.setItem("userId", seed.uid);
        if (seed.from) localStorage.setItem("dashboard.dateFrom", seed.from);
        if (seed.to)   localStorage.setItem("dashboard.dateTo",   seed.to);
        localStorage.setItem("dashboard.filterMode", seed.mode);
      } catch {}
    }, { uid: userId, from: filterFrom, to: filterTo, mode: filterMode });

    // domcontentloaded is more reliable than networkidle0 here — dev HMR
    // keeps reconnecting websockets and networkidle0 never settles.
    await page.goto(dashboardUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    // waitForFunction polls in the page until the dashboard content mounts
    // (or we hit timeout). Dev-mode hydration can take 10s+ on a cold compile.
    await page.waitForFunction(
      () => !!document.querySelector(".dashboard-pdf-content"),
      { timeout: 45000, polling: 500 },
    );
    // Wait for the LAST section to mount too (3 reason cards at the bottom)
    // so the screenshot doesn't crop the dashboard mid-load.
    await page.waitForFunction(
      () => document.querySelectorAll(".dashboard-pdf-content > div").length >= 5,
      { timeout: 30000, polling: 500 },
    ).catch(() => {});
    // After mount, give charts a moment to settle so the screenshot isn't
    // captured mid-animation.
    await new Promise((r) => setTimeout(r, 3000));

    // Hide elements that shouldn't be in the report + unlock the viewport.
    //   - .dashboard-pdf-skip wraps the sticky Header (would overlap top of
    //     .dashboard-pdf-content because position:sticky stays in view)
    //   - .no-print is the PDF button itself
    //   - .z-50 catches the bucket popup overlay if it's open
    //   - html/body overflow:hidden + height:100vh in globals.css clips the
    //     page to viewport, which would crop a fullPage screenshot. Override
    //     so the page reflows to its natural document height.
    await page.addStyleTag({
      content: `
        html, body { height: auto !important; overflow: visible !important; }
        .dashboard-pdf-skip, .no-print, [class*=z-50] { display: none !important; }
      `,
    });

    // Capture just .dashboard-pdf-content as a tight crop (no nav/header
    // whitespace above). After the overflow override the element's
    // bounding box is the full natural height.
    const root = await page.$(".dashboard-pdf-content");
    if (!root) throw new Error("dashboard content not found");
    const screenshotBuffer = (await root.screenshot({ type: "png" })) as Buffer;

    // Single-page PDF sized to the screenshot's native dimensions — treat the
    // dashboard as one tall image, no A4/pagination crop.
    const pdfDoc = await PDFDocument.create();
    const img = await pdfDoc.embedPng(screenshotBuffer);
    const p = pdfDoc.addPage([img.width, img.height]);
    p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
    const pdfBytes = await pdfDoc.save();

    return new NextResponse(Buffer.from(pdfBytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename=dashboard_${new Date().toISOString().slice(0, 10)}.pdf`,
      },
    });
  } catch (error) {
    console.error("dashboard-pdf error:", error);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
