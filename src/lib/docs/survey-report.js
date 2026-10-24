import fs from "fs";
import path from "path";
import { LEGACY_PEAK_USAGE, PEAK_USAGE } from "@/lib/customer-questionnaire";
import { computeLoad, DEFAULT_ELECTRICITY_RATE, hasEvCharger, loadBillCheck } from "@/lib/load-assumption";
import { GSB_SOLAR_LOAN_DEFAULTS, rateForYear, readInterestSchedule } from "@/lib/loan-defaults";

// 15-page "รายงานสำรวจหน้างานติดตั้งโซลาร์เซลล์" — ported verbatim from the
// generator that was tuned against leads 667 / 691 / 727 / 728.
// Fewer pages when the quotation names a payment method (plan 20261012-06): the
// payment section keeps only that method's options (loan 14, cash/card 13) — count with
// countSurveyReportPages(), never assume 15.
//
// Plain JS on purpose: tsconfig has checkJs off, so the ~500 lines of template
// building came across unchanged instead of being sprinkled with `any`. Types
// for the two exports live in survey-report.d.ts.
//
// Hybrid fill by design — every field prints the real value when the lead has
// one and a bracketed blank when it doesn't, so the same template serves a lead
// with nothing but a booking and one with a full questionnaire. Do not
// "helpfully" hide empty rows: the blanks are where the surveyor writes by hand.
//
// Assets (DB Heavent ×4 + the SENA wordmark) are read off disk once and
// base64-inlined. Puppeteer prints this with no network access, so nothing may
// be referenced by URL.

let ASSETS = null;
function assets() {
  if (ASSETS) return ASSETS;
  const b64 = f => fs.readFileSync(path.join(process.cwd(), "public", f)).toString("base64");
  ASSETS = {
    li: b64("fonts/db_heavent_li_v3.2-webfont.woff"),
    rg: b64("fonts/db_heavent_v3.2-webfont.woff"),
    md: b64("fonts/db_heavent_med_v3.2-webfont.woff"),
    bd: b64("fonts/db_heavent_bd_v3.2-webfont.woff"),
    logo: b64("logos/logo-sena.png"),
  };
  return ASSETS;
}

const NAVY = "#243b5c", NAVY_DK = "#1e3050", ORANGE = "#e8912a", INK = "#1f2a3a", GRAY = "#6b7280";

const RESIDENCE = { detached:"บ้านเดี่ยว", semi_detached:"บ้านแฝด", townhome:"ทาวน์โฮม", townhouse:"ทาวน์เฮาส์", home_office:"โฮมออฟฟิศ", shophouse:"อาคารพาณิชย์" };
const ROOF = { old_tile:"กระเบื้องลอนคู่", cpac_tile:"กระเบื้องคอนกรีต/ซีแพค", metal_sheet:"เมทัลชีท", flat_tile:"กระเบื้องแผ่นเรียบ", concrete:"ดาดฟ้าคอนกรีต", tile:"กระเบื้อง" };
const PHASE = { "1_phase":"1 เฟส", "3_phase":"3 เฟส", unknown:"ไม่ทราบ" };
const METER = { "15_45":"15(45) A", "30_100":"30(100) A", unknown:"ไม่ทราบ" };
const BATTERY = { no:"ไม่ต้องการ", yes:"ต้องการ", maybe:"ยังไม่แน่ใจ", upgrade:"Upgrade เพิ่มแบต", customize:"กำหนดเอง (Customize)" };
const roofLabel = v => { if(!v) return ""; const b=v.split(":")[0]; return ROOF[b]||v; };
const thDate = v => v ? new Date(v).toLocaleDateString("th-TH",{day:"numeric",month:"long",year:"numeric"}) : "";
const baht = n => n==null?"":Number(n).toLocaleString("th-TH");
const num = (n,d=0) => Number(n).toLocaleString("th-TH",{minimumFractionDigits:d,maximumFractionDigits:d});
// ── GSB Solar Soft Loan calculator ──────────────────────────────────
// Reverse-engineered from the shared sheet. Inputs (red boxes) → derived.
// Assumptions (GSB Soft Loan defaults): down 20%, term 7y, no-collateral
// tiered rate from GSB_SOLAR_LOAN_DEFAULTS.interest_schedule (yr1-2 3.5%,
// yr3-5 5%, yr6+ MRR), 4 peak-sun-hours/day, 5฿/kWh, CO₂ 0.5 kg/kWh,
// 1 ton CO₂ ≈ 100 trees/yr.
//   down      = price × downPct
//   loan      = price − down
//   rates     = monthly rate of each month = rate of that loan year / 12
//   tiers     = each schedule range inside the term + its number of months
//   wAvg      = Σ monthly rates × 12 / n             (weighted avg/yr)
//   PMT       = equal installment solved so a multi-rate reducing-balance
//               loan amortises to 0 at month n (bisection)
//   total     = PMT × n ; interest = total − loan ; EIR = interest/loan/term
//   mo1Int    = loan × first month's rate ; mo1Prin = PMT − mo1Int
//   kwh       = kW × 4 × 30 ; save = kwh × unit ; netMo = PMT − save
//   billTot   = bill × n ; saveTot = save × n
//   co2Yr     = kwh × 12 × 0.0005 (ton) ; trees = co2Yr × 100
//   payback   = price / save (months) ; save25 = save × 12 × 25
// ช่วงดอกเบี้ยเป็นช่วงปี: [{from, to (null = จนจบสัญญา), rate (%/ปี), note}] — ใช้ทั้ง §8 และตารางผ่อน
function scheduleRanges(schedule) {
  return schedule.map((t, i) => ({ from: t.from_year, to: schedule[i+1] ? schedule[i+1].from_year - 1 : null, rate: Number(t.rate), note: t.note }));
}
const tierYears = t => t.to == null ? `ปีที่ ${t.from} เป็นต้นไป` : t.to === t.from ? `ปีที่ ${t.from}` : `ปีที่ ${t.from}-${t.to}`;
// schedule = ตารางดอกเบี้ยตามประกาศธนาคาร (loan-defaults · แผน 20261014-02) แทนอัตราปี 1-2 / ปี 3+ เดิม
function calcLoan(price, kw, bill, { unit=5, schedule=GSB_SOLAR_LOAN_DEFAULTS.interest_schedule, downPct=0.20, term=7 } = {}) {
  const down = Math.round(price * downPct), loan = price - down;
  const n = Math.max(1, Math.round(term*12));
  const rates = Array.from({ length: n }, (_, i) => rateForYear(schedule, Math.floor(i/12) + 1) / 1200);
  // จำนวนงวดของแต่ละช่วงภายในระยะกู้ — ช่วงที่เลยระยะกู้ไม่แสดง
  const tiers = scheduleRanges(schedule)
    .map(t => ({ ...t, n: Math.max(0, Math.min(n, t.to == null ? n : t.to*12) - (t.from-1)*12) }))
    .filter(t => t.n > 0);
  const wAvg = rates.reduce((sum, r) => sum + r, 0) * 12 / n;   // ถัวเฉลี่ยถ่วงน้ำหนักต่อปี (สัดส่วน)
  const balEnd = pmt => rates.reduce((b, r) => b + b*r - pmt, loan);
  let lo=0, hi=price;                     // bisection for equal payment
  for (let i=0;i<80;i++){ const mid=(lo+hi)/2; if (balEnd(mid)>0) lo=mid; else hi=mid; }
  const pmt = Math.round((lo+hi)/2);
  const total = pmt*n, interest = total-loan, eir = interest/loan/term;
  const mo1Int = Math.round(loan*rates[0]), mo1Prin = pmt-mo1Int;
  const kwh = kw*4*30, save = Math.round(kwh*unit), netMo = pmt-save;
  const billTot = bill*n, saveTot = save*n;
  const co2Yr = kwh*12*0.0005, trees = Math.round(co2Yr*100);
  const payback = save>0 ? price/save : null, save25 = save*12*25;
  // แบบกู้: นับดอกเบี้ยด้วย (ยอดที่จ่ายจริงทั้งหมด) · downBack = ได้เงินดาวน์คืนจากส่วนที่ประหยัดเกินค่างวด
  const paybackLoan = save>0 ? Math.ceil((down+total)/save) : null;
  const downBack = down>0 && save>pmt ? Math.ceil(down/(save-pmt)) : null;
  return { price, down, loan, tiers, n, wAvg, pmt, total, interest, eir,
           mo1Int, mo1Prin, kw, unit, bill, kwh, save, netMo, billTot, saveTot, co2Yr, trees, payback, save25,
           paybackLoan, downBack };
}
// §1/§3 questionnaire label maps
const HOUSE_AGE = { lt5:"ต่ำกว่า 5 ปี", "5_10":"5-10 ปี", "10_20":"10-20 ปี", gt20:"มากกว่า 20 ปี" };
const YESNO = { yes:"มี/ใช่", no:"ไม่มี/ไม่ใช่", maybe:"ยังไม่แน่ใจ" };
const EVPERIOD = { day:"กลางวัน", night:"กลางคืน" };
// Current + legacy codes from the questionnaire module itself — a private map
// here once knew only day/night/both/afternoon and printed "—" for 211 leads.
const PEAK = Object.fromEntries([...PEAK_USAGE, ...LEGACY_PEAK_USAGE].map(o => [o.value, o.label]));
const has = v => v!==null && v!==undefined && String(v).trim()!=="";

// Uploaded photo (/api/files/<name>) → data URI. A missing file yields null,
// which the page builders render as an empty hand-draw box, not a broken image.
function imgData(url) {
  if (!url) return null;
  const name = String(url).replace(/^\/api\/files\//, "");
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "uploads", name));
    const ext = (name.split(".").pop() || "jpg").toLowerCase();
    const mime = ext === "png" ? "image/png"
      : ext === "webp" ? "image/webp"
      : ext === "gif" ? "image/gif"
      : "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch { return null; }
}

// Absolute path of the accepted quotation PDF, or null when there isn't one.
// Same precedence the report body uses for the price, so the appendix and the
// §4 price bar can never disagree.
export function quotationPdfPath(L) {
  const files = (() => { try { return JSON.parse(L.quotation_files || "[]"); } catch { return []; } })();
  const accepted = files.find(q => q.doc_no === L.quotation_doc_no)
    || files.find(q => Number(q.amount) === Number(L.order_total))
    || files[files.length - 1] || null;
  if (!accepted?.url) return null;
  const p = path.join(process.cwd(), "public", "uploads", String(accepted.url).replace(/^\/api\/files\//, ""));
  return fs.existsSync(p) ? p : null;
}

// L = leads row (+ pname/district/province/surveyor), D = lead_data row
// (questionnaire), PKG = the package row or null.
export function buildSurveyReportHtml(L, D, PKG, options = {}) {
  const A = assets();
  const font = (n, w) =>
    `@font-face{font-family:'DB Heavent';src:url(data:font/woff;base64,${A[n]}) format('woff');font-weight:${w};font-style:normal;}`;
  const LOGO = `data:image/png;base64,${A.logo}`;

  const projectName = L.project_alias || L.pname || L.project_name || "";
  const installments = (() => { try { return JSON.parse(L.order_installments||"[]"); } catch { return []; } })();
  // accepted/latest quotation — quotation_doc_no points at the row in quotation_files
  const quotFiles = (() => { try { return JSON.parse(L.quotation_files||"[]"); } catch { return []; } })();
  // pick the accepted quotation file: match doc_no first; if the doc_no field
  // doesn't line up with any file (happens on some legacy rows), fall back to
  // the file whose amount equals order_total, then the last file.
  const acceptedQuot = quotFiles.find(q => q.doc_no === L.quotation_doc_no)
    || quotFiles.find(q => Number(q.amount) === Number(L.order_total))
    || quotFiles[quotFiles.length-1] || null;
  const quotation = options.quotation || {};
  const quotDocNo = quotation.docNo || acceptedQuot?.doc_no || L.quotation_doc_no || null;
  // price shown in §4 = the amount of the SAME quotation file we append, so the
  // price bar always matches the attached quotation. Fall back to order_total.
  const quotPrice = quotation.grossAmount ?? acceptedQuot?.amount ?? L.order_total ?? L.quotation_amount ?? null;
  // Whether the appendix page can promise a real attachment. Shares
  // quotationPdfPath so the page text and the merge decision can't disagree.
  const quotPdfPath = options.quotationAttached === true ? "attached-by-caller" : quotationPdfPath(L);

  // รูปแบบการชำระ (แผน 20261012-06) — ใบเสนอราคาส่งมาใน financial.inputs.payment_method
  // รายงานเดี่ยวที่ไม่มีใบเสนอราคาใช้คำตอบ Pre-Survey ตรง ๆ · snapshot เก่าไม่มีคีย์ = แสดงครบ
  //   แสดงเฉพาะแบบที่เลือก: loan = สินเชื่อ (14 หน้า) · cash = เงินสด · card = ผ่อนบัตร (13)
  //   all = ทุกทางเลือก (แบบเดิม 15)
  const payMethod = options.financial ? options.financial.inputs?.payment_method : D.payment_interest;
  const payMode = payMethod === "loan" ? "loan" : payMethod === "cash" ? "cash" : payMethod === "credit_card" ? "card" : "all";
  // เงินสด/บัตร ไม่มีส่วนสินเชื่อ — §8 กับตารางความคุ้มค่าอยู่หน้าเดียว (pCash)
  const noLoan = payMode === "cash" || payMode === "card";

  // ตารางดอกเบี้ยสินเชื่อ (แผน 20261014-02): ใบสูตร v4 ขึ้นไปมี interest_schedule · snapshot เก่ามีแค่
  // ปี 1-2 / ปี 3 ขึ้นไป → ทำเป็น 2 ช่วงให้หน้าตาเหมือนเดิม · รายงานเดี่ยวใช้ค่าตั้งต้นของออมสิน
  const finIn = options.financial?.inputs || {};
  const savedSchedule = readInterestSchedule(finIn.interest_schedule);
  const legacyRates = !savedSchedule && finIn.interest_rate_year_1_2 != null;
  const loanSchedule = savedSchedule
    ?? (legacyRates ? [{ from_year: 1, rate: Number(finIn.interest_rate_year_1_2) }, { from_year: 3, rate: Number(finIn.interest_rate_year_3_plus ?? finIn.interest_rate_year_1_2) }] : null)
    ?? GSB_SOLAR_LOAN_DEFAULTS.interest_schedule;
  // §8 แถวอัตราดอกเบี้ย สร้างจากตารางเดียวกับที่คำนวณ ข้อความกับตัวเลขจึงตรงกันเสมอ
  const GSB_RATE_TXT = legacyRates
    ? "เริ่มต้น 3.25% - 3.50% ต่อปี แบบลดต้นลดดอก (Effective Rate) — อัตราจริงขึ้นอยู่กับเงื่อนไขที่ธนาคารอนุมัติ ณ วันยื่นกู้"
    : `${scheduleRanges(loanSchedule).map(t => `${tierYears(t)}: ${t.note ? `${t.note} (${num(t.rate, 3)}%)` : `${num(t.rate, 2)}%`}`).join(" · ")} ต่อปี แบบลดต้นลดดอก (Effective Rate) — กรณีไม่มีหลักประกัน อัตราจริงขึ้นอยู่กับที่ธนาคารอนุมัติ ณ วันยื่นกู้`;

  const HEADER = `<div class="run-head">SENA SOLAR ENERGY | รายงานสำรวจหน้างานติดตั้งโซลาร์เซลล์ (Solar Cell Site Survey Report)</div>`;
  // จำนวนหน้าขึ้นกับรูปแบบการชำระ — page(n) รับ "ช่อง" ของหน้า แล้วเลขหน้าจริง/สารบัญ
  // เป็นโทเคน @@PG:<ช่อง>@@ ที่แทนค่าตอนประกอบเล่ม (ท้ายฟังก์ชัน) หลังรู้ว่ามีหน้าไหนบ้าง
  const pg = slot => `@@PG:${slot}@@`;
  const foot = n => `<div class="run-foot">หน้า ${pg(n)} / @@PGTOTAL@@</div>`;
  const reportWatermark = String(options.watermark || "").replace(/[&<>"']/g, "");
  const page = (n,b,cls="") => `<section class="page ${cls}" data-pg="${n}">${reportWatermark?`<div class="report-watermark">${reportWatermark}</div>`:""}${HEADER}<div class="body">${b}</div>${foot(n)}</section>`;
  const sect = (num,th,en) => `<h2 class="sect">${num?`<span class="num">${num}.</span> `:""}${th}${en?` <span class="en">${en}</span>`:""}</h2>`;
  const ph = t => `<span class="ip">[ ${t} ]</span>`;
  const V = (v, ptxt) => (v!==null && v!==undefined && String(v).trim()!=="") ? `<span class="val">${v}</span>` : ph(ptxt);
  // like V but shows a plain "—" (no bracket placeholder) when empty
  const Vd = v => (v!==null && v!==undefined && String(v).trim()!=="") ? `<span class="val">${v}</span>` : `<span class="muted">—</span>`;
  const kv = rows => `<table class="kv">${rows.map(([k,v])=>`<tr><td class="k">${k}</td><td class="v">${v}</td></tr>`).join("")}</table>`;
  // photo box: real image if available, else empty dashed placeholder
  const photoBox = (title, sub, src, h=92) => src
    ? `<div class="pimg" style="min-height:${h}px"><img src="${src}"/><div class="pcap">${title}</div></div>`
    : `<div class="ph" style="min-height:${h}px"><div class="ph-in"><div class="ph-t">🖼️ ${title}</div><div class="ph-s">${sub}</div></div></div>`;
  const emptyBox = (title, sub, h=120) => `<div class="ph" style="min-height:${h}px"><div class="ph-in"><div class="ph-t">🖼️ ${title}</div>${sub?`<div class="ph-s">${sub}</div>`:""}</div></div>`;

  // ── PAGE 1 cover ────────────────────────────────────────────────────
  const p1 = page(1, `<div class="cover">
    <img class="cov-logo" src="${LOGO}"/>
    <div class="cov-tag"><div class="ct-brand">SENA SOLAR ENERGY</div><div class="ct-en">"Home expertise beyond solar"</div><div class="ct-th">"ติดโซลาร์อย่างเข้าใจบ้าน"</div><div class="ct-sub">เพราะเราเข้าใจบ้าน เข้าใจโซลาร์ เข้าใจคุณ</div></div>
    <h1>รายงานตรวจหน้างาน ติดตั้งระบบโซลาร์เซลล์</h1>
    <div class="cov-en">Solar Cell Site Survey Report</div>
    ${kv([
      ["เลขที่เอกสาร /<br/>เลขที่ใบเสนอราคาคู่กัน", V(quotDocNo || L.pre_doc_no,"QT-XXXX-XXXX")],
      ["ชื่อลูกค้า", V(L.full_name,"ชื่อ - นามสกุลลูกค้า")],
      ["สถานที่ติดตั้ง", V(L.installation_address,"ที่อยู่ที่ติดตั้ง")],
      ["เบอร์ติดต่อ", V(L.phone,"เบอร์โทรศัพท์")],
      ["วันที่เข้าสำรวจหน้างาน", V(thDate(L.survey_date),"วว/ดด/ปปปป")],
      ["ผู้เข้าสำรวจ", V(L.surveyor,"ชื่อวิศวกร/ทีมสำรวจ")],
      ["จัดทำโดย","บริษัท เสนาโซลาร์ เอนเนอร์ยี่ จำกัด (SENA SOLAR ENERGY Co., Ltd.)"],
    ])}
    <div class="co-block">
      <div class="co-name">บริษัท เสนาโซลาร์ เอนเนอร์ยี่ จำกัด (SENA SOLAR ENERGY Co., Ltd.)</div>
      <div class="co-line">448 อาคารธัญลักษณ์ภาคย์ ถนนรัชดาภิเษก แขวงสามเสนนอก เขตห้วยขวาง กรุงเทพมหานคร 10310</div>
      <div class="co-line">โทร. 099-115-1888, (02) 541-4642 (20 สาย)  อีเมล sales@senasolarenergy.com</div>
      <div class="co-line">LINE: @senasolarenergy  เว็บไซต์: senasolarenergy.com</div>
    </div>
    <div class="cov-note">เอกสารฉบับนี้ใช้ประกอบคู่กับใบเสนอราคา (Quotation) เพื่อสรุปผลการสำรวจหน้างานจริง ข้อสมมติฐานการใช้ไฟฟ้า แพ็กเกจที่นำเสนอ และเงื่อนไขการชำระเงิน สำหรับใช้ประกอบการตัดสินใจของลูกค้า</div>
  </div>`, "cover-page");

  // ── PAGE 2 TOC ──────────────────────────────────────────────────────
  const toc=[["1. ข้อมูลลูกค้าและโครงการ",3],["2. รูปถ่ายหน้างานจริงและจุดติดตั้งอุปกรณ์",4],["3. ข้อสมมติฐานการใช้ไฟฟ้า (Load Assumption)",6],["4. แพ็กเกจโซลาร์เซลล์ที่นำเสนอ",7],["5. รายการเพิ่มเติมนอกเหนือจากแพ็กเกจมาตรฐาน",8],["6. ขั้นตอนถัดไปสำหรับลูกค้า (Customer Journey)",9],["7. ทางเลือกการชำระเงินมัดจำ 20% (เพื่อจองวันติดตั้ง)",10],["8. ทางเลือกการชำระเงินส่วนที่เหลือ 80%",11],["9. หมายเหตุและเงื่อนไขทั่วไป",14],["ภาคผนวก ก: ใบเสนอราคา (Quotation)",15]];
  const p2 = page(2, `${sect("","สารบัญ")}<div class="toc">${toc.map(([t,n])=>`<div class="toc-row"><span class="toc-t">${t}</span><span class="toc-dot"></span><span class="toc-n">${pg(n)}</span></div>`).join("")}</div>`);

  // ── PAGE 3 §1 ───────────────────────────────────────────────────────
  const meterTxt = L.survey_meter_size ? `${METER[L.survey_meter_size]||L.survey_meter_size}${L.survey_electrical_phase?` ${PHASE[L.survey_electrical_phase]}`:""}` : null;
  const p3 = page(3, `${sect("1","ข้อมูลลูกค้าและโครงการ")}
    ${kv([
      ["ชื่อ-นามสกุลลูกค้า", V(L.full_name,"กรอกชื่อลูกค้า")],
      ["ที่อยู่ที่ติดตั้ง", V(L.installation_address,"กรอกที่อยู่")],
      ["โครงการ", V(projectName || (L.district?`${L.district}${L.province?" "+L.province:""}`:null),"ชื่อโครงการ/พื้นที่")],
      ["ประเภทที่อยู่อาศัย", V(RESIDENCE[D.residence_type],"บ้านเดี่ยว / ทาวน์โฮม / อาคารพาณิชย์ / อื่นๆ")],
      ["อายุบ้าน", V(HOUSE_AGE[D.house_age],"ต่ำกว่า 5 ปี / 5-10 ปี / 10-20 ปี / มากกว่า 20 ปี")],
      ["ลักษณะหลังคา", V(roofLabel(L.survey_roof_material) || roofLabel(D.roof_shape),"หลังคากระเบื้อง / เมทัลชีท / คอนกรีต")],
      ["มิเตอร์ไฟฟ้า (การไฟฟ้า)", V(meterTxt || (D.meter_size?`${METER[D.meter_size]||D.meter_size}${D.electrical_phase?` ${PHASE[D.electrical_phase]}`:""}`:null),"กฟน. / กฟภ. - ขนาดมิเตอร์ เช่น 15(45)A 1 เฟส")],
      ["ค่าไฟฟ้าเฉลี่ยต่อเดือน<br/>(ก่อนติดตั้ง)", V(D.monthly_bill?`${baht(D.monthly_bill)} บาท/เดือน`:(L.survey_monthly_bill?`${baht(L.survey_monthly_bill)} บาท/เดือน`:null),"กรอกจากบิลค่าไฟย้อนหลัง")],
      ["วันที่เข้าสำรวจ", V(thDate(L.survey_date),"วว/ดด/ปปปป")],
      ["ผู้สำรวจหน้างาน", V(L.surveyor,"ชื่อทีมสำรวจ")],
    ])}
    <div class="callout blue"><div class="co-h">เพราะเราเข้าใจบ้าน เข้าใจคุณ · รายงานฉบับนี้ใช้เพื่อนำเสนอ</div><ul>
      <li>สรุปสภาพหน้างานจริงที่ตรวจพบ ณ วันที่เข้าสำรวจ เพื่อยืนยันความเหมาะสมของแพ็กเกจที่นำเสนอ</li>
      <li>แสดงที่มาของตัวเลขการใช้ไฟฟ้าที่ใช้ประกอบการออกแบบระบบ</li>
      <li>แนะนำบริการดูแลเรื่องสินเชื่อ ตั้งแต่ต้นจนจบ เพื่ออำนวยความสะดวกแบบ ONE STOP SERVICE</li><li>ใช้อ่านคู่กับใบเสนอราคา (Quotation) เพื่อประกอบการตัดสินใจของลูกค้า</li></ul></div>`);

  // ── PAGE 4 §2 photos (real, categorized) ────────────────────────────
  const imgBuilding = imgData(L.survey_photo_building_url);
  const imgRoof = imgData(L.survey_photo_roof_structure_url);
  const imgInv = imgData(L.survey_photo_inverter_point_url);
  const imgMdb = imgData(L.survey_photo_mdb_url);
  const imgLayoutSketch = imgData(L.survey_layout_sketch_url);
  const p4 = page(4, `${sect("2","รูปถ่ายหน้างานจริงและจุดติดตั้งอุปกรณ์")}<p class="src">(ข้อมูลจาก Survey)</p>
    <p class="lead">ภาพถ่ายหน้างานจริงประกอบการสำรวจ พร้อมร่างตำแหน่งจุดติดตั้งอุปกรณ์หลักของระบบโซลาร์เซลล์ เพื่อให้ลูกค้าเห็นภาพตำแหน่งการติดตั้งจริงก่อนดำเนินการ</p>
    <div class="pgrid">
      ${photoBox("ภาพที่ 1: รูปมุมกว้างของบ้าน / อาคาร","ถ่ายให้เห็นตัวบ้านและหลังคาทั้งหลัง",imgBuilding,170)}
      ${photoBox("ภาพที่ 2: รูปพื้นที่หลังคาที่จะติดตั้งแผงโซลาร์","ถ่ายมุมที่เห็นโครงหลังคา",imgRoof,170)}
      ${photoBox("ภาพที่ 3: รูปตำแหน่งที่จะติดตั้ง Inverter","ถ่ายผนัง/พื้นที่ติดตั้ง Inverter",imgInv,170)}
      ${photoBox("ภาพที่ 4: รูปตู้ไฟหลัก (MDB) และมิเตอร์ไฟฟ้า","ถ่ายให้เห็นมิเตอร์และสภาพตู้ไฟ",imgMdb,170)}
    </div>`);

  // ── PAGE 5 §2 sketch (empty) ────────────────────────────────────────
  const p5 = page(5, `<h3 class="subh">ผังร่างจุดติดตั้งอุปกรณ์ (Equipment Layout Sketch)</h3>
    <p class="lead">ร่างผังหลังคาโดยประมาณ แสดงตำแหน่งแผงโซลาร์เซลล์ แนวเดินสายไฟ DC/AC ตำแหน่ง Inverter และตำแหน่งเชื่อมต่อเข้าตู้ไฟหลัก (MDB) ตามที่สำรวจหน้างานจริง</p>
    <div class="sketch${imgLayoutSketch ? " has-image" : ""}">
      ${imgLayoutSketch
        ? `<img class="sketch-img" src="${imgLayoutSketch}" alt="Equipment Layout Sketch"/>`
        : `<div class="sk-note">พื้นที่สำหรับวาดผังร่างด้วยมือ — ระบุ: ตำแหน่งแผงโซลาร์ • แนวสายไฟ DC/AC • ตำแหน่ง Inverter • จุดเชื่อมต่อ MDB • ทิศทาง (N)</div>`}
    </div>`);

  // ── PAGE 6 §3 Load Assumption — every figure comes from computeLoad()
  // (src/lib/load-assumption.ts), the module behind the Customer Info preview,
  // so the report and the form cannot disagree. Rows nobody answered keep the
  // blank fill-in cells for the surveyor to write by hand; "ไม่ทราบ" rows say
  // so in words (blank cells read as a form nobody finished); "—" marks a cell
  // that doesn't apply (night hours on the daytime-AC row).
  // Table rows are compact so table + summary + battery callout fit one page
  // (the page has a fixed height and the TOC fixed page numbers — never let
  // this section spill onto page 7).
  // Meter/phase only steer the EV charger's default kW — the surveyor's
  // measured values win over the questionnaire's (same order as §1).
  const load = computeLoad({ ...D,
    meter_size: L.survey_meter_size || D.meter_size,
    electrical_phase: L.survey_electrical_phase || D.electrical_phase });
  // blank fill-in cell — no [ __ ] placeholder, just the unit right-aligned
  // (mostly empty so it can be written by hand). bl("") = fully empty cell.
  const bl = (unit="") => `<span class="bl">${unit}</span>`;
  // ตัวเลข + หน่วย ต้องอยู่บรรทัดเดียวกันเสมอ ไม่งั้นจะตัดเป็น "... 1" / "เฟส"
  const keepUnit = (t) => t
    // ไม่ใช้ \b ปิดท้าย — อักษรไทยไม่ใช่ word char ของ JS regex ขอบเขตจึงไม่เกิด
    // ("1 เฟส" เลยไม่แมตช์ แล้วถูกตัดคนละบรรทัดเหมือนเดิม)
    ? String(t).replace(/(\d+(?:[.,]\d+)?)\s+(kWp|kWh|kW|เฟส|ชุด|แผง|เครื่อง|กล่อง|งาน|SET|W)/gi,
        '<span class="nw">$1 $2</span>')
    : t;
  const n1 = v => Number(v).toLocaleString("th-TH", { maximumFractionDigits: 1 });
  // hours keep 2 decimals (4.29 ชม.) — the kWh beside them is computed from
  // exactly this figure, so the printed row multiplies out
  const n2 = v => Number(v).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  const na = `<span class="muted">—</span>`;
  // unit shown in an empty ขนาด cell, matching what the surveyor would write
  const SIZE_UNIT = { ac_day:"BTU", ac_night:"BTU", electronics:"W", lighting:"W" };
  const unk = `<span class="unk">ไม่ทราบ</span>`;
  // "ไม่ทราบ" row: nothing is computed, so kWh is "—". AC/EV may still know
  // how many and how big (only the hours are unknown) — print those.
  const unknownRow = r => {
    const hasQty = r.qty != null;
    const hrs = applies => !applies ? na : hasQty ? unk : na;
    return `<tr><td class="dev">${r.label}</td><td>${hasQty ? `<span class="val">${r.qty}</span>` : unk}</td>`
      + `<td>${hasQty && r.size ? `<span class="val">${keepUnit(r.size)}</span>` : na}</td>`
      + `<td>${hrs(r.dayApplies)}</td><td>${hrs(r.nightApplies)}</td><td>${na}</td><td>${na}</td></tr>`;
  };
  const loadRow = r => {
    if (r.status === "unknown") return unknownRow(r);
    const known = r.status === "answered" || r.status === "partial";
    const size = r.qty === "0" ? na   // "ไม่มี" — nothing to size
      : known && r.size ? `<span class="val">${keepUnit(r.size)}</span>` : bl(SIZE_UNIT[r.key] || "kW");
    const hrs = (applies, h) => !applies ? na : h == null ? bl("ชม.") : `<span class="val nw">${n2(h)} ชม.</span>`;
    const kwh = (applies, k) => !applies ? na : k == null ? bl() : `<span class="val">${n1(k)}</span>`;
    return `<tr><td class="dev">${r.label}</td><td>${r.qty != null ? `<span class="val">${r.qty}</span>` : bl()}</td><td>${size}</td>`
      + `<td>${hrs(r.dayApplies, r.dayHours)}</td><td>${hrs(r.nightApplies, r.nightHours)}</td>`
      + `<td>${kwh(r.dayApplies, r.dayKwh)}</td><td>${kwh(r.nightApplies, r.nightKwh)}</td></tr>`;
  };
  const totCell = v => v == null ? bl("kWh") : `<span class="nw">${n1(v)} kWh</span>`;
  // Fixed layout: a long AC mix ("9,000 BTU × 1, 12,000 BTU × 2 …") must wrap
  // inside its own column instead of squeezing the hour/kWh headers.
  const loadTable = `<table class="load compact" style="table-layout:fixed"><thead><tr>
    <th style="width:24%">อุปกรณ์ไฟฟ้า</th><th style="width:10%">จำนวน</th><th style="width:22%">ขนาด /<br/>กำลังไฟ</th><th style="width:10%">ชม.กลางวัน<br/>(06-18)</th><th style="width:10%">ชม.กลางคืน<br/>(18-06)</th><th style="width:12%">kWh/วัน<br/>กลางวัน</th><th style="width:12%">kWh/วัน<br/>กลางคืน</th></tr></thead>
    <tbody>${load.rows.map(loadRow).join("")}
    <tr class="load-total"><td colspan="5">รวมพลังงานที่ใช้โดยประมาณ (kWh/วัน)</td><td class="tot-org">${totCell(load.dayKwh)}</td><td class="tot-navy">${totCell(load.nightKwh)}</td></tr></tbody></table>`;
  // One line under the table: night share (the battery question) + how much of
  // the real bill the assumption explains. Numbers only — whether to add a
  // battery is the package's call, not this page's (plan D3).
  const loadBill = D.monthly_bill || L.survey_monthly_bill || null;
  const loadRate = Number(options.financial?.inputs?.electricity_rate) > 0 ? Number(options.financial.inputs.electricity_rate) : null;
  // Only once every question was asked — a half-filled table explains a
  // tiny share of the bill and would read as a finding. Same bar the
  // quotation submit gate enforces ("ไม่ทราบ" counts as asked).
  const billCheck = loadBillCheck(load, loadBill, loadRate);
  const coverage = billCheck?.complete ? billCheck.coverage : null;
  // Rows left out of the total, by name — "7/9 รายการ" made the reader count
  // the table. The two AC rows collapse to one name.
  const skipped = unknown => [...new Set(load.rows
    .filter(r => r.dayKwh == null && r.nightKwh == null && (r.status === "unknown") === unknown)
    .map(r => r.label.replace(/ \(ใช้.+\)$/, "")))];
  const skipText = [[skipped(false), "ข้อมูลยังไม่ครบ"], [skipped(true), "ลูกค้าไม่ทราบ"]]
    .filter(([names]) => names.length).map(([names, why]) => `${names.join(", ")} (${why})`).join(" และ ");
  // The AC load-factor line (70% / 55%) was dropped at the user's request
  // (12 Oct) — the AC row's own "เฉลี่ย ≈x kW" already says it's an average.
  const notes = [
    skipText && `ยอดรวมยังไม่นับ ${skipText}`,
    "กำลังไฟใช้ค่ามาตรฐานของอุปกรณ์แต่ละประเภท ไม่ได้วัดจากเครื่องจริง",
  ].filter(Boolean);
  // Summary under the table, in two groups (plan 20261012-05):
  //  · "ใช้ประเมิน Battery" — night share first and emphasised, with a bar
  //    against the callout's "> 40-50%" rule of thumb, then the daily total
  //    it comes from. Numbers and the rule only — no verdict (plan
  //    20260928-01 D3: sales may already have quoted On-Grid).
  //  · "ตรวจกับบิลค่าไฟ" — monthly vs bill, smaller: it says how far to trust
  //    the first group, it doesn't decide anything.
  // Night share is worded like the battery callout ("ของการใช้รวม") so the
  // reader can match the two.
  const n0 = v => Math.round(v).toLocaleString("th-TH");
  const loadSummary = (() => {
    if (load.dayKwh == null) return "";
    const day = load.dayKwh, night = load.nightKwh ?? 0;
    const perDay = Math.round((day + night) * 10) / 10;
    const share = load.nightShare != null ? Math.round(load.nightShare * 100) : null;
    // Night (navy) from the left, day (orange) — the totals row's colours.
    // The band marks 40–50%, where the callout's rule of thumb sits.
    const bar = share == null ? "" : `<div class="nbar"><div class="nbar-track">`
      + `<span class="nbar-night" style="width:${share}%"></span><span class="nbar-band" style="left:40%;width:10%"></span></div>`
      + `<div class="nbar-lbl"><span class="l">กลางคืน ${share}%</span><span class="m" style="left:45%">เกณฑ์ทั่วไป 40–50%</span><span class="r">กลางวัน ${100 - share}%</span></div></div>`;
    // A table that explains little of the bill gives a share of that little —
    // say so where the share is, not only in the bill rows.
    const thin = coverage != null && coverage < 0.7
      ? `<div class="lsum-warn">ตารางนี้อธิบายการใช้ไฟได้เพียง ≈ ${Math.round(coverage * 100)}% ของบิล สัดส่วนจริงอาจต่างจากนี้</div>` : "";
    const key = [
      share != null && ["สัดส่วนใช้ไฟกลางคืน", `กลางคืน ${n1(night)} ÷ รวม ${n1(perDay)} = <b class="big">${share}%</b> ของการใช้รวม${bar}${thin}`, "hi"],
      ["ใช้ไฟรวมต่อวัน", `กลางวัน ${n1(day)} + กลางคืน ${n1(night)} = <b>${n1(perDay)} kWh/วัน</b>`],
    ].filter(Boolean);
    const check = [];
    if (coverage != null) {
      const rate = loadRate ?? DEFAULT_ELECTRICITY_RATE;
      // Told from the bill's side, one line in the cell (user picked, 12 Oct)
      const meaning = coverage < 0.7 ? "บิลจริงยังมีการใช้ไฟจากเครื่องใช้ไฟฟ้าอื่นที่ไม่ได้อยู่ในตาราง"
        : coverage <= 1.3 ? "ตัวเลขในตารางใกล้เคียงกับบิลจริง"
          : "ตัวเลขในตารางสูงกว่าบิลจริง ชั่วโมงใช้งานจริงอาจน้อยกว่าที่ประมาณ";
      check.push(
        ["ประมาณการต่อเดือน", `${n1(perDay)} kWh × 30 วัน = <b>${n0(perDay * 30)} kWh/เดือน</b>`],
        ["ไฟที่ใช้จริงตามบิล", `ค่าไฟ ${baht(loadBill)} บาท ÷ ${n2(rate)} บาท/หน่วย (ค่าไฟเฉลี่ย) ≈ <b>${n0(loadBill / rate)} kWh/เดือน</b>`],
        ["เทียบกับบิล", `${n0(perDay * 30)} ÷ ${n0(loadBill / rate)} ≈ <b>${Math.round(coverage * 100)}%</b> — ${meaning}`],
      );
    }
    const group = (rows, head, cls) => rows.map(([k, v, rowCls], i) =>
      `<tr class="${[cls, rowCls].filter(Boolean).join(" ")}">${i === 0 ? `<td class="lsum-h" rowspan="${rows.length}">${head}</td>` : ""}<td class="k">${k}</td><td class="v">${v}</td></tr>`).join("");
    return `<table class="kv qsum lsum"><tbody>${group(key, "ใช้ประเมิน<br/>Battery", "")}${group(check, "ตรวจกับ<br/>บิลค่าไฟ", "chk")}</tbody></table>`;
  })();
  const loadNote = load.dayKwh == null ? ""
    : loadSummary + `<p class="load-note sub">หมายเหตุ: ${notes.join(" · ")}</p>`;
  // Occupants: people = adults + elderly + kids; pets are listed but never
  // counted as people (migration 199). Built from the parts, not
  // occupant_total, because snapshots frozen before the fix hold a total that
  // still includes pets.
  const occ = (() => {
    const a = Number(D.occupant_adults) || 0, e = Number(D.occupant_elderly) || 0, k = Number(D.occupant_kids) || 0, pets = Number(D.occupant_pets) || 0;
    const parts = [["ผู้ใหญ่", a], ["ผู้สูงอายุ", e], ["เด็ก", k]].filter(([, n]) => n > 0).map(([t, n]) => `${t} ${n}`).join(", ");
    const people = has(D.occupant_adults) ? `${a + e + k} คน${parts ? ` (${parts})` : ""}` : parts ? `${parts} คน (ไม่ได้ระบุผู้ใหญ่)` : null;
    const petTxt = pets ? `สัตว์เลี้ยง ${pets} ตัว` : null;
    return [people, petTxt].filter(Boolean).join(" · ") || null;
  })();
  // Charge period only when the customer HAS a charger — 49 leads carried a
  // period left over from asking about a planned EV (plan D6).
  const evTxt = hasEvCharger(D.appliances)
    ? (EVPERIOD[D.ev_charge_period] || null)
    : (load.asked || has(D.appliances)) ? "ไม่มีที่ชาร์จ EV" : null;
  const p6 = page(6, `${sect("3","ข้อสมมติฐานการใช้ไฟฟ้า (Load Assumption)")}
    <p class="lead">ข้อมูลด้านล่างเป็นข้อสมมติฐานพฤติกรรมการใช้ไฟฟ้าของเจ้าของบ้าน จากการสอบถามเจ้าของบ้านโดยตรงและการสังเกตอุปกรณ์จริงหน้างาน แบ่งเป็นช่วงกลางวัน (06:00-18:00 น. ที่โซลาร์ผลิตไฟได้) และกลางคืน (18:00-06:00 น.) เพื่อประเมินว่าควรติดตั้ง Battery สำรองไฟเพิ่มหรือไม่</p>
    <table class="kv qsum"><tbody>
      <tr><td class="k">ช่วงเวลาใช้ไฟหลัก</td><td class="v">${Vd(PEAK[D.peak_usage] || null)}</td>
        <td class="k">อยู่บ้านช่วงกลางวัน</td><td class="v">${Vd(has(D.home_at_daytime)?(D.home_at_daytime==="yes"?"อยู่":"ไม่อยู่"):null)}</td></tr>
      <tr><td class="k">จำนวนผู้อยู่อาศัย</td><td class="v">${Vd(occ)}</td>
        <td class="k">ช่วงชาร์จ EV</td><td class="v">${Vd(evTxt)}</td></tr>
    </tbody></table>
    ${loadTable}
    ${loadNote}
    <div class="callout blue tight"><div class="co-h">เข้าใจโซลาร์ : ข้อพิจารณาเรื่องระบบ Battery สำรองไฟ</div><ul>
      <li><b>ระบบโซลาร์รูฟ แบบไม่มี Battery</b> คือ ระบบโซลาร์เซลล์ที่เชื่อมต่อกับสายส่งของการไฟฟ้า ผลิตไฟจากแสงอาทิตย์มาใช้ในเวลากลางวัน และดึงไฟจากการไฟฟ้ามาเสริมอัตโนมัติหากผลิตไม่พอ ไม่ใช้แบตเตอรี่ ดูแลรักษาง่าย คุ้มค่าเมื่อใช้ไฟช่วงกลางวันเป็นหลัก</li><li><b>ระบบโซลาร์รูฟ พร้อม Battery</b> คือ ระบบที่ทำงานร่วมกันระหว่างแผงโซลาร์เซลล์ · แบตเตอรี่เก็บไฟ · และโครงข่ายไฟฟ้าจากการไฟฟ้า ดึงพลังงานแสงอาทิตย์มาใช้เป็นหลัก นำส่วนเกินไปเก็บไว้ในแบตเตอรี่สำหรับใช้ตอนกลางคืน และสลับไปใช้ไฟการไฟฟ้าอัตโนมัติหากพลังงานหมด</li>
      <li>หากสัดส่วนใช้ไฟกลางคืนสูง (ทั่วไป > 40-50% ของการใช้รวม) แนะนำ <b>ระบบโซลาร์รูฟ พร้อม Battery</b> เพื่อเก็บพลังงานส่วนเกินกลางวันไว้ใช้กลางคืน</li>
    </ul></div>`);

  // ── PAGE 8 §4 package — HYBRID: pull package specs from the linked
  // package (PKG); fields the catalog doesn't hold stay blank right-aligned.
  const sysType = PKG ? (PKG.is_upgrade ? "โซลาร์รูฟ · Upgrade เพิ่มเติมระบบเดิม" : (PKG.has_battery ? "ระบบโซลาร์รูฟ พร้อม Battery" : "ระบบโซลาร์รูฟ แบบไม่มี Battery")) : (L.survey_wants_battery==="customize"||D.wants_battery==="upgrade"?"โซลาร์รูฟ · Upgrade เพิ่มแบตเตอรี่":null);
  const invTxt = PKG && (PKG.inverter_brand||PKG.inverter_kw) ? `${PKG.inverter_brand||""}${PKG.inverter_kw?` ${PKG.inverter_kw} kW`:""}`.trim() : null;
  const warrTxt = PKG?.warranty_years ? `แผง 12 ปี / อินเวอร์เตอร์ 10 ปี / งานติดตั้ง ${L.warranty_duration_years||2} ปี (มาตรฐาน)` : (L.warranty_duration_years?`งานติดตั้ง ${L.warranty_duration_years} ปี`:"แผง 12 ปี / อินเวอร์เตอร์ 10 ปี / งานติดตั้ง 2 ปี (มาตรฐาน)");
  // Prefer the package catalog count; field-survey count is the real fallback
  // for legacy packages whose solar_panels has never been filled in.
  const panelCount = Number(PKG?.solar_panels || L.survey_panel_count || 0);
  const panelCountTxt = panelCount > 0 ? `<span class="val">${baht(panelCount)}</span>` : '<span class="wr"></span>';
  const finOut = options.financial?.outputs || {};
  // Price = mirror the quotation summary: gross package price − VIP discount −
  // booking deposit = net. Show a breakdown when there's a discount/deposit;
  // otherwise a single price bar. Net matches the quotation's "รวมยอดสุทธิ".
  const gross = quotPrice ?? PKG?.price ?? null;
  // ค่าธรรมเนียมผ่อนบัตร: เซลส์กรอก % ในใบเสนอราคา · ไม่กรอก = เส้นว่างให้เขียนมือ (แบบเดิม)
  // ยอดผ่อน/เดือน = ยอด 80% × (1 + %) ÷ 10 ตามคำอธิบายในตาราง §8
  const ccFeeRaw = options.financial?.inputs?.credit_card_fee_percent;
  const ccFee = ccFeeRaw === null || ccFeeRaw === undefined || String(ccFeeRaw).trim() === "" || !Number.isFinite(Number(ccFeeRaw)) ? null : Number(ccFeeRaw);
  const ccBase = quotation.contractAmount ?? gross ?? quotation.netAmount ?? PKG?.price ?? null;
  // ยอดที่ผ่อนบัตร = งวดสุดท้ายในใบเสนอราคา (หลังหักเงินจอง ตรงกับตารางงวดในใบ)
  // · รายงานเดี่ยวที่ไม่มีใบ ใช้ 80% ของราคา
  const lastInst = quotation.lastInstallment;
  const ccPct = lastInst ? Number(lastInst.percent) : 80;
  const ccPctTxt = num(ccPct, Number.isInteger(ccPct) ? 0 : 2);
  const ccRest = lastInst ? Number(lastInst.amount) : ccBase != null ? Math.round(Number(ccBase) * 0.8) : null;
  const ccFeeAmt = ccFee != null && ccRest != null ? Math.round(ccRest * ccFee / 100) : null;
  const ccMonthly = ccFee != null && ccRest != null ? Math.round(ccRest * (1 + ccFee / 100) / 10) : null;
  // ผ่อนบัตร: จุดคุ้มทุนนับค่าธรรมเนียมบัตรด้วย (เหมือนสินเชื่อนับดอกเบี้ย) · ไม่มีค่าธรรมเนียม = แบบเงินสด
  const cardPayback = (price, save) => ccFeeAmt > 0 && price != null && save > 0 ? Math.ceil((Number(price) + ccFeeAmt) / save) : null;
  // §4 จุดคุ้มทุนตามแบบที่เสนอ: ผ่อนนับดอกเบี้ย (snapshot ก่อนสูตร v3 ไม่มีค่านี้ ใช้ตัวเดิม) · บัตรนับค่าธรรมเนียม
  const loanPaybackTxt = payMode === "loan" && finOut.payback_months_with_loan != null;
  const cardPaybackMonths = payMode === "card" ? cardPayback(ccBase, Number(finOut.monthly_saving)) : null;
  const paybackMonths = Number(cardPaybackMonths ?? (payMode === "loan" ? finOut.payback_months_with_loan ?? finOut.payback_months : finOut.payback_months) ?? 0);
  const paybackTxt = paybackMonths > 0 ? `${baht(paybackMonths)} เดือน (${num(paybackMonths / 12, 1)} ปี)${loanPaybackTxt ? " · รวมดอกเบี้ย" : cardPaybackMonths ? " · รวมค่าธรรมเนียมบัตร" : ""}` : null;
  // §4 แสดงราคาของ "แพ็กเกจหลัก" ตัวเดียวเท่านั้น — ไม่รวม package รอง/งานเพิ่ม
  // ที่ไปแสดงแยกใน §5 (เดิมใช้ยอดรวมทั้งใบ ทำให้ชื่อแพ็กเกจกับราคาไม่ใช่ของเดียวกัน
  // เช่น "3 kWp_On" คู่กับ 397,250 ซึ่งเป็นยอดรวมทั้งใบ)
  const packageGross = PKG?.price ?? quotPrice ?? null;
  const discAmt = Number(quotation.discountAmount ?? L.order_discount_amount) || 0;
  const bookingFee = Number(quotation.depositAmount ?? L.pre_total_price) || 0;   // เงินจอง/ค่าสำรวจ
  const net = quotation.netAmount ?? (gross != null ? gross - discAmt - bookingFee : null);
  // ส่วนลด/เงินจอง คิดกับยอดทั้งใบ ไม่ใช่กับแพ็กเกจตัวเดียว จึงไม่แสดงที่ §4
  // ยอดสุทธิที่ต้องชำระจริงอยู่ในใบเสนอราคา (ภาคผนวก ก) และหมวดทางเลือกการชำระเงิน
  const priceBlock = packageGross == null
    ? `<div class="price-bar"><span class="pb-l">ราคาแพ็กเกจ (รวม VAT)</span><span class="pb-r">${bl("บาท")}</span></div>`
    : `<div class="price-bar"><span class="pb-l">ราคาแพ็กเกจ (รวม VAT)</span><span class="pb-r"><span class="val">${baht(packageGross)}</span><span class="pb-unit">บาท</span></span></div>`;
  const p8 = page(7, `${sect("4","แพ็กเกจโซลาร์เซลล์ที่นำเสนอ")}
    ${kv([
      // ชื่อที่แสดง = บรรทัดแรกของรายการในใบเสนอราคา (เช่น "งานจ้างเหมาติดตั้ง...
      // ขนาดติดตั้งรวม 2.92 kWp 1 เฟส") ให้ตรงกับที่ลูกค้าเห็นในใบเสนอราคา
      // ถ้าเปิดรายงานเดี่ยว ๆ ที่ไม่มีใบเสนอราคา ค่อยใช้ชื่อแพ็กเกจใน Master
      // keepUnit() กันไม่ให้ตัวเลขกับหน่วยถูกตัดคนละบรรทัด ("2.92 kWp" / "1 เฟส")
      ["ชื่อแพ็กเกจ", V(keepUnit(options.packageTitle) || PKG?.name,"เช่น Package Standard 5 kWp")],
      ["ขนาดระบบ (System Size)", PKG?.kwp ? `<span class="val">${PKG.kwp} kWp</span>${PKG.phase?` · ${PKG.phase} เฟส`:""}` : bl("kWp")],
      ["แบตเตอรี่ (Battery)", PKG ? (PKG.has_battery ? `<span class="val">${PKG.battery_kwh?`${PKG.battery_kwh} kWh`:""}${PKG.battery_brand?` · ${PKG.battery_brand}`:""}</span>` : `<span class="val">ไม่มี</span>`) : V(null,"ไม่มี / ระบุขนาด")],
      ["อินเวอร์เตอร์ (Inverter)", V(invTxt,"ยี่ห้อ/รุ่น ขนาด kW")],
      ["โครงสร้างยึดแผง (Racking)", V(roofLabel(L.survey_roof_material)||roofLabel(D.roof_shape),"ประเภทหลังคา / วัสดุโครงสร้าง")],
      ["ประเภทระบบ", V(sysType,"On-Grid / Hybrid")],
      ["ระยะเวลาคืนทุนโดยประมาณ (Payback Period)", V(paybackTxt,"ระยะเวลาคืนทุนโดยประมาณ")],
      ["การรับประกัน", V(warrTxt,"แผง / อินเวอร์เตอร์ / งานติดตั้ง")],
    ])}
    ${priceBlock}
    <p class="tiny-note">หมายเหตุ: ราคาข้างต้นนำมาจากใบเสนอราคา (Quotation) เลขที่ ${quotDocNo||L.pre_doc_no||"—"} ฉบับล่าสุดที่แนบไว้ในภาคผนวก ก. หากตัวเลขในสองเอกสารไม่ตรงกัน ให้ยึดตามใบเสนอราคาในภาคผนวกเป็นหลัก</p>
    ${PKG?.is_upgrade ? `<div class="callout orange"><div class="co-h">หมายเหตุกรณีลูกค้ารายนี้</div><ul>
    <li>แพ็กเกจนี้เป็นงาน <span class="val">Upgrade / เพิ่มเติมระบบเดิม</span> (${PKG.name}) รายละเอียดจำนวนแผง/อินเวอร์เตอร์ที่เพิ่ม ให้ยึดตามใบเสนอราคาเลขที่ ${quotDocNo||"—"} เป็นหลัก</li></ul></div>`:""}
    <h3 class="subh">เข้าใจบ้าน เข้าใจคุณ · เหตุผลที่แพ็กเกจนี้เหมาะสมกับลูกค้า</h3>
    <p class="lead">จากผลการสำรวจหน้างานและข้อมูลการใช้ไฟฟ้าที่สอบถามจากเจ้าของบ้าน ทีมงานประเมินว่าแพ็กเกจนี้เหมาะสมด้วยเหตุผลดังนี้</p>
    <ul class="reasons">
      <li>ขนาดระบบ ${PKG?.kwp?`<span class="val">${PKG.kwp}</span>`:'<span class="wr"></span>'} kWp สอดคล้องกับปริมาณการใช้ไฟฟ้าช่วงกลางวันที่ประเมินได้จากข้อสมมติฐานในหมวดที่ 3 ทำให้ใช้พลังงานที่ผลิตได้อย่างคุ้มค่าโดยไม่เหลือทิ้งเข้าระบบมากเกินไป</li>
      <li>พื้นที่หลังคาที่สำรวจมีทิศทางและมุมเอียงที่เหมาะสมสำหรับติดตั้งแผงจำนวน ${panelCountTxt} แผงตามแพ็กเกจนี้ โดยไม่มีเงาบดบังในช่วงเวลาที่มีแดดจัด</li>
      <li>พฤติกรรมการใช้ไฟฟ้าของบ้านนี้ (เช่น สัดส่วนการใช้ไฟกลางวัน/กลางคืนตามหมวดที่ 3) เหมาะกับระบบ ${sysType?`<span class="val">${sysType}</span>`:'[ ระบบโซลาร์รูฟ แบบไม่มี Battery / ระบบโซลาร์รูฟ พร้อม Battery ]'} ตามที่ประเมินไว้ ช่วยให้ระยะคืนทุนคุ้มค่าที่สุด</li>
      <li>ขนาดอินเวอร์เตอร์ที่เลือกรองรับการขยายระบบเพิ่มเติมในอนาคตได้ หากมีการใช้ไฟฟ้าเพิ่มขึ้น</li>
    </ul>`);

  // ── PAGE 9 §5 add-ons ───────────────────────────────────────────────
  // 4 แถวแรก = หมวดจากสภาพหน้างาน กรอกด้วยมือเหมือนเดิม
  // แถว "อื่นๆ" = package ที่ไม่ใช่ตัวหลัก + งานเพิ่ม ดึงชื่อ/จำนวน/ราคาจากใบเสนอราคาจริง
  // (เดิมเป็นช่องว่างให้เขียนมือ ของจริงเลยไปกองต่อท้ายตารางในหน้าใบเสนอราคาแทน)
  // ถ้าใบไหนไม่มีรายการเพิ่มเติม ก็คงช่องว่างไว้ให้เขียนมือเหมือนเดิม
  const ADD=["สายไฟ DC/AC ส่วนเกิน","โครงเหล็ก/ขาตั้งเสริมพิเศษ","ค่าติดตั้งนั่งร้าน","อัปเกรดขนาดเบรกเกอร์ / ตู้ไฟหลัก"];
  const ADD_REASON=["ระยะจากหลังคาถึงตำแหน่งติดตั้ง Inverter/ตู้ไฟไกลกว่ามาตรฐาน","โครงหลังคามีความลาดเอียง/สภาพพิเศษที่ต้องเสริมความแข็งแรง","ความสูงอาคาร/หลังคาเกินระดับที่เข้าถึงได้ปกติ","ตู้ไฟเดิม/เบรกเกอร์เดิมมีขนาดไม่รองรับกำลังไฟของระบบใหม่"];
  // คำที่ใช้จับรายการจริงเข้าหมวดที่มีอยู่แล้ว — ถ้าเข้าหมวดไหนได้ ให้ไปแทนที่แถวนั้น
  // (เช่น "งานเพิ่มตู้คอนซูมเมอร์ยูนิต" → หมวด "อัปเกรดขนาดเบรกเกอร์ / ตู้ไฟหลัก")
  // ที่เหลือจับหมวดไม่ได้ ค่อยไปต่อท้ายในตำแหน่ง "อื่นๆ"
  const ADD_MATCH=[
    ["สายไฟ","dc/ac","สายเมน","cable"],
    ["โครงเหล็ก","ขาตั้ง","โครงสร้างเสริม"],
    ["นั่งร้าน","scaffold"],
    ["เบรกเกอร์","breaker","ตู้ไฟ","คอนซูมเมอร์","consumer"],
  ];
  const addOnItems = Array.isArray(options.addOns) ? options.addOns.filter(x => x && String(x.name || "").trim()) : [];
  const usedAddOn = new Set();
  const matchedFor = ADD.map((_, i) => {
    const hit = addOnItems.find((x, xi) =>
      !usedAddOn.has(xi) && ADD_MATCH[i].some(k => String(x.name).toLowerCase().includes(k)));
    if (hit) usedAddOn.add(addOnItems.indexOf(hit));
    return hit || null;
  });
  const leftoverAddOns = addOnItems.filter((_, i) => !usedAddOn.has(i));
  const qtyCell = x => {
    const qty = Number(x.quantity);
    return Number.isFinite(qty) && qty > 0 ? `${qty}${x.unit ? ` ${x.unit}` : ""}` : bl();
  };
  // แถวที่มียอดจริง: ตัวเลขสีส้ม + คำว่า "บาท" สีเทาชิดขวาเหมือนแถวที่ยังว่าง
  // (ใช้โครงเดียวกับ bl("บาท") จะได้อยู่ตำแหน่งเดียวกันทุกแถว)
  const amtCell = x => (Number(x.amount) > 0
    ? `<span class="bl"><span class="amt-val">${baht(Number(x.amount))}</span> บาท</span>`
    : bl("บาท"));
  const fixedRows = ADD.map((n, i) => {
    const hit = matchedFor[i];
    return `<tr><td class="dev">${n}${hit ? `<span class="sub">${String(hit.name).trim()}</span>` : ""}</td>`
      + `<td>${hit ? qtyCell(hit) : bl()}</td><td>ไม่รวมในแพ็กเกจมาตรฐาน</td>`
      + `<td class="rz">${ADD_REASON[i]}</td><td class="org">${hit ? amtCell(hit) : bl("บาท")}</td></tr>`;
  }).join("");
  const otherRows = leftoverAddOns.length
    ? leftoverAddOns.map(x =>
        `<tr><td class="dev">${String(x.name).trim()}</td><td>${qtyCell(x)}</td><td>ไม่รวมในแพ็กเกจมาตรฐาน</td><td class="rz">${bl()}</td><td class="org">${amtCell(x)}</td></tr>`).join("")
    : `<tr><td class="dev">${ph("อื่นๆ ระบุ")}</td><td>${bl()}</td><td>ไม่รวมในแพ็กเกจมาตรฐาน</td><td class="rz">${ph("__")}</td><td class="org">${bl("บาท")}</td></tr>`;
  const addOnTotal = addOnItems.reduce((sum, x) => sum + (Number(x.amount) > 0 ? Number(x.amount) : 0), 0);
  // ใบเสนอราคาที่ไม่มีรายการเสริม: บอกลูกค้าตรง ๆ ว่าไม่มีค่าใช้จ่ายเพิ่ม แทนตารางช่องว่าง
  // ที่อ่านแล้วเหมือนยังกรอกไม่เสร็จ · รายงานสำรวจแบบแยกเล่ม (ไม่มีใบเสนอราคา) ยังใช้ตาราง
  // เพราะช่องว่างคือแบบฟอร์มให้ทีมสำรวจกรอกรายการที่เจอหน้างาน
  const noAddOns = Boolean(quotation.docNo) && addOnItems.length === 0;
  const p9 = noAddOns ? page(8, `${sect("5","รายการเพิ่มเติมนอกเหนือจากแพ็กเกจมาตรฐาน")}
    <p class="lead">จากการสำรวจหน้างานจริง ไม่พบรายการที่จำเป็นต้องเพิ่มเติมนอกเหนือจากแพ็กเกจมาตรฐาน (Standard Package)</p>
    <div class="callout green"><div class="co-h">ไม่มีค่าใช้จ่ายเพิ่มเติม</div><ul>
      <li>สภาพหน้างาน ณ วันสำรวจสามารถติดตั้งได้ด้วยอุปกรณ์และงานที่รวมอยู่ในแพ็กเกจมาตรฐานทั้งหมด</li>
      <li>ค่าใช้จ่ายเป็นไปตามใบเสนอราคา (Quotation) เลขที่ ${quotDocNo} ไม่มีค่าใช้จ่ายเพิ่มเติมจากการสำรวจหน้างาน</li>
      <li>หากสภาพหน้างานเปลี่ยนแปลงก่อนวันติดตั้ง บริษัทขอสงวนสิทธิ์แจ้งรายการเพิ่มเติมให้ลูกค้าทราบล่วงหน้าก่อนดำเนินการทุกครั้ง</li></ul></div>`)
  : page(8, `${sect("5","รายการเพิ่มเติมนอกเหนือจากแพ็กเกจมาตรฐาน")}
    <p class="lead">จากสภาพหน้างานจริง มีรายการที่จำเป็นต้องเพิ่มเติมนอกเหนือจากแพ็กเกจมาตรฐาน (Standard Package) ดังนี้ พร้อมเหตุผลประกอบและค่าใช้จ่ายที่เพิ่มขึ้น</p>
    <table class="addon"><thead><tr><th style="width:18%">รายการเพิ่มเติม</th><th style="width:9%">จำนวน</th><th style="width:16%">มาตรฐาน Package</th><th>เหตุผลที่ต้องเพิ่ม (จากหน้างานจริง)</th><th style="width:13%">ค่าใช้จ่ายเพิ่มเติม</th></tr></thead>
    <tbody>${fixedRows}
    ${otherRows}
    <tr class="addon-total"><td colspan="4">รวมค่าใช้จ่ายเพิ่มเติมทั้งหมด</td><td class="tot-org">${addOnTotal > 0 ? `${baht(addOnTotal)} บาท` : bl("บาท")}</td></tr></tbody></table>
    <div class="callout orange"><div class="co-h">ข้อเสนอเพิ่มเติม</div><ul><li>รายการเพิ่มเติมข้างต้นเป็นรายการที่จำเป็นตามสภาพหน้างานจริง ณ วันสำรวจ เพื่อให้ระบบทำงานได้อย่างปลอดภัยและมีประสิทธิภาพสูงสุด</li><li>ค่าใช้จ่ายนำมาจากใบเสนอราคา (Quotation) เลขที่ ${quotDocNo||L.pre_doc_no||"—"} หากตัวเลขไม่ตรงกัน ให้ยึดใบเสนอราคาเป็นหลัก</li></ul></div>`);

  // ── PAGE 10 §6 journey ──────────────────────────────────────────────
  // ขั้นที่ 2 ตามรูปแบบการชำระ — เงินสด/บัตรไม่มีขั้นขอสินเชื่อ
  const JOURNEY2 = payMode === "cash"
    ? ["2","ชำระส่วนที่เหลือ 80%","ด้วยเงินสด/โอนเงิน ก่อนวันติดตั้ง"]
    : payMode === "card"
      ? ["2","ผ่อนส่วนที่เหลือ 80%","ผ่านบัตรเครดิต 10 เดือน"]
      : ["2","ขอสินเชื่อ", payMode === "loan" ? "สำหรับส่วนที่เหลือ 80%" : "สำหรับส่วนที่เหลือ 80% (กรณีเลือกผ่อนชำระ)"];
  const JOURNEY2_TXT = payMode === "cash"
    ? "ขั้นตอนที่ 2 — ชำระส่วนที่เหลือ 80% ด้วยเงินสด/โอนเงิน ก่อนวันติดตั้งหรือตามงวดที่ตกลงกับบริษัท (ดูรายละเอียดในหมวดที่ 8)"
    : payMode === "card"
      ? "ขั้นตอนที่ 2 — ผ่อนชำระส่วนที่เหลือ 80% ผ่านบัตรเครดิต 10 เดือน (ดูรายละเอียดในหมวดที่ 8)"
    : payMode === "loan"
      ? "ขั้นตอนที่ 2 — ยื่นขอสินเชื่อสำหรับส่วนที่เหลือ 80% ตั้งแต่ต้นจนได้วงเงินจากธนาคาร (ดูรายละเอียดในหมวดที่ 8)"
      : "ขั้นตอนที่ 2 — ยื่นขอสินเชื่อสำหรับส่วนที่เหลือ 80% ตั้งแต่ต้นจนได้วงเงินจากธนาคาร หากลูกค้าเลือกผ่อนชำระผ่านธนาคาร (ดูรายละเอียดในหมวดที่ 8)";
  const JOURNEY=[["1","วางเงินมัดจำ 20%","เพื่อจองวันติดตั้ง"],JOURNEY2,["3","ติดตั้งระบบ","ทีมช่างเข้าดำเนินการติดตั้งตามวันที่นัดหมายหลังจากการมัดจำ"],["4","ขนานไฟ","ยื่นเรื่องขนานไฟกับการไฟฟ้าและเริ่มใช้งานระบบ"]];
  const p10 = page(9, `${sect("6","ขั้นตอนถัดไปสำหรับลูกค้า (Customer Journey)")}
    <p class="lead"><b>บริการ ONE STOP SERVICE ตั้งแต่ต้นจนจบขบวนการ</b> — หากลูกค้าสนใจดำเนินการต่อจากรายงานสำรวจฉบับนี้ มีขั้นตอนดังนี้</p>
    <div class="journey">${JOURNEY.map((s,i)=>`<div class="jstep"><div class="jnum">${s[0]}</div><div class="jt">${s[1]}</div><div class="js">${s[2]}</div></div>${i<3?'<div class="jarrow">›</div>':""}`).join("")}</div>
    <div class="callout green"><div class="co-h">สรุปขั้นตอน</div><ul>
      <li>ขั้นตอนที่ 1 — วางเงินมัดจำ 20% ของมูลค่าแพ็กเกจ เพื่อยืนยันและจองคิววันติดตั้ง</li>
      <li>${JOURNEY2_TXT}</li>
      <li>ขั้นตอนที่ 3 — ทีมช่างเข้าติดตั้งระบบตามวันที่นัดหมาย ใช้เวลาโดยประมาณ <span class="val">1-2 วันทำการ</span></li>
      <li>ขั้นตอนที่ 4 — บริษัทดำเนินการยื่นขนานไฟกับการไฟฟ้าให้ลูกค้า</li></ul></div>`);

  // ── PAGE 11-14 payment terms — เลือกส่วนที่แสดงตาม payMode ────────────
  const BANKS=[["ธนาคารกสิกรไทย (KBank)","ธนาคารกรุงศรีอยุธยา (Krungsri)"],["ธนาคารกรุงไทย (Krungthai)","ธนาคารทหารไทยธนชาต (ttb)"]];
  const p11 = page(10, `${sect("7","ทางเลือกการชำระเงินมัดจำ 20% (เพื่อจองวันติดตั้ง)")}
    <p class="lead">ลูกค้าสามารถเลือกชำระเงินมัดจำ 20% ของมูลค่าแพ็กเกจ เพื่อยืนยันและจองคิววันติดตั้งได้ 2 ช่องทาง ดังนี้</p>
    <h3 class="subh">ทางเลือกที่ 1 — ชำระเงินสด / โอนเงิน</h3>
    <ul class="reasons"><li>ชำระเต็มจำนวน 20% ของมูลค่าแพ็กเกจในครั้งเดียว ผ่านการโอนเงินเข้าบัญชีบริษัท / QR code</li><li>ไม่มีค่าธรรมเนียมเพิ่มเติม</li></ul>
    <h3 class="subh">ทางเลือกที่ 2 — ผ่อนชำระผ่านบัตรเครดิต 10 เดือน</h3>
    <p class="lead">ลูกค้าสามารถผ่อนชำระเงินดาวน์ 20% ผ่านบัตรเครดิต 0% ระยะเวลา 10 เดือน โดยไม่มีการเรียกเก็บค่าธรรมเนียมเพิ่มจากลูกค้า หากลูกค้าตัดสินใจซื้อและดำเนินการจนติดตั้งเสร็จสมบูรณ์ (บริษัทเป็นผู้รับภาระค่าธรรมเนียมบัตรเครดิตให้ทั้งหมด) บัตรเครดิตที่เข้าร่วมรายการมีดังนี้ (รายชื่อธนาคารเป็นตัวอย่าง โปรดตรวจสอบรายชื่อและอัตราดอกเบี้ย 0% ที่ร่วมรายการจริงกับทางบริษัท ณ วันทำรายการ)</p>
    <table class="banks"><thead><tr><th>ธนาคาร / ผู้ออกบัตร</th><th>ธนาคาร / ผู้ออกบัตร</th></tr></thead><tbody>${BANKS.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</tbody></table>
    <div class="callout orange"><div class="co-h">เงื่อนไขชำระเงินมัดจำ 20% ผ่านบัตรเครดิต 0% ระยะเวลา 10 เดือน</div><ul>
      <li>กรณีลูกค้าตัดสินใจซื้อและดำเนินการจนติดตั้งเสร็จสมบูรณ์ บริษัทเป็นผู้รับภาระค่าธรรมเนียมบัตรเครดิตทั้งหมด</li>
      ${noLoan ? "" : `<li>กรณีลูกค้ายื่นขอสินเชื่อสำหรับส่วนที่เหลือ 80% แล้ว ไม่ผ่านการอนุมัติ และไม่ประสงค์ดำเนินการต่อ
        <ul class="sub"><li>กรณีชำระเป็นเงินสด บริษัทจะคืนเงินดาวน์ 20% ให้เต็มจำนวน</li>
        <li>หากชำระเงินดาวน์ด้วยบัตรเครดิตแล้วไม่ผ่านการอนุมัติสินเชื่อ บริษัทจะหักค่าธรรมเนียมบัตรเครดิตที่เกิดขึ้นจริงออกจากเงินที่คืน</li></ul></li>`}
      <li>การคืนเงินทุกกรณีจะโอนเข้าบัญชีธนาคารของลูกค้าเท่านั้น ไม่มีการคืนเป็นเงินสด</li>
      <li>การจองวันติดตั้งจะมีผลสมบูรณ์เมื่อบริษัทได้รับเงินมัดจำและหลักฐานการชำระเรียบร้อยแล้วเท่านั้น</li></ul></div>`);

  const ccFeeTxt = ccFee != null ? `<span class="val">${num(ccFee, Number.isInteger(ccFee) ? 0 : 2)}</span>` : `<span class="wr"></span>`;
  const ccMonthlyTxt = ccMonthly != null ? `<span class="val">${baht(ccMonthly)}</span>` : `<span class="wr"></span>`;
  // หัวข้อทางเลือก: ไม่ระบุ (ครบ 3 ทาง) ใส่เลขลำดับ · เลือกแบบเดียวแล้วไม่ต้องมีเลข
  const optHead = (no, title) => `<h3 class="subh">${payMode === "all" ? `ทางเลือกที่ ${no} — ` : ""}${title}</h3>`;
  const OPT_CASH = `${optHead(1, "ชำระเงินสด")}
    <ul class="reasons"><li>ชำระเต็มจำนวนส่วนที่เหลือ 80% ก่อนวันติดตั้ง หรือตามรอบงวดที่ตกลงกับบริษัท</li><li>เป็นทางเลือกที่มีต้นทุนรวมต่ำที่สุด</li></ul>`;
  const OPT_CARD = `${optHead(2, "ผ่อนชำระผ่านบัตรเครดิต 10 เดือน")}
    <p class="lead">ใช้รายชื่อธนาคารบัตรเครดิตที่ร่วมรายการเดียวกันกับการชำระเงินดาวน์ในหมวดที่ 7 โดยมีเงื่อนไขค่าบริการเพิ่มเติมดังนี้</p>
    <table class="banks"><thead><tr><th style="width:30%">รายการ</th><th>รายละเอียด</th></tr></thead><tbody>
      <tr><td>ระยะเวลาผ่อนชำระ</td><td>10 เดือน</td></tr>
      <tr><td>ค่าธรรมเนียมบัตรเครดิต (Credit Card Fee)</td><td>${ccFeeTxt} % ของยอดชำระ (เรียกเก็บเพิ่มจากยอดที่ต้องผ่อน ขึ้นอยู่กับธนาคารที่ลูกค้าเลือก)</td></tr>
      <tr><td>ยอดผ่อนชำระต่อเดือนโดยประมาณ</td><td>${ccMonthlyTxt} บาท/เดือน (คำนวณจากยอด ${ccPctTxt}% + ค่าธรรมเนียม)</td></tr></tbody></table>`;
  const OPT_LOAN = `${optHead(3, "สินเชื่อธนาคารออมสิน (GSB Solar Soft Loan)")}
    <p class="lead">ลูกค้าสามารถยื่นขอสินเชื่อกับธนาคารออมสิน ภายใต้โครงการ Soft Loan GSB พลิกฟื้นธุรกิจไทย สำหรับติดตั้งระบบโซลาร์เซลล์ (ที่มา: ธนาคารออมสิน gsb.or.th/promotions/gsbsolar4life) โดยมีเงื่อนไขสำคัญโดยสรุปดังนี้</p>
    <table class="banks"><tbody>
      <tr><td style="width:30%">อัตราดอกเบี้ย</td><td>${GSB_RATE_TXT}</td></tr>
      <tr><td>เงินดาวน์ขั้นต่ำตามเงื่อนไขธนาคาร</td><td>20% ของวงเงินกู้</td></tr>
      <tr><td>วงเงินกู้</td><td>ให้กู้ตามความจำเป็นและความสามารถในการชำระหนี้ ไม่เกิน 10 เท่าของรายได้ และไม่เกิน 500,000 บาทต่อราย</td></tr>
      <tr><td>ระยะเวลาผ่อนชำระ</td><td>สูงสุดไม่เกิน 7 ปี (84 งวด)</td></tr>
      <tr><td>คุณสมบัติผู้กู้</td><td>อายุครบ 20 ปีบริบูรณ์ (อายุผู้กู้รวมระยะเวลาผ่อนไม่เกิน 60 ปี) · อายุงานปัจจุบันไม่ต่ำกว่า 1 ปี · เงินเดือนตั้งแต่ 18,000 บาทขึ้นไป</td></tr>
      <tr><td>เอกสารประกอบการยื่นกู้</td><td>บัตรประชาชน / ทะเบียนบ้าน / สลิปเงินเดือนหรือหนังสือรับรองรายได้ / สเตทเมนต์บัญชีย้อนหลัง 6 เดือน / ใบเสนอราคาและรายงานสำรวจฉบับนี้</td></tr>
      <tr><td>ระยะเวลาโครงการ</td><td>ยื่นกู้ได้ถึงวันที่ 31 มีนาคม 2570 หรือจนกว่าวงเงินโครงการจะเต็ม</td></tr>
      <tr><td>สิทธิประโยชน์เพิ่มเติม</td><td>สามารถใช้สิทธิลดหย่อนภาษีตามมาตรการภาครัฐได้ (เงื่อนไขเป็นไปตามที่กรมสรรพากรกำหนด)</td></tr></tbody></table>`;
  const LOAN_NOTES = `<div class="callout blue"><div class="co-h">ประเมินโอกาสอนุมัติเบื้องต้นก่อนยื่นกู้จริง</div><ul>
    <li>ลูกค้าสามารถติดต่อ Sale ผู้ดูแลเพื่อขอให้ช่วยประเมินเบื้องต้น (Pre-screen) ก่อนยื่นกู้จริงได้ฟรี</li>
    <li>หากคุณสมบัติยังไม่ผ่านเกณฑ์ Sale จะให้คำแนะนำแนวทางเพิ่มโอกาส เช่น การหาผู้กู้ร่วม หรือปรับลดวงเงินกู้</li>
    <li>การประเมินเบื้องต้นเป็นเพียงการคาดการณ์ ไม่ใช่การอนุมัติหรือรับประกันผลการพิจารณาของธนาคาร</li></ul></div>
    <div class="callout orange"><div class="co-h">หมายเหตุสำคัญ</div><ul>
    <li>อัตราดอกเบี้ยและเงื่อนไขข้างต้นอ้างอิงจากโครงการ Soft Loan GSB อาจเปลี่ยนแปลงตามประกาศธนาคารออมสิน</li>
    <li>การอนุมัติสินเชื่อขึ้นอยู่กับดุลยพินิจของธนาคารออมสินแต่เพียงผู้เดียว</li>
    <li>หากยื่นกู้ไม่ผ่าน ลูกค้าเปลี่ยนไปใช้ทางเลือกเงินสดหรือบัตรเครดิตแทนได้ และเงินดาวน์ 20% ได้รับคืนตามเงื่อนไข</li></ul></div>`;
  const P12_PAY = { loan: "ชำระผ่านสินเชื่อธนาคาร", cash: "ชำระเป็นเงินสด/โอนเงิน", card: "ผ่อนชำระผ่านบัตรเครดิต" }[payMode];
  const P12_LEAD = P12_PAY
    ? `สำหรับเงินส่วนที่เหลืออีก 80% ของมูลค่าแพ็กเกจ (หลังหักเงินมัดจำ) ลูกค้า${P12_PAY} มีรายละเอียดดังนี้`
    : "สำหรับเงินส่วนที่เหลืออีก 80% ของมูลค่าแพ็กเกจ (หลังหักเงินมัดจำ) ลูกค้าสามารถเลือกช่องทางการชำระได้ 3 รูปแบบ ดังนี้";
  const P12_HEAD = `${sect("8","ทางเลือกการชำระเงินส่วนที่เหลือ 80%")}
    <p class="lead">${P12_LEAD}</p>`;
  // ผ่อน: ทางเลือกสินเชื่อ + หมายเหตุสินเชื่อรวมหน้าเดียว · ไม่ระบุ: ครบ 3 ทางเลือก
  // หมายเหตุสินเชื่อขึ้นหน้าถัดไปเหมือนเดิม · เงินสด/บัตร: ใช้ pCash ด้านล่างแทน
  // (ทางเลือกที่เลือก + ตารางความคุ้มค่าในหน้าเดียว ต้องรอตัวเลข C)
  const p12 = noLoan ? "" : page(11, `${P12_HEAD}
    ${payMode === "loan" ? "" : OPT_CASH + OPT_CARD}
    ${OPT_LOAN}
    ${payMode === "loan" ? LOAN_NOTES : ""}`);

  const p13 = payMode === "all" ? page(12, LOAN_NOTES) : "";

  // GSB Solar Loan Calculator — computed from THIS lead's package price / kW /
  // monthly bill. Falls back to the sheet's example (112,000 · 3kW · 5,000)
  // only when the lead has no price. "price" = §4 net (what the customer pays).
  const ctRows = (rows) => `<table class="ct">${rows.map(r=>`<tr><td>${r[0]}</td><td class="${r[2]||''}">${r[1]}</td></tr>`).join("")}</table>`;
  // Use the contracted package price before booking/survey deposit. A deposit
  // is credited toward payment but must not make the system price/payback look lower.
  const loanPrice = quotation.contractAmount ?? gross ?? quotation.netAmount ?? PKG?.price ?? 112000;
  const loanKw = PKG?.kwp ?? 3;
  const financeInputs = options.financial?.inputs || {};
  // ค่าไฟของหน้านี้ต้องเป็นตัวเดียวกับที่ใบเสนอราคาใช้คำนวณยอดประหยัดและระยะคืนทุน
  // (financeOutputs ด้านล่าง) ไม่อย่างนั้นในหน้าเดียวกันจะมีค่าไฟสองชุด — เดิมอ่านจาก
  // ฟอร์มสำรวจตรง ๆ ซึ่งมีตัวเลขที่ไม่ใช่ค่าจริงปนอยู่ (999,999) ทำให้ "ค่าไฟรวมถ้าไม่ติด"
  // ขึ้นหลักสิบล้าน · ถ้าใบไม่มีค่า ใช้แบบสอบถามก่อนฟอร์มสำรวจ ตามกติกาเดียวกับใบเสนอราคา
  const loanBill = Number(financeInputs.current_monthly_bill) || Number(D.monthly_bill) || Number(L.survey_monthly_bill) || 5000;
  const financeOutputs = options.financial?.outputs || {};
  const downPct = Number(financeInputs.down_payment_percent ?? 20);
  const termMonths = Number(financeInputs.loan_term_months ?? 84);
  const electricityRate = Number(financeInputs.electricity_rate ?? 5);
  const C = calcLoan(loanPrice, loanKw, loanBill, { unit:electricityRate, schedule:loanSchedule, downPct:downPct/100, term:termMonths/12 });
  Object.assign(C, {
    down: financeOutputs.down_payment_amount ?? C.down,
    loan: financeOutputs.loan_amount ?? C.loan,
    pmt: financeOutputs.monthly_installment ?? C.pmt,
    total: financeOutputs.total_loan_payment ?? C.total,
    interest: financeOutputs.total_interest ?? C.interest,
    netMo: financeOutputs.net_monthly_after_saving ?? C.netMo,
    kwh: financeOutputs.monthly_production_kwh ?? C.kwh,
    save: financeOutputs.monthly_saving ?? C.save,
    payback: financeOutputs.payback_months ?? C.payback,
    save25: financeOutputs.saving_25_years ?? C.save25,
    co2Yr: financeOutputs.co2_reduction_tons_per_year ?? C.co2Yr,
    trees: financeOutputs.equivalent_trees ?? C.trees,
    // จุดคุ้มทุนแบบกู้นับดอกเบี้ย (สูตร v3) — snapshot ก่อน v3 ไม่มีค่านี้ ใช้ตัวเดิมให้เอกสารไม่เปลี่ยน
    paybackLoan: (options.financial ? financeOutputs.payback_months_with_loan ?? financeOutputs.payback_months : null) ?? C.paybackLoan,
    downBack: options.financial ? financeOutputs.down_recovered_months ?? null : C.downBack,
  });
  const paybackHasInterest = !options.financial || financeOutputs.payback_months_with_loan != null;
  // ยอดประหยัดรวมตลอดสัญญาต้องคิดจากยอดประหยัดต่อเดือนตัวเดียวกับที่แสดงในหน้านี้
  // calcLoan คิด save จากกำลังผลิตเต็ม (ไม่จำกัดด้วยค่าไฟจริง) แล้วคูณเป็น saveTot ไว้ก่อน
  // พอ save ถูกแทนด้วยค่าจากใบเสนอราคา (จำกัดไม่เกินค่าไฟ) saveTot จึงค้างเป็นค่าเดิม
  // เช่น ประหยัด 9,000/เดือน แต่ยอดรวม 84 เดือนขึ้น 1,008,000 (= 12,000 × 84)
  C.saveTot = C.save * C.n;
  const CALC_INDEP=[["มูลค่า Solar Package (บาท)",baht(C.price),"in"],["เงินดาวน์ (%)",num(downPct,1)+"%","in"],...C.tiers.map(t=>[`ดอกเบี้ย ${tierYears(t)} (% ต่อปี)`,`${num(t.rate,3)}%${t.note?` (${t.note})`:""}`,"in"]),["ระยะเวลากู้",termMonths+" เดือน","in"]];
  const CALC_CALC=[["เงินดาวน์ (บาท)",baht(C.down)],["วงเงินกู้ (บาท)",baht(C.loan)],...C.tiers.map(t=>[`ดอกเบี้ยรายเดือน ${tierYears(t)}`,num(t.rate/12,4)+"%"]),...C.tiers.map((t,i)=>[`จำนวนงวดช่วงที่ ${i+1}`,t.n+" งวด"]),["ดอกเบี้ยถัวเฉลี่ยถ่วงน้ำหนัก/ปี",num(C.wAvg*100,3)+"%"]];
  // ไม่แสดง "ดอกเบี้ยถัวเฉลี่ย EIR" (C.eir = ดอกเบี้ยรวม ÷ วงเงิน ÷ ปี เป็นอัตราแบบเงินต้นคงที่ ไม่ใช่ EIR จริง)
  // ซ้อนกับ "ดอกเบี้ยถัวเฉลี่ยถ่วงน้ำหนัก/ปี" แล้วตัวเลขต่างกันเกือบเท่าตัว — ผู้ใช้สั่งตัด 14 ต.ค.
  const CALC_RESULT=[["ค่างวดผ่อน (บาท/เดือน) — เท่ากันทุกงวด",baht(C.pmt),"big"],["ยอดจ่ายรวมตลอดสัญญา (บาท)",baht(C.total)],["ดอกเบี้ยรวมตลอดสัญญา (บาท)",baht(C.interest)]];
  const CALC_COMPARE=[["ค่าไฟปัจจุบัน (บาท/เดือน)",baht(C.bill),"in"],["ขนาด Solar ที่ติด (kW)",num(C.kw,1),"in"],["ค่าไฟต่อหน่วย (บาท/kWh)",num(C.unit,2)],["หน่วยไฟที่ผลิตได้/เดือน (kWh)",num(C.kwh,1)],["ประหยัดได้หลังติด Solar (บาท/เดือน)",baht(C.save)]];
  const CALC_ANALYSIS=[["ค่างวดผ่อน (บาท/เดือน)",baht(C.pmt)],["ดอกเบี้ยต่อเดือน (เดือนแรก)",baht(C.mo1Int)],["เงินต้นที่ตัดต่อเดือน (เดือนแรก)",baht(C.mo1Prin)],["ต้นทุนสุทธิ/เดือน (ค่างวด − ประหยัด)",baht(C.netMo),C.netMo<0?"neg":""],["ยอดรวมที่จ่ายตลอดสัญญา (บาท)",baht(C.total)],["ดอกเบี้ยรวม (บาท)",baht(C.interest)],["ค่าไฟรวมถ้าไม่ติด Solar (บาท)",baht(C.billTot)],["ประหยัดค่าไฟรวมตลอดสัญญาเงินกู้ (บาท)",baht(C.saveTot)],["ลดการปล่อย CO₂ ต่อปี (ตัน)",num(C.co2Yr,2)],["ลดการปล่อย CO₂ เทียบเท่าปลูกต้นไม้ (ต้น)",baht(C.trees)],[paybackHasInterest?"จุดคุ้มทุน รวมดอกเบี้ย (เดือน)":"จุดคุ้มทุน (เดือน)",C.paybackLoan?num(C.paybackLoan,0):"—"],...(C.downBack?[["ได้เงินดาวน์คืนภายใน (เดือน)",num(C.downBack,0)]]:[]),["ถ้าติด 25 ปี ประหยัดค่าไฟได้ (บาท)",baht(C.save25)]];
  // ── กล่องสรุปใต้ตาราง (แผน 20261014-01 · แบบ A) — 3 ตัวเลขหลัก + บรรทัดล่าง ──────────
  // แสดงเฉพาะใบที่เลือกรูปแบบการชำระ · ใบเก่าที่แสดงทุกทางเลือก (all) หน้าตาเหมือนเดิม
  const ym = n => { const y = Math.floor(n / 12), m = n % 12; return y ? `${y} ปี${m ? ` ${m} เดือน` : ""}` : `${m} เดือน`; };
  const approx = n => n >= 1e6 ? `${num(n / 1e6, 2)} ล้านบาท` : n >= 1e5 ? `${num(n / 1e5, 1)} แสนบาท` : `${baht(Math.round(n))} บาท`;
  const sumBox = (tiles, foot) => `<div class="sum"><div class="sum-row">${tiles.map(([k, v, u, go]) =>
    `<div class="sum-cell"><div class="sum-k">${k}</div><div class="sum-v${go ? " go" : ""}">${v}${u ? ` <span class="sum-u">${u}</span>` : ""}</div></div>`).join("")}</div>${foot ? `<div class="sum-foot">${foot}</div>` : ""}</div>`;
  // เงินประหยัดนับไม่เกินค่าไฟ (สูตรเพดานค่าไฟ) — ไฟส่วนที่ผลิตเกินบอกลูกค้าว่าใช้ไฟเพิ่มจะคุ้มขึ้น
  const overMonthly = Math.round(Number(C.kwh) * Number(C.unit) - Number(C.bill));
  const overLine = Number(C.bill) > 0 && overMonthly > 0
    ? `<div class="sum-extra">ระบบผลิตไฟได้มากกว่าที่บ้านใช้ราว ${baht(overMonthly)} บาท/เดือน — ถ้าใช้ไฟเพิ่ม (เช่น รถ EV, แอร์) จะคืนทุนเร็วขึ้น</div>`
    : "";
  const loanSave = Math.round(Number(C.save) || 0), loanPmt = Math.round(Number(C.pmt) || 0);
  // ไม่มีราคา/ค่าไฟ (ข้อมูลไม่ครบ) ไม่ต้องแสดงกล่อง — กันเอกสารลูกค้าขึ้น "0 บาท"
  const loanSummary = payMode !== "loan" || loanSave <= 0 ? "" : sumBox([
    ["ผ่อนธนาคาร", baht(loanPmt), "บาท/เดือน"],
    ["ประหยัดค่าไฟ", baht(loanSave), "บาท/เดือน", true],
    C.downBack
      ? ["ได้เงินดาวน์คืนใน", ym(C.downBack), `(${num(C.downBack, 0)} เดือน)`]
      : ["คืนทุนใน", C.paybackLoan ? ym(C.paybackLoan) : "—", C.paybackLoan ? `(${num(C.paybackLoan, 0)} เดือน รวมดอกเบี้ย)` : ""],
  ], loanSave > loanPmt
    ? `ค่าผ่อนน้อยกว่าค่าไฟที่ประหยัด — เหลือเงินเดือนละ ${baht(loanSave - loanPmt)} บาทตั้งแต่เดือนแรก`
    : `ช่วงผ่อน ${termMonths} เดือน จ่ายเพิ่มจากค่าไฟเดิมเดือนละ ${baht(loanPmt - loanSave)} บาท · ผ่อนครบแล้วประหยัดเต็ม ${baht(loanSave)} บาท/เดือน`) + overLine;

  const loanBank = String(financeInputs.loan_bank || "ธนาคารออมสิน");
  const rateSource = String(financeInputs.rate_source || "ธนาคารออมสิน GSB");
  const p14 = noLoan ? "" : page(13, `<h3 class="subh">ตัวอย่างตารางผ่อนชำระสินเชื่อ (Amortization Schedule) — ตัวอย่างประกอบการพิจารณา สำหรับการยื่นกู้กับ ${loanBank}</h3>
    <div class="calc">
      <div class="calc-head">Solar Loan Calculator — ${loanBank} (ค่างวดเท่ากันทุกเดือน)</div>
      <div class="calc-sub">สินเชื่อพลังงานสะอาด | Source: ${rateSource}</div>
      <div class="calc-cols">
        <div class="calc-col">
          <div class="csec">ตัวแปรอิสระ — ปรับได้ตามต้องการ</div>${ctRows(CALC_INDEP)}
          <div class="csec">ตัวเลขที่คำนวณได้</div>${ctRows(CALC_CALC)}
          <div class="csec">ผลลัพธ์ — ค่างวดผ่อนชำระ (เท่ากันทุกเดือน)</div>${ctRows(CALC_RESULT)}
        </div>
        <div class="calc-col">
          <div class="csec">เปรียบเทียบกับค่าไฟ — ปรับได้</div>${ctRows(CALC_COMPARE)}
          <div class="csec">ผลการวิเคราะห์</div>${ctRows(CALC_ANALYSIS)}
          <div class="calc-green">▸ ถ้าค่างวด &lt; ที่ประหยัดได้ ลูกค้า “ได้กำไร” ทุกเดือน ตั้งแต่วันแรกที่ติด Solar<br/><br/>ดอกเบี้ยรวม + ค่างวด &lt; ค่าไฟที่จ่ายไปถ้าไม่ติด — คุ้มมาก</div>
        </div>
      </div>
    </div>
    ${loanSummary}
    <p class="tiny-note">หมายเหตุ: ตารางนี้เป็นตัวอย่างการคำนวณเพื่อประกอบการตัดสินใจเท่านั้น ตัวเลขจริงให้ยึดตามตารางผ่อนชำระที่ ${loanBank} ออกให้หลังการอนุมัติสินเชื่อ</p>`);

  // ── §8 แบบเงินสด / ผ่อนบัตร: ทางเลือกที่เลือก + ตารางความคุ้มค่าในหน้าเดียว ──────────
  // (แทน p12 + หน้าสินเชื่อ) ตารางยกจากฝั่งขวาของ solar_loan_calculator (BTC)
  // ตัวเลขชุดเดียวกับหน้าสินเชื่อ (C) · จุดคุ้มทุน: เงินสด = ราคา ÷ ประหยัดต่อเดือน (ตัวเดียวกับ §4)
  // · ผ่อนบัตร = (ราคา + ค่าธรรมเนียมบัตร) ÷ ประหยัดต่อเดือน
  const isCard = payMode === "card";
  const cashPayback = C.payback ? Math.ceil(C.payback) : null;
  const cardPaybackCalc = isCard ? cardPayback(C.price, C.save) : null;
  const shownPayback = cardPaybackCalc ?? cashPayback;
  const wr = `<span class="wr"></span>`;
  const CASH_SYSTEM=[["มูลค่า Solar Package (บาท)",baht(C.price),"in"],["ขนาด Solar ที่ติด (kW)",num(C.kw,1),"in"],["หน่วยไฟที่ผลิตได้/เดือน (kWh)",num(C.kwh,1)],["ค่าไฟต่อหน่วย (บาท/kWh)",num(C.unit,2)],["ค่าไฟปัจจุบัน (บาท/เดือน)",baht(C.bill),"in"],["ประหยัดได้หลังติด Solar (บาท/เดือน)",baht(C.save)]];
  const CASH_CARD=[[`ยอดส่วนที่เหลือ ${ccPctTxt}% (บาท)`,ccRest!=null?baht(ccRest):wr],["ค่าธรรมเนียมบัตรเครดิต (%)",ccFee!=null?`${num(ccFee,Number.isInteger(ccFee)?0:2)}%`:`${wr} %`],["ค่าธรรมเนียมบัตรเครดิต (บาท)",ccFeeAmt!=null?baht(ccFeeAmt):wr],["ยอดผ่อนต่อเดือนโดยประมาณ (บาท/เดือน)",ccMonthly!=null?baht(ccMonthly):wr]];
  const CASH_RESULT=[[cardPaybackCalc?"จุดคุ้มทุน รวมค่าธรรมเนียมบัตร (เดือน)":"จุดคุ้มทุน (เดือน)",shownPayback?`${num(shownPayback,0)} (${num(shownPayback/12,1)} ปี)`:"—"],["ค่าไฟรวม 25 ปี ถ้าไม่ติด Solar (บาท)",baht(C.bill*300)],["ถ้าติด 25 ปี ประหยัดค่าไฟได้ (บาท)",baht(Math.round(C.save25))],["ลดการปล่อย CO₂ ต่อปี (ตัน)",num(C.co2Yr,2)],["ลดการปล่อย CO₂ เทียบเท่าปลูกต้นไม้ (ต้น)",baht(C.trees)]];
  // กล่องสรุป: ผ่อนบัตรที่ไม่ได้กรอก % ไม่มียอดผ่อนต่อเดือน → ช่องแรกแสดงราคาระบบแทน
  const cardFeeCost = isCard && ccFeeAmt ? ccFeeAmt : 0;
  const cashLeft25 = Number(C.save25) - Number(C.price) - cardFeeCost;
  const cashSummary = !noLoan || !(Number(C.save) > 0) || !(Number(C.price) > 0) ? "" : sumBox([
    isCard && ccMonthly != null
      ? ["ผ่อนบัตร 10 เดือน", baht(ccMonthly), "บาท/เดือน"]
      : [isCard ? "ราคาระบบ" : "จ่ายครั้งเดียว", baht(C.price), "บาท"],
    ["ประหยัดค่าไฟ", baht(Math.round(Number(C.save) || 0)), "บาท/เดือน", true],
    ["คืนทุนใน", shownPayback ? ym(shownPayback) : "—", shownPayback ? `(${num(shownPayback, 0)} เดือน${cardPaybackCalc ? " รวมค่าธรรมเนียม" : ""})` : ""],
  ], `ใช้ครบ 25 ปี ประหยัดได้ราว ${approx(Number(C.save25))}${cashLeft25 > 0 ? ` · หักค่าระบบ${cardFeeCost ? "และค่าธรรมเนียม" : ""}แล้วเหลือราว ${approx(cashLeft25)}` : ""}`) + overLine;
  const pCash = !noLoan ? "" : page(11, `${P12_HEAD}
    ${isCard ? OPT_CARD : OPT_CASH}
    <h3 class="subh">ตัวอย่างการคำนวณความคุ้มค่า — ${isCard ? "ผ่อนบัตรเครดิต" : "ชำระเงินสด"}</h3>
    <div class="calc">
      <div class="calc-head">Solar Calculator — ${isCard ? "ผ่อนบัตรเครดิต 10 เดือน" : "ชำระเงินสด"}</div>
      <div class="calc-sub">คำนวณจากแพ็กเกจและค่าไฟของลูกค้ารายนี้</div>
      <div class="calc-cols">
        <div class="calc-col">
          <div class="csec">ข้อมูลระบบและค่าไฟ</div>${ctRows(CASH_SYSTEM)}
          ${isCard ? `<div class="csec">ผ่อนบัตรเครดิต 10 เดือน (ส่วนที่เหลือ ${ccPctTxt}%)</div>${ctRows(CASH_CARD)}` : ""}
        </div>
        <div class="calc-col">
          <div class="csec">ผลการวิเคราะห์</div>${ctRows(CASH_RESULT)}
          <div class="calc-green">${isCard
            ? "▸ ผ่อนบัตรเครดิต 10 เดือน — ไม่ต้องจ่ายส่วนที่เหลือก้อนเดียว"
            : "▸ ชำระเงินสด ไม่มีดอกเบี้ย — เป็นทางเลือกที่มีต้นทุนรวมต่ำที่สุด"}<br/><br/>หลังถึงจุดคุ้มทุน ค่าไฟที่ประหยัดได้ทุกเดือนคือเงินที่ลูกค้าได้คืน</div>
        </div>
      </div>
    </div>
    ${cashSummary}
    <p class="tiny-note">หมายเหตุ: ตารางนี้เป็นตัวอย่างการคำนวณเพื่อประกอบการตัดสินใจเท่านั้น${isCard ? " ค่าธรรมเนียมบัตรเครดิตจริงขึ้นอยู่กับธนาคารผู้ออกบัตร ณ วันทำรายการ" : ""}</p>`);

  const p15 = page(14, `${sect("9","หมายเหตุและเงื่อนไขทั่วไป")}
    <ul class="reasons">
      <li>รายงานฉบับนี้จัดทำขึ้นจากผลการสำรวจหน้างานจริง ณ วันที่ระบุในหมวดที่ 1 เท่านั้น หากสภาพหน้างานเปลี่ยนแปลงก่อนวันติดตั้ง บริษัทขอสงวนสิทธิ์ในการปรับปรุงรายละเอียดและ/หรือราคาตามความเหมาะสม</li>
      <li>ราคาที่เสนอในใบเสนอราคาที่แนบคู่กับรายงานฉบับนี้มีผลตามระยะเวลาที่ระบุไว้ในใบเสนอราคา</li>
      <li>แพ็กเกจ อุปกรณ์ และยี่ห้อที่นำเสนออาจมีการเปลี่ยนแปลงเป็นรุ่น/ยี่ห้อที่มีคุณสมบัติเทียบเท่าหรือดีกว่า โดยจะแจ้งล่วงหน้า</li>
      <li>การอนุมัติสินเชื่อทุกประเภทเป็นดุลยพินิจของสถาบันการเงินผู้ให้กู้แต่เพียงผู้เดียว</li>
      <li>ระยะเวลาดำเนินการในแต่ละขั้นตอนของ Customer Journey เป็นระยะเวลาโดยประมาณ อาจเปลี่ยนแปลงตามคิวงานและปัจจัยภายนอก</li></ul>
    <h3 class="subh">การรับทราบข้อมูล (จัดส่งรายงานทางอีเมล)</h3>
    <p class="lead">เนื่องจากบริษัทจัดส่งรายงานฉบับนี้ให้ลูกค้าทางอีเมล ลูกค้าจึงไม่มีการลงนามในเอกสารฉบับนี้โดยตรง หากลูกค้าตรวจสอบข้อมูลแล้วมีข้อสงสัยหรือต้องการแก้ไข กรุณาแจ้งกลับมายังบริษัทภายในระยะเวลาที่กำหนดในใบเสนอราคา</p>
    <div class="callout blue"><div class="co-h">การยืนยันความประสงค์ดำเนินการต่อ</div><ul>
      <li>หากลูกค้าไม่ทักท้วงภายในระยะเวลาที่กำหนด ให้ถือว่ารับทราบและยอมรับข้อมูลผลการสำรวจ ข้อสมมติฐานการใช้ไฟฟ้า แพ็กเกจที่นำเสนอ และเงื่อนไขการชำระเงินตามที่ระบุไว้</li>
      <li>ลูกค้ายืนยันความประสงค์ดำเนินการต่อได้โดยตอบกลับอีเมล ทักแชท LINE @senasolarenergy หรือติดต่อ Sale ผู้ดูแล</li>
      <li>การชำระเงินดาวน์ตามหมวดที่ 7 ถือเป็นการยืนยันความประสงค์ดำเนินการต่อโดยสมบูรณ์</li></ul></div>
    <div class="banner-dk"><div class="bd-h">มีคำถามเพิ่มเติมเกี่ยวกับรายงานฉบับนี้?</div><div class="bd-l">ติดต่อทีมงาน SENA SOLAR ENERGY โทร. 099-115-1888 หรือ (02) 541-4642 (20 สาย)  อีเมล sales@senasolarenergy.com  LINE: @senasolarenergy</div></div>`);

  // page 16 = appendix divider. If we have the real quotation file, say so and
  // the actual pages get appended right after; otherwise fall back to empty boxes.
  const p16 = page(15, `${sect("","ภาคผนวก ก: ใบเสนอราคา (Quotation)")}
    <p class="lead">แนบใบเสนอราคา (Quotation) เลขที่ ${quotDocNo||"—"} ฉบับล่าสุดที่ออกให้ลูกค้าไว้ในภาคผนวกนี้ ตัวเลขราคาในรายงานฉบับนี้นำมาจากเอกสารฉบับนี้โดยตรง หากมีการแก้ไขราคาในภายหลัง ให้ยึดใบเสนอราคาฉบับล่าสุดเป็นหลัก</p>
    ${quotPdfPath ? `
    <div class="qt-divider">
      <div class="qt-i">📄</div>
      <div class="qt-t">ใบเสนอราคาเลขที่ ${quotDocNo}</div>
      <div class="qt-s">มูลค่า ${baht(quotation.netAmount ?? acceptedQuot?.amount ?? L.order_total ?? 0)} บาท (รวม VAT) — เอกสารฉบับเต็มแนบต่อจากหน้านี้</div>
    </div>` : `
    ${emptyBox(`แนบไฟล์ใบเสนอราคา (Quotation) เลขที่ ${quotDocNo||""} — หน้า 1`,"วาง/แทรกไฟล์ PDF หรือรูปภาพใบเสนอราคาฉบับล่าสุด",150)}
    ${emptyBox("หน้า 2 ของใบเสนอราคา (หากมี)","รายละเอียดรายการอุปกรณ์ / เงื่อนไขการชำระเงิน / อายุใบเสนอราคา",150)}`}
    <div class="callout blue"><div class="co-h">หมายเหตุ</div><ul><li>เลขที่ใบเสนอราคาที่แนบต้องตรงกับเลขที่เอกสาร (${quotDocNo||"—"}) ที่ระบุไว้ในหน้าปกของรายงานฉบับนี้</li><li>ใบเสนอราคามีอายุตามระยะเวลาที่ระบุในเอกสาร หากเกินกำหนด กรุณาติดต่อบริษัทเพื่อขอใบเสนอราคาฉบับใหม่</li></ul></div>`);
  // ประกอบเล่ม: หน้าที่ไม่ใช้ในรูปแบบการชำระนี้เป็น "" ถูกข้าม แล้วแทนโทเคนเลขหน้า
  // (ท้ายกระดาษ + สารบัญ) ด้วยลำดับจริง — "ช่อง" ของแต่ละหน้าอ่านจาก data-pg
  const pageList = [p1,p2,p3,p4,p5,p6,p8,p9,p10,p11,p12,p13,p14,pCash,p15,p16].filter(Boolean);
  const pageNo = Object.fromEntries(pageList.map((h, i) => [h.match(/data-pg="(\w+)"/)[1], i + 1]));
  const pagesHtml = pageList.join("")
    .replace(/@@PG:(\w+)@@/g, (_, slot) => String(pageNo[slot] ?? ""))
    .replace(/@@PGTOTAL@@/g, String(pageList.length));

  const html = `<!DOCTYPE html><html lang="th"><head><meta charset="utf-8"/><style>
  ${font("li",300)}${font("rg",400)}${font("md",500)}${font("bd",700)}
  /* ระบุขนาดกระดาษเป็นมิลลิเมตรตรง ๆ ให้เท่ากับ .page เป๊ะ — ใบเสนอราคาที่ถูก merge
     ต่อท้ายก็ใช้ค่าเดียวกัน เล่มเดียวจึงมีกระดาษขนาดเดียวทุกหน้า (A4 210x297mm) */
  @page{size:210mm 297mm;margin:0;}
  *{margin:0;padding:0;box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
  html,body{font-family:'DB Heavent',sans-serif;color:${INK};font-size:16px;line-height:1.5;}
  .page{position:relative;width:210mm;height:297mm;padding:16mm 15mm 14mm;page-break-after:always;overflow:hidden;}
  .page:last-child{page-break-after:auto;}
  .report-watermark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(-25deg);font-size:72px;font-weight:700;color:rgba(222,51,74,.13);pointer-events:none;z-index:4;}
  .run-head{position:absolute;top:7mm;left:15mm;right:15mm;font-size:10px;color:${GRAY};text-align:right;border-bottom:1px solid #e2e5ea;padding-bottom:3px;}
  .run-foot{position:absolute;bottom:7mm;left:0;right:0;text-align:center;font-size:10px;color:#aab;}
  .body{height:100%;}
  h2.sect{font-size:21px;font-weight:700;color:${NAVY};border-bottom:2px solid ${ORANGE};padding-bottom:5px;margin-bottom:14px;}
  h2.sect .en{font-size:15px;color:${GRAY};font-weight:400;}
  h3.subh{font-size:17px;font-weight:700;color:${NAVY};margin:14px 0 7px;}
  p.lead{font-size:15px;color:#374151;margin-bottom:10px;line-height:1.55;}
  p.hint{font-size:13.5px;color:#4b5563;margin-bottom:8px;background:#f4f6f9;padding:6px 10px;border-radius:2px;}
  .cover-page{text-align:center;}.cover{padding-top:4mm;}
  /* wordmark logo is 3.15:1 — size by HEIGHT, width auto, centered */
  .cov-logo{height:50px;width:auto;margin:8mm auto 6mm;display:block;}
  .cover h1{font-size:25px;font-weight:700;color:${NAVY};line-height:1.25;margin-bottom:6px;white-space:nowrap;}
  .cov-en{font-size:17px;color:${GRAY};font-style:italic;}
  .cov-brand{font-size:15px;font-weight:700;color:${ORANGE};letter-spacing:.5px;margin-bottom:14px;}
  .cov-tag{margin:2px 0 14px;}
  .ct-brand{font-size:15px;font-weight:700;color:${NAVY};letter-spacing:.5px;}
  .ct-en{font-size:13px;font-style:italic;color:${GRAY};}
  .ct-th{font-size:15px;font-weight:700;color:${ORANGE};margin-top:2px;}
  .ct-sub{font-size:13px;color:#4b5563;margin-top:2px;}
  .src{font-size:12px;color:${ORANGE};font-style:italic;margin:-8px 0 8px;}
  .note-red{color:#c0392b;font-size:12px;}
  .co-block{text-align:left;border-top:2px solid ${NAVY};margin-top:16px;padding-top:9px;}
  .co-name{font-size:16px;font-weight:700;color:${NAVY};margin-bottom:3px;}
  .co-line{font-size:13.5px;color:#4b5563;line-height:1.55;}
  .cov-note{background:${NAVY_DK};color:#dfe6f0;font-size:13.5px;text-align:left;padding:11px 14px;margin-top:16px;line-height:1.55;}
  table.kv{width:100%;border-collapse:collapse;margin:4px 0 8px;text-align:left;}
  table.kv td{border:1px solid #c8cfda;padding:7px 10px;vertical-align:middle;font-size:14.5px;}
  table.kv td.k{background:#f4f6f9;font-weight:700;color:${NAVY};width:36%;}
  .ip{color:#9aa3b0;}.ipx{color:#9aa3b0;}.val{color:${INK};font-weight:500;}
  .muted{color:#b6bcc6;}.unk{color:${GRAY};}
  .toc-row{display:flex;align-items:baseline;font-size:15.5px;padding:7px 0;color:#374151;}
  .toc-t{white-space:nowrap;}.toc-n{white-space:nowrap;font-weight:700;color:${NAVY};}
  .toc-dot{flex:1;border-bottom:1px dotted #b6bdc9;margin:0 6px;transform:translateY(-3px);}
  .ph{border:1.5px dashed #c3c8d0;background:#f6f7f9;border-radius:3px;margin:9px 0;display:flex;align-items:center;justify-content:center;text-align:center;}
  .ph-in{padding:12px;}.ph-t{font-size:15px;font-weight:700;color:#7a828e;}.ph-s{font-size:12.5px;color:#9aa1ab;font-style:italic;margin-top:3px;}
  /* hand-draw sketch area — big empty framed box, note pinned to top-left */
  .sketch{border:1.5px dashed #b9c0ca;border-radius:3px;background:repeating-linear-gradient(0deg,#fbfcfd,#fbfcfd 23px,#eef1f5 24px);height:205mm;position:relative;margin-top:4px;}
  .sketch.has-image{background:#fff;padding:7mm;display:flex;align-items:center;justify-content:center;}
  .sketch-img{display:block;width:100%;height:100%;object-fit:contain;}
  .sk-note{position:absolute;top:8px;left:12px;right:12px;font-size:12.5px;color:#98a0ab;font-style:italic;}
  .pgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
  .pimg{position:relative;border:1px solid #d5d9e0;border-radius:3px;overflow:hidden;background:#eef0f3;}
  .pimg img{width:100%;height:170px;object-fit:cover;display:block;}
  .pcap{position:absolute;bottom:0;left:0;right:0;background:rgba(30,48,80,.82);color:#fff;font-size:12.5px;font-weight:500;padding:5px 8px;}
  .callout{border-radius:3px;padding:11px 15px;margin:12px 0;font-size:14px;line-height:1.55;}
  .callout .co-h{font-weight:700;margin-bottom:5px;font-size:15px;}.callout ul{margin-left:16px;}.callout li{margin:3px 0;}.callout ul.sub{margin:2px 0 2px 16px;list-style:circle;}.callout ul.sub li{margin:1px 0;color:#5a4a30;}
  .callout.blue{background:#eef2f8;border-left:4px solid ${NAVY};color:#2f3b4d;}.callout.blue .co-h{color:${NAVY};}
  .callout.orange{background:#fdf4e6;border-left:4px solid ${ORANGE};color:#4a3a22;}.callout.orange .co-h{color:#b26f16;}
  .callout.green{background:#eef6ef;border-left:4px solid #4a915a;color:#2e4633;}.callout.green .co-h{color:#2f6b3d;}
  ul.reasons{margin-left:17px;font-size:14.5px;color:#374151;line-height:1.55;}ul.reasons li{margin:5px 0;}
  table.load{width:100%;border-collapse:collapse;font-size:12px;margin:6px 0 12px;}
  table.load th{background:${NAVY};color:#fff;font-weight:500;padding:6px 4px;text-align:center;border:1px solid ${NAVY};line-height:1.25;vertical-align:middle;}
  table.load td{border:1px solid #cfd5de;padding:6px 5px;text-align:center;vertical-align:middle;}
  table.load.compact th{padding:4px 4px;}
  table.load.compact td{padding:2.5px 5px;}
  table.load td.dev{text-align:left;font-weight:500;color:#2f3b4d;}
  /* blank fill-in cell: unit right-aligned, muted; empty space to write on */
  .bl{display:block;text-align:right;color:#aeb4bd;font-weight:400;padding-right:2px;}
  .nw{white-space:nowrap;}
  table.addon td.org .bl .amt-val{color:${ORANGE};font-weight:700;}
  .wr{display:inline-block;min-width:32px;border-bottom:1px solid #cbd2dc;margin:0 3px;vertical-align:baseline;}
  .wr-lg{min-width:56px;}
  tr.load-total .bl{color:#e8eef6;}
  /* questionnaire summary mini-table above the load table */
  table.kv.qsum{margin:2px 0 8px;}
  p.load-note{font-size:12px;color:#4b5563;margin:-6px 0 0;line-height:1.45;}
  p.load-note b{color:${INK};}
  p.load-note.sub{font-size:11px;color:#6b7280;}
  table.kv.lsum{margin:6px 0 8px;}
  table.kv.lsum td.k{width:19%;}
  table.kv.lsum td.v b{color:${INK};font-weight:700;}
  table.kv.lsum td.lsum-h{width:11%;background:${NAVY};color:#fff;font-weight:700;text-align:center;line-height:1.3;}
  table.kv.lsum tr.hi td.k,table.kv.lsum tr.hi td.v{background:#eef2f8;}
  table.kv.lsum b.big{font-size:17px;color:${NAVY};}
  table.kv.lsum tr.chk td{font-size:12px;color:#4b5563;padding-top:3px;padding-bottom:3px;}
  table.kv.lsum tr.chk td.k{background:#f8f9fb;color:#4b5563;font-weight:500;}
  table.kv.lsum tr.chk td.v b{color:#374151;}
  table.kv.lsum tr.chk td.lsum-h{background:#e5e8ee;color:#4b5563;font-size:12px;}
  .nbar{margin:5px 0 0;}
  .nbar-track{position:relative;height:9px;border-radius:5px;background:${ORANGE};}
  .nbar-night{position:absolute;left:0;top:0;bottom:0;background:${NAVY};border-radius:5px 0 0 5px;}
  .nbar-band{position:absolute;top:-3px;bottom:-3px;border:1.5px solid ${INK};border-radius:3px;background:rgba(255,255,255,.3);}
  .nbar-lbl{position:relative;height:16px;font-size:11px;line-height:16px;color:#4b5563;margin-top:2px;}
  .nbar-lbl span{position:absolute;white-space:nowrap;}
  .nbar-lbl .l{left:0;color:${NAVY};font-weight:700;}.nbar-lbl .r{right:0;color:#b26f16;font-weight:700;}
  .nbar-lbl .m{transform:translateX(-50%);}
  .lsum-warn{font-size:11px;color:#b26f16;margin-top:1px;}
  table.kv.qsum td{padding:4px 9px;font-size:13px;}
  table.kv.qsum td.k{width:20%;}
  .callout.tight{padding:9px 14px;margin:9px 0 0;}
  .callout.tight li{margin:2px 0;}
  tr.load-total td{background:${NAVY};color:#fff;font-weight:700;text-align:right;padding:7px 8px;}
  td.tot-org{background:${ORANGE}!important;color:#fff!important;text-align:center!important;}
  td.tot-navy{background:${NAVY_DK}!important;color:#fff!important;text-align:center!important;}
  tr.load-total .ipx{color:#efe3d0;}
  table.addon{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0 12px;}
  table.addon th{background:${NAVY};color:#fff;font-weight:500;padding:7px 6px;text-align:left;border:1px solid ${NAVY};}
  table.addon td{border:1px solid #cfd5de;padding:7px 6px;vertical-align:top;}
  table.addon td.dev{font-weight:700;color:${NAVY};}table.addon td.rz{font-size:12px;color:#4b5563;}
  table.addon td.dev .sub{display:block;margin-top:2px;font-weight:400;font-size:11.5px;color:#4b5563;}
  table.addon td.org{color:#b26f16;font-weight:700;white-space:nowrap;}
  tr.addon-total td{background:${NAVY};color:#fff;font-weight:700;text-align:right;padding:8px;}
  .price-bar{display:flex;margin:14px 0 6px;border-radius:2px;overflow:hidden;}
  .pb-l{background:${NAVY};color:#fff;font-weight:700;padding:11px 16px;font-size:16px;display:flex;align-items:center;}
  .pb-r{background:${ORANGE};color:#fff;font-weight:700;padding:11px 18px;font-size:19px;flex:1;display:flex;align-items:center;gap:6px;}
  .pb-r .val{color:#fff;}.pb-r .ipx{color:#fdeacb;}
  .pb-r .pb-unit{margin-left:auto;}
  .tiny-note{font-size:12px;color:${GRAY};font-style:italic;line-height:1.5;margin-bottom:4px;}
  .journey{display:flex;align-items:stretch;margin:10px 0 6px;}
  .jstep{background:${NAVY_DK};color:#fff;flex:1;padding:14px 10px;text-align:center;border-radius:3px;}
  .jnum{font-size:26px;font-weight:700;color:${ORANGE};line-height:1;}
  .jt{font-size:15px;font-weight:700;margin-top:5px;}.js{font-size:11.5px;color:#c3cede;margin-top:3px;line-height:1.35;}
  .jarrow{color:${ORANGE};font-size:26px;font-weight:700;display:flex;align-items:center;padding:0 5px;}
  table.banks,table.amort{width:100%;border-collapse:collapse;font-size:12.5px;margin:6px 0 10px;}
  table.banks th,table.amort th{background:${NAVY};color:#fff;font-weight:500;padding:7px 9px;text-align:left;border:1px solid ${NAVY};}
  table.banks td,table.amort td{border:1px solid #cfd5de;padding:7px 9px;vertical-align:top;}
  table.amort td,table.amort th{text-align:center;}table.amort td:first-child{font-weight:500;}
  tr.amort-total td{background:${NAVY};color:#fff;font-weight:700;}tr.amort-total .org,td.org{color:${ORANGE};}
  .qt-divider{border:1.5px solid ${NAVY};border-left:5px solid ${ORANGE};border-radius:3px;background:#f7f9fc;padding:22px 20px;margin:14px 0;text-align:center;}
  .qt-i{font-size:30px;}.qt-t{font-size:17px;font-weight:700;color:${NAVY};margin-top:4px;}
  .qt-s{font-size:14px;color:#4b5563;margin-top:3px;}
  /* GSB Solar Loan Calculator block */
  .calc{border:1px solid #cfd5de;margin:4px 0 8px;}
  .calc-head{background:#2f8f5b;color:#fff;font-weight:700;font-size:14px;text-align:center;padding:6px;}
  .calc-sub{background:#3fa86c;color:#eafff3;font-style:italic;font-size:11px;text-align:center;padding:3px 6px;}
  .calc-note{display:flex;align-items:center;gap:8px;padding:5px 8px;font-size:9.5px;background:#fff;border-bottom:1px solid #e5e8ec;}
  .cn-red{color:#c0392b;font-weight:600;}
  .cn-box{display:inline-block;width:34px;height:9px;border:1.3px solid #d9432f;vertical-align:middle;margin:0 2px;}
  .cn-pull{margin-left:auto;color:#fff;background:#c0392b;border-radius:9px;padding:2px 9px;font-weight:600;}
  .cn-yr{color:#555;text-align:right;font-weight:600;line-height:1.1;}
  .calc-cols{display:flex;}
  .calc-col{flex:1;padding:0;}
  .calc-col:first-child{border-right:1px solid #d3d8e0;}
  .csec{background:${NAVY};color:#fff;font-weight:700;font-size:10.5px;padding:3px 8px;}
  table.ct{width:100%;border-collapse:collapse;font-size:10px;}
  table.ct td{border-bottom:1px solid #eceff3;padding:2.5px 8px;vertical-align:middle;}
  table.ct td:first-child{color:#33404f;}
  table.ct td:last-child{text-align:right;font-weight:600;color:#1f2a3a;white-space:nowrap;width:34%;}
  table.ct tr:nth-child(even) td{background:#f6f8fa;}
  table.ct td.in{color:#1f2a3a;}
  table.ct td.big{font-size:15px;font-weight:700;color:${NAVY};}
  table.ct td.neg{background:#fde2e2!important;color:#c0392b;}
  .calc-green{background:#2f8f5b;color:#eafff3;font-size:10.5px;font-weight:600;line-height:1.4;padding:9px 11px;margin:6px 6px 6px;border-radius:2px;}
  /* กล่องสรุปใต้ตารางความคุ้มค่า (แผน 20261014-01) */
  .sum{border:1px solid #cfd5de;border-radius:3px;margin:8px 0 6px;}
  .sum-row{display:flex;}
  .sum-cell{flex:1;padding:4px 8px;text-align:center;border-right:1px solid #e5e8ec;}
  .sum-cell:last-child{border-right:0;}
  .sum-k{font-size:11px;color:#4b5563;line-height:1.35;}
  .sum-v{font-size:15px;font-weight:700;color:${NAVY};line-height:1.35;}
  .sum-v.go{color:#2f8f5b;}
  .sum-u{font-size:11px;font-weight:400;color:${GRAY};}
  .sum-foot{background:#eef6ef;border-top:1px solid #d6e9da;color:#2e4633;font-size:12px;padding:3px 8px;text-align:center;}
  .sum-extra{font-size:12px;color:#4a3a22;background:#fdf4e6;border-left:4px solid ${ORANGE};padding:3px 10px;margin:-2px 0 6px;border-radius:3px;}
  .banner-dk{background:${NAVY_DK};color:#dfe6f0;padding:12px 16px;margin-top:14px;border-radius:2px;}
  .bd-h{font-weight:700;color:#fff;font-size:15px;margin-bottom:3px;}.bd-l{font-size:13px;line-height:1.5;}
  </style></head><body>${pagesHtml}</body></html>`;
  return html;
}

// จำนวนหน้าของรายงานที่สร้างแล้ว (13–15 ตามรูปแบบการชำระ) — ตัวรวมเล่มกับใบเสนอราคา
// ใช้นับเลขหน้าต่อและตรวจว่า PDF ไม่มีหน้าหาย/เกิน
export function countSurveyReportPages(html) {
  return (String(html).match(/<section class="page[ "]/g) || []).length;
}
