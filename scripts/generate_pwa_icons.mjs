import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

// Version 4: logo-only — big SENA SOLAR logo centered on white, rounded square.
const logoPath = path.join(process.cwd(), "public", "logos", "logo-sena.png");
const logoBase64 = fs.readFileSync(logoPath).toString("base64");
const logoDataUri = `data:image/png;base64,${logoBase64}`;

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="110" fill="white"/>
  <!-- Logo centered, large — preserveAspectRatio keeps proportion -->
  <image href="${logoDataUri}" x="32" y="160" width="448" height="192" preserveAspectRatio="xMidYMid meet"/>
</svg>
`;

const html = `<!DOCTYPE html><html><head><style>body{margin:0;padding:0;background:transparent}</style></head><body>${SVG}</body></html>`;

const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });

for (const size of [192, 512]) {
  const page = await browser.newPage();
  await page.setViewport({ width: size, height: size, deviceScaleFactor: 1 });
  await page.setContent(html);
  const svg = await page.$("svg");
  await svg.evaluate((el, s) => { el.setAttribute("width", s); el.setAttribute("height", s); }, size);
  const buf = await svg.screenshot({ type: "png", omitBackground: true });
  const outPath = path.join(process.cwd(), "public", "icons", `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`✓ ${outPath} (${buf.length} bytes)`);
  await page.close();
}

await browser.close();
