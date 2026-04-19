import puppeteer from "puppeteer";
import fs from "fs";

const ws = fs.readFileSync("/tmp/huawei_browser.txt", "utf8").trim();
const captcha = process.argv[2];
if (!captcha) { console.error("usage: node huawei_step2.mjs <captcha>"); process.exit(1); }

const browser = await puppeteer.connect({ browserWSEndpoint: ws });
const pages = await browser.pages();
const page = pages.find(p => p.url().includes("escpportal")) || pages[0];

console.log("URL:", page.url());

// Enable PDF download interception (open in new tab)
const client = await page.createCDPSession();
await client.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: "/tmp" }).catch(() => {});

// Type captcha
await page.evaluate(() => { document.getElementById("yzm").value = ""; });
await page.type("#yzm", captcha);
console.log("Typed captcha:", captcha);

// Listen for new pages/tabs (download may open in new tab)
browser.on("targetcreated", async (target) => {
  if (target.type() === "page") {
    const u = target.url();
    console.log("new tab:", u);
  }
});

// Capture all network responses that are PDFs
page.on("response", async (resp) => {
  const ct = resp.headers()["content-type"] || "";
  if (ct.includes("pdf") || resp.url().includes("downloadPdf")) {
    console.log("PDF response:", resp.url(), "→", resp.status());
    try {
      const buf = await resp.buffer();
      fs.writeFileSync("/tmp/huawei_warranty.pdf", buf);
      console.log("Saved to /tmp/huawei_warranty.pdf:", buf.length, "bytes");
    } catch (e) { console.error("buf err:", e.message); }
  }
});

// Click Search — the handler is on the inner <font id="btnSearch_EN" onclick="enClick()">
await page.evaluate(() => {
  if (typeof enClick === "function") { enClick(); return; }
  document.getElementById("btnSearch_EN")?.click();
});
console.log("Clicked Search (called enClick)");

// Wait a bit for results
await new Promise(r => setTimeout(r, 5000));
await page.screenshot({ path: "/tmp/huawei_after_search.png", fullPage: true });
console.log("After-search screenshot: /tmp/huawei_after_search.png");

// Try click Download link (red text)
const clicked = await page.evaluate(() => {
  const nodes = [...document.querySelectorAll("a, span, td")];
  for (const n of nodes) {
    const t = (n.textContent || "").trim();
    if (t === "Download" || t === "下载" || t === "ダウンロード") {
      n.click();
      return t;
    }
  }
  return null;
});
console.log("Clicked download target:", clicked);

// Wait for PDF to download
await new Promise(r => setTimeout(r, 8000));
await page.screenshot({ path: "/tmp/huawei_after_download.png", fullPage: true });
console.log("Done. Check /tmp/huawei_warranty.pdf");

browser.disconnect();
