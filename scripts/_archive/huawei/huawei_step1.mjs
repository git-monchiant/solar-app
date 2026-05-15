import puppeteer from "puppeteer";
import fs from "fs";

const browser = await puppeteer.launch({ headless: false, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

console.log("Opening portal...");
await page.goto("https://app.huawei.com/escpportal/pub/wechat.html?Language=EN&appName=escp&buType=2", { waitUntil: "networkidle0" });

// Fill SN
await page.type("#borderNum", "TA2460330303");

// Find the visible captcha img across language variants
const imgId = await page.evaluate(() => {
  const candidates = ["show_img", "show_img_en", "show_img_jp", "show_img_de", "show_img_it", "show_img_fr"];
  for (const id of candidates) {
    const el = document.getElementById(id);
    if (el && el.offsetParent !== null) return id;
  }
  return null;
});
console.log("Visible captcha img id:", imgId);

if (imgId) {
  const el = await page.$(`#${imgId}`);
  await el.screenshot({ path: "/tmp/huawei_cap.png" });
  console.log("Captcha saved: /tmp/huawei_cap.png");
} else {
  await page.screenshot({ path: "/tmp/huawei_full.png", fullPage: true });
  console.log("Fallback full page: /tmp/huawei_full.png");
}

const ws = browser.wsEndpoint();
fs.writeFileSync("/tmp/huawei_browser.txt", ws);
console.log("WS:", ws);
browser.disconnect();
