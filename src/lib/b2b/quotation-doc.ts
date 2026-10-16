import type { QuoteSnapshot } from "./quotation-server";
import type { QuoteStatus } from "./quotation";

// HTML ของใบเสนอราคา B2B — ผังตาม sheet "SSE (2)" ใน BOQ Solar rooftop.xlsx (แผน 20261015-07 เฟส 2)
//   หน้า 1: หัวบริษัท · เลขที่/วันที่ · โครงการ/ลูกค้า/ผู้ติดต่อ · รายการเหมา + bullet · เงื่อนไขชำระเงิน · ยอด + ตัวอักษร · ช่องลงชื่อ
//   หน้า 2: รายละเอียดการรับประกัน · ยืนยันราคา · หมายเหตุ · ช่องลงชื่อ (แม่แบบลงชื่อซ้ำทั้ง 2 หน้า)
//   ช่องลงชื่อ: แถว 1 ลูกค้า | ผู้เสนอราคา · แถว 2 ผู้ตรวจสอบ 1 | 2 · แถว 3 ผู้ตรวจสอบ 3
// ไม่มีโค้ดฝั่ง server — fonts/logo ส่งเข้ามาเป็น data URL (quotation-pdf.ts)

export type DocSigner = { name: string | null; date: string | null; signature: string | null };
export type QuoteDocAssets = { fontFaces: string; logo: string };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const money = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
/** "15 ตุลาคม 2569" — แบบช่องลงชื่อในแม่แบบ */
export function thaiLongDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00+07:00` : iso);
  if (Number.isNaN(d.getTime())) return "";
  const b = new Date(d.getTime() + 7 * 3600 * 1000);
  return `${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear() + 543}`;
}
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── ยอดเป็นตัวอักษร (BAHTTEXT ของ Excel) ──
const DIGIT = ["", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const PLACE = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];
/** 0–999,999 · hasHigher = มีหลักล้านอยู่ข้างหน้า (1,000,001 อ่าน "หนึ่งล้านเอ็ด") */
function readGroup(n: number, hasHigher = false): string {
  let out = "";
  const s = String(n);
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - i - 1;
    if (d === 0) continue;
    if (pos === 0 && d === 1 && (s.length > 1 || hasHigher)) out += "เอ็ด";
    else if (pos === 1 && d === 2) out += "ยี่";
    else if (pos === 1 && d === 1) out += "";
    else out += DIGIT[d];
    out += PLACE[pos];
  }
  return out;
}
function readInt(n: number): string {
  if (n === 0) return "ศูนย์";
  const parts: string[] = [];
  while (n > 0) { const rest = Math.floor(n / 1_000_000); parts.unshift(readGroup(n % 1_000_000, rest > 0)); n = rest; }
  return parts.map((p, i) => (i < parts.length - 1 ? `${p}ล้าน` : p)).join("");
}
export function bahtText(amount: number): string {
  const satang = Math.round(Math.abs(amount) * 100);
  const baht = Math.floor(satang / 100);
  const st = satang % 100;
  return `${amount < 0 ? "ลบ" : ""}${readInt(baht)}บาท${st === 0 ? "ถ้วน" : `${readInt(st)}สตางค์`}`;
}

export const WATERMARK: Partial<Record<QuoteStatus, string>> = {
  draft: "DRAFT", changes_required: "DRAFT · ส่งกลับแก้",
  pending_review1: "รอผู้ตรวจสอบ 1 อนุมัติ", pending_review2: "รอผู้ตรวจสอบ 2 อนุมัติ", pending_review3: "รอผู้ตรวจสอบ 3 อนุมัติ",
};

const COMPANY = `<b>บริษัท เสนา โซลาร์ เอนเนอร์ยี่ จำกัด (สำนักงานใหญ่)</b><br>เลขที่ 448 ถนนรัชดาภิเษก แขวงสามเสนนอก เขตห้วยขวาง กรุงเทพมหานคร 10310<br>โทร. 0-2541-4642 · เลขประจำตัวผู้เสียภาษี 0105552041258`;
/** บัญชีรับเงินตามแม่แบบ SSE */
const BANK_LINE = "*ธนาคารทหารไทยธนชาต ชื่อบัญชี : บริษัท เสนา โซลาร์ เอนเนอร์ยี่ จำกัด เลขที่บัญชี : 667-2-03155-3 สาขาดิ เอสพละนาด รัชดาภิเษก";

export function renderQuoteHtml(s: QuoteSnapshot, signers: { proposer: DocSigner; r1: DocSigner; r2: DocSigner; r3: DocSigner }, watermark: string | null, assets: QuoteDocAssets): string {
  const c = s.content;
  const t = s.totals;
  const docNo = `${s.doc_no}${s.revision > 0 ? ` Rev.${s.revision}` : ""}`;
  const date = thaiLongDate(s.issue_date);
  const validUntil = s.issue_date ? thaiLongDate(addDays(s.issue_date, c.validity_days)) : "";
  const kindLabel = s.kind === "estimate" ? "ราคาประมาณการ" : "ราคายืนยัน";

  const head = (compact: boolean) => `
    <div class="top">
      <div class="brand"><img src="${assets.logo}" alt="SENA Solar Energy"><div class="company">${COMPANY}</div></div>
      <div class="docbox"><div class="doctitle">ใบเสนอราคา<span>QUOTATION</span></div>
        <table class="kv"><tr><th>Quotation no :</th><td>${esc(docNo)}</td></tr><tr><th>วันที่ :</th><td>${esc(date || "—")}</td></tr><tr><th>ประเภท :</th><td>${kindLabel}</td></tr></table></div>
    </div>
    <div class="parties${compact ? " compact" : ""}">
      <table class="kv left">
        <tr><th>ชื่อโครงการ :</th><td><b>${esc(s.project.name)}</b>${s.project.location ? `<br>${esc(s.project.location)}` : ""}</td></tr>
        <tr><th>ลูกค้า :</th><td>${esc(s.customer.name)}${s.customer.branch ? ` (${esc(s.customer.branch)})` : ""}${!compact && s.customer.address ? `<br>${esc(s.customer.address)}` : ""}</td></tr>
        ${compact ? "" : `<tr><th>ติดต่อ :</th><td>${esc([s.contact.name, s.contact.phone, s.contact.email].filter(Boolean).join(" · ") || "—")}</td></tr>
        <tr><th>เลขประจำตัวผู้เสียภาษี :</th><td>${esc(s.customer.tax_id || "—")}</td></tr>`}
      </table>
      <table class="kv right">
        <tr><th>ผู้ติดต่อ :</th><td>${esc(s.proposer.name || "—")}</td></tr>
        ${s.proposer.phone ? `<tr><th>Tel. :</th><td>${esc(s.proposer.phone)}</td></tr>` : ""}
        ${s.proposer.email ? `<tr><th>E-mail :</th><td>${esc(s.proposer.email)}</td></tr>` : ""}
      </table>
    </div>`;

  const cell = (role: string, x: DocSigner) => `
    <div class="sig"><div class="sig-img">${x.signature ? `<img src="${x.signature}" alt="">` : ""}</div>
      <div class="sig-line"><span>ลงชื่อ</span><i></i><span>${role}</span></div>
      <div>( ${x.name ? esc(x.name) : '<span class="dots"></span>'} )</div>
      <div>${x.date ? esc(thaiLongDate(x.date)) : "วันที่ ......./......./......."}</div></div>`;
  const signatures = `<div class="sigs">
      ${cell("ลูกค้า", { name: null, date: null, signature: null })}${cell("ผู้เสนอราคา", signers.proposer)}
      ${cell("ผู้ตรวจสอบ", signers.r1)}${cell("ผู้ตรวจสอบ", signers.r2)}
      ${cell("ผู้ตรวจสอบ", signers.r3)}</div>`;

  const items = c.items.map((it, i) => `
    <tr><td class="no">${i + 1}</td>
      <td><div class="item-title">${esc(it.title)}${it.kwp != null ? ` <b>${it.kwp.toLocaleString("th-TH", { maximumFractionDigits: 2 })}</b> kWp.` : ""}</div>
        ${it.bullets.length ? `<ul>${it.bullets.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}</td>
      <td class="amt">${money(it.amount)}</td></tr>`).join("");
  const pay = c.installments.map((x, i) => `<li>งวดที่ ${i + 1} ร้อยละ ${x.pct} ของมูลค่าสัญญา ${esc(x.condition)}</li>`).join("");

  const warrantyRows = [
    ...c.warranty.map((w) => [w.label, w.value]),
    ["ยืนยันราคาภายในวันที่", `${validUntil || "—"} (${c.validity_days} วัน)`],
    ...(c.install_warranty ? [["รับประกันการติดตั้ง เป็นระยะเวลา", c.install_warranty]] : []),
  ];

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
${assets.fontFaces}
@page { size: A4; margin: 9mm 13mm 13mm; }
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: "DBHeavent", Tahoma, sans-serif; font-size: 12pt; line-height: 1.28; color: #1f2937; }
.watermark { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; pointer-events: none; z-index: 0; }
.watermark span { transform: rotate(-25deg); font-size: 46pt; font-weight: 700; color: rgba(222, 51, 74, .14); white-space: nowrap; }
.top { display: flex; justify-content: space-between; gap: 6mm; border-bottom: 1.2pt solid #243b5c; padding-bottom: 2.5mm; }
.brand { display: flex; gap: 3mm; align-items: flex-start; }
.brand img { height: 13mm; }
.company { font-size: 10pt; line-height: 1.25; color: #374151; }
.docbox { text-align: right; min-width: 62mm; }
.doctitle { font-size: 17pt; font-weight: 700; color: #243b5c; line-height: 1.1; }
.doctitle span { display: block; font-size: 10pt; letter-spacing: .12em; color: #6b7280; }
table.kv { border-collapse: collapse; }
table.kv th { font-weight: 500; color: #4b5563; text-align: left; padding: 0 2mm 0 0; vertical-align: top; white-space: nowrap; }
table.kv td { padding: 0; vertical-align: top; }
.docbox table.kv { margin-left: auto; margin-top: 1mm; }
.parties { display: flex; justify-content: space-between; gap: 8mm; margin: 2.5mm 0; }
.parties .left { flex: 1; }
.parties .right { width: 62mm; }
table.items { width: 100%; border-collapse: collapse; margin-top: 1mm; }
table.items th { background: #243b5c; color: #fff; font-weight: 500; padding: 1.5mm 2mm; text-align: left; }
table.items td { border-bottom: .6pt solid #d1d5db; padding: 1.8mm 2mm; vertical-align: top; }
table.items .no { width: 11mm; text-align: center; }
table.items .amt { width: 34mm; text-align: right; white-space: nowrap; font-weight: 500; }
.item-title { font-weight: 500; }
table.items ul { margin: .5mm 0 0 4mm; list-style: none; font-size: 11pt; line-height: 1.22; color: #374151; }
table.items li::before { content: "- "; }
.pay-totals { display: flex; gap: 6mm; margin-top: 3mm; break-inside: avoid; }
.pay { flex: 1; font-size: 11.5pt; }
.pay h3, .section h3 { font-size: 12.5pt; font-weight: 700; color: #243b5c; margin-bottom: 1mm; }
.pay ul { list-style: none; }
.bank { margin-top: 1.5mm; font-size: 10.5pt; color: #4b5563; }
table.totals { width: 72mm; border-collapse: collapse; align-self: flex-start; }
table.totals td { padding: 1.2mm 2mm; border-bottom: .6pt solid #d1d5db; }
table.totals td:last-child { text-align: right; white-space: nowrap; font-weight: 500; }
table.totals tr.grand td { background: #eef2f7; font-weight: 700; border-bottom: 1.2pt solid #243b5c; }
.words { text-align: right; font-size: 11pt; color: #374151; margin-top: 1mm; }
/* ช่องลงชื่อ 5 ช่อง (2 คอลัมน์ × 3 แถวแบบแม่แบบ) — บีบให้หน้า 1 จบในหน้าเดียวเมื่อ bullet/งวดเงินไม่ยาวเกินแม่แบบ */
.sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 12mm; margin-top: 3mm; break-inside: avoid; font-size: 11pt; line-height: 1.2; text-align: center; }
.sig-img { height: 9mm; display: flex; align-items: flex-end; justify-content: center; }
.sig-img img { max-height: 9mm; max-width: 42mm; }
.sig-line { display: flex; align-items: flex-end; gap: 1.5mm; }
.sig-line i { flex: 1; border-bottom: .8pt dotted #6b7280; height: 1em; }
.dots { display: inline-block; width: 40mm; border-bottom: .8pt dotted #6b7280; }
.page2 { break-before: page; }
.section { margin-top: 4mm; }
.section ol { padding-left: 6mm; font-size: 11.5pt; }
.section ol li { margin-bottom: .8mm; }
table.warranty { border-collapse: collapse; font-size: 11.5pt; }
table.warranty td { padding: .5mm 3mm .5mm 0; vertical-align: top; }
.content { position: relative; z-index: 1; }
</style></head><body>
${watermark ? `<div class="watermark"><span>${esc(watermark)}</span></div>` : ""}
<div class="content">
  ${head(false)}
  <table class="items"><thead><tr><th class="no">ลำดับ</th><th>รายการ</th><th class="amt">จำนวนเงิน (บาท)</th></tr></thead><tbody>${items}</tbody></table>
  <div class="pay-totals">
    <div class="pay"><h3>เงื่อนไขการชำระเงิน ( ภายใน ${c.payment_days} วัน )</h3><ul>${pay}</ul><div class="bank">${esc(BANK_LINE)}</div></div>
    <div>
      <table class="totals">
        <tr><td>ราคาสินค้าก่อนภาษีมูลค่าเพิ่ม</td><td>${money(t.subtotal)}</td></tr>
        <tr><td>ภาษีมูลค่าเพิ่ม (VAT) ${c.vat_pct}%</td><td>${money(t.vat)}</td></tr>
        <tr class="grand"><td>รวมเงิน</td><td>${money(t.total)}</td></tr>
      </table>
      <div class="words">( ${esc(bahtText(t.total))} )</div>
    </div>
  </div>
  ${signatures}

  <div class="page2">
    ${head(true)}
    <div class="section"><h3>รายละเอียดการรับประกันสินค้า</h3>
      <table class="warranty">${warrantyRows.map((r, i) => `<tr><td>${i + 1})</td><td>${esc(r[0])}</td><td>${esc(r[1])}</td></tr>`).join("")}</table></div>
    ${c.remarks.length ? `<div class="section"><h3>หมายเหตุ</h3><ol>${c.remarks.map((r) => `<li>${esc(r)}</li>`).join("")}</ol></div>` : ""}
    ${signatures}
  </div>
</div>
</body></html>`;
}
