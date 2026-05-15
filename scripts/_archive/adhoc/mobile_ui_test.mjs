// Mobile UI smoke test — navigate through key pages with iPhone viewport,
// capture screenshots, and report console errors / failed requests.
import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

const BASE = "http://localhost:3700";
const OUT = path.join(process.cwd(), "/tmp/ui-test");
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();

// iPhone 14-ish
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await page.setUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15");

const errors = [];
const failedRequests = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
    const text = msg.text();
    // Ignore noisy HMR / devtools messages
    if (!text.includes("HMR") && !text.includes("DevTools")) {
      errors.push({ page: page.url(), text });
    }
  }
});
page.on("pageerror", (err) => errors.push({ page: page.url(), text: err.message }));
page.on("requestfailed", (req) => failedRequests.push({ url: req.url(), reason: req.failure()?.errorText }));

async function shot(name) {
  await new Promise(r => setTimeout(r, 800)); // wait for render
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`📸 ${name} → ${p}`);
}

async function visit(name, url, fullPage = false) {
  console.log(`\n🔗 ${url}`);
  await page.goto(`${BASE}${url}`, { waitUntil: "networkidle0", timeout: 15000 });
  await new Promise(r => setTimeout(r, 1000));
  if (fullPage) {
    await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });
  } else {
    await shot(name);
  }
}

try {
  await visit("01-home", "/");
  await visit("02-pipeline", "/pipeline");
  await visit("02b-pipeline-full", "/pipeline", true);
  await visit("03-today", "/today");
  await visit("04-packages", "/packages");
  await visit("05-profile", "/profile");

  // Click a lead card in pipeline
  await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 1000));
  const clicked = await page.evaluate(() => {
    const card = document.querySelector('[role="button"]');
    if (card) { card.click(); return true; }
    return false;
  });
  console.log(`Clicked first lead card: ${clicked}`);
  await new Promise(r => setTimeout(r, 1500));
  await shot("06-lead-detail");
  await page.screenshot({ path: path.join(OUT, "06b-lead-detail-full.png"), fullPage: true });

  // Test assign owner button on first lead card — click the dropdown open
  await page.goto(`${BASE}/pipeline`, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 1000));
  const ownerOpened = await page.evaluate(() => {
    const btn = document.querySelector('button[title*="Owner"], button[title*="Assign"]');
    if (btn) { btn.click(); return true; }
    return false;
  });
  console.log(`Opened owner dropdown: ${ownerOpened}`);
  await shot("07-owner-dropdown");

} catch (e) {
  console.error("TEST ERROR:", e.message);
}

console.log("\n=== SUMMARY ===");
console.log(`Errors: ${errors.length}`);
errors.forEach(e => console.log(`  [${e.page}] ${e.text.slice(0, 200)}`));
console.log(`Failed requests: ${failedRequests.length}`);
failedRequests.forEach(r => console.log(`  ${r.url} — ${r.reason}`));

await browser.close();
