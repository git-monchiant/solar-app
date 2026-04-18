import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";

// Version 3: minimalist — no panel. Big warm sun above, SENA logo below, gradient sky.
// The sun + logo are the only two elements. Clean, iconic, brand-focused.
const logoPath = path.join(process.cwd(), "public", "logos", "logo-sena.png");
const logoBase64 = fs.readFileSync(logoPath).toString("base64");
const logoDataUri = `data:image/png;base64,${logoBase64}`;

const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fef9c3"/>
      <stop offset="50%" stop-color="#a7f3d0"/>
      <stop offset="100%" stop-color="#14b8a6"/>
    </linearGradient>
    <radialGradient id="sun" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="55%" stop-color="#facc15"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#fef9c3" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#fef9c3" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="roundFrame">
      <rect width="512" height="512" rx="110"/>
    </clipPath>
  </defs>

  <g clip-path="url(#roundFrame)">
    <!-- Sky gradient -->
    <rect width="512" height="512" fill="url(#sky)"/>

    <!-- Sun halo glow -->
    <circle cx="256" cy="195" r="240" fill="url(#halo)"/>

    <!-- Long slender rays radiating from sun -->
    <g stroke="#facc15" stroke-width="6" stroke-linecap="round" opacity="0.75">
      <line x1="256" y1="30" x2="256" y2="85"/>
      <line x1="115" y1="80" x2="150" y2="120"/>
      <line x1="397" y1="80" x2="362" y2="120"/>
      <line x1="50" y1="195" x2="108" y2="195"/>
      <line x1="462" y1="195" x2="404" y2="195"/>
      <line x1="115" y1="310" x2="150" y2="270"/>
      <line x1="397" y1="310" x2="362" y2="270"/>
    </g>

    <!-- Secondary thinner rays between primary rays -->
    <g stroke="#facc15" stroke-width="3" stroke-linecap="round" opacity="0.45">
      <line x1="175" y1="50" x2="190" y2="100"/>
      <line x1="337" y1="50" x2="322" y2="100"/>
      <line x1="75" y1="130" x2="120" y2="155"/>
      <line x1="437" y1="130" x2="392" y2="155"/>
      <line x1="75" y1="260" x2="120" y2="235"/>
      <line x1="437" y1="260" x2="392" y2="235"/>
    </g>

    <!-- Sun -->
    <circle cx="256" cy="195" r="95" fill="url(#sun)"/>
    <!-- Subtle inner ring to add depth -->
    <circle cx="256" cy="195" r="95" fill="none" stroke="#f59e0b" stroke-width="2" opacity="0.5"/>

    <!-- SENA SOLAR logo -->
    <image href="${logoDataUri}" x="56" y="360" width="400" height="120" preserveAspectRatio="xMidYMid meet"/>
  </g>
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
