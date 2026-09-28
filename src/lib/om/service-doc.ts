import type { FormItem } from "@/lib/om/job-form";

// ใบบริการ PDF (ใบตรวจรับงาน / ใบบริการ) — สร้าง HTML ฝั่ง server แล้วให้ puppeteer พิมพ์เป็น A4
// ★ แผน 20260928-04 ข้อ 9 (ผู้ใช้เคาะ "ทำตามแนะนำ" 28 ก.ย. 69)
// ★ หน้าตายกจากใบส่งมอบงานติดตั้งของฝั่งขาย (src/app/(public)/install-doc/[id]/page.tsx)
//   แถบหัวสีหลัก · CUSTOMER INFORMATION · กล่องหัวข้อพื้นส้มอ่อน · ช่องติ๊ก SVG · ลายเซ็น · รูปแนบขึ้นหน้าใหม่
//   แก้หน้าตาฝั่งนั้นแล้วตามมาแก้ที่นี่ด้วย
// ★ ต่างจากฝั่งขายโดยตั้งใจ: ไม่มีหน้าสาธารณะ/API ข้อมูลที่เปิดโดยไม่ล็อกอิน (ใบนี้มีลายเซ็น + รูปบ้านลูกค้า)
//   route เป็นคนอ่านข้อมูล แล้วเสิร์ฟ HTML/ฟอนต์/รูป ให้ puppeteer ผ่าน origin ภายใน (DOC_ORIGIN) เท่านั้น

/** origin ภายในที่ puppeteer ใช้โหลดเอกสาร — ไม่มีอยู่จริง route ดักคำขอแล้วตอบเองทั้งหมด */
export const DOC_ORIGIN = "https://om-service-doc.local";

// ข้อมูลบริษัท — ชุดเดียวกับใบส่งมอบงานติดตั้ง (CO ใน install-doc)
const CO = {
  name: "SENA SOLAR ENERGY CO., LTD.",
  nameTh: "บริษัท เสนาโซลาร์ เอนเนอร์ยี่ จำกัด",
  address: "448 RATCHADAPHISEK RD., SAM SEN NOK, HUAI KHWANG, BANGKOK 10310",
  taxId: "0105552041258",
  phone: "02-541-4642 ต่อ 10303",
  hotline: "089-834-3333",
  email: "SERVICES_SSE@SENASOLARENERGY.COM",
};

export type ServiceDocInput = {
  bookingId: number;
  job: {
    status: string; scheduled_at: string | null; service_type: string | null; team_name: string | null;
    house_number: string | null; project_name: string | null; customer_name: string | null;
    phone: string | null; kwp_list: string | null;
  };
  report: {
    job_no: string | null; checks: Record<string, { pass?: boolean; fix?: string }>;
    measures: Record<string, number | null>; note: string | null; result: string | null;
    finished_at: string | null; tech_sign: string | null; cust_sign: string | null; cust_name: string | null;
    qc_sign: string | null; close_method: string | null; proxy_reason: string | null;
    repair_needed: number | null; repair_detail: string | null;
  } | null;
  form: { label_th: string; version: number; items: FormItem[] } | null;
  techName: string | null;
  /** รูปก่อน/หลัง — src เป็น URL ใต้ DOC_ORIGIN (route ตอบไฟล์จากดิสก์ให้) · heic = Chromium เปิดไม่ได้ */
  photos: { kind: string; src: string; heic: boolean }[];
};

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
const dash = (v: unknown) => (v === null || v === undefined || v === "" ? "-" : esc(v));

const thDate = (s: string | null, time = false) => {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "-";
  const day = d.toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" });
  return time ? `${day} เวลา ${d.toLocaleTimeString("th-TH", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit" })} น.` : day;
};

// ช่องติ๊กเป็น SVG ไม่ใช่ ✓ ✗ — Chromium บน Linux ของ prod ไม่มีฟอนต์ที่มีสองตัวนี้ (บทเรียนจาก install-doc)
const CHECK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 12 10 18 20 6"/></svg>`;
const XMARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`;
const box = (on: boolean, kind: "ok" | "ng") =>
  `<span class="checkbox ${on ? (kind === "ok" ? "checked" : "failed") : ""}">${on ? (kind === "ok" ? CHECK : XMARK) : ""}</span>`;

const SECTION_TH: Record<string, string> = { quality: "คุณภาพงาน", measure: "การทดสอบระบบ", photo: "รูปถ่าย" };
const CLOSE_TH: Record<string, string> = {
  onsite_sign: "ลูกค้าเซ็นรับที่หน้างาน", line_otp: "ลูกค้ายืนยันทาง LINE", tech_proxy: "ช่างเซ็นแทนลูกค้า",
};

function sectionHtml(no: number, sec: string, items: FormItem[], d: ServiceDocInput): string {
  const checks = d.report?.checks ?? {};
  const measures = d.report?.measures ?? {};
  const bools = items.filter((i) => i.kind === "bool");
  const nums = items.filter((i) => i.kind === "num");
  const boolRows = bools.map((it, i) => {
    const v = checks[it.code] ?? {};
    return `<div class="row-check">
      <span>${i + 1}. ${esc(it.label_th)}</span>
      <span>${box(v.pass === true, "ok")}ผ่าน</span>
      <span>${box(v.pass === false, "ng")}<span class="${v.pass === false ? "ng" : ""}">ไม่ผ่าน</span></span>
      <span class="note-line">${esc(v.fix ?? "")}</span>
    </div>`;
  }).join("");
  const numRows = nums.map((it) => {
    const v = measures[it.code];
    return `<div class="row-num"><span>${esc(it.label_th)}</span><span class="value-box">${v === null || v === undefined ? "-" : esc(v)}</span><span>${esc(it.unit ?? "")}</span></div>`;
  }).join("");
  return `<div class="avoid-break">
    <div class="sec-title">${no}. ${esc(SECTION_TH[sec] ?? sec)}</div>
    <div class="sec-body">${boolRows}${nums.length ? `<div class="grid-num">${numRows}</div>` : ""}</div>
  </div>`;
}

function sigBox(label: string, name: string | null, src: string | null): string {
  return `<div class="sig">
    <div class="sig-img">${src ? `<img src="${esc(src)}" alt="signature"/>` : ""}</div>
    <div class="sig-name">( ${name ? esc(name) : "…………………………………………"} )</div>
    <div class="sig-label">${esc(label)}</div>
  </div>`;
}

export function renderServiceDocHtml(d: ServiceDocInput): string {
  const r = d.report;
  const items = d.form?.items ?? [];
  const sections = [...new Set(["quality", ...items.map((i) => i.section)])]
    .map((sec) => ({ sec, list: items.filter((i) => i.section === sec && (i.kind === "bool" || i.kind === "num")) }))
    .filter((s) => s.list.length > 0);
  const closed = d.job.status === "closed";
  const docNo = r?.job_no ?? "ยังไม่ออกเลข";
  const proxy = r?.close_method === "tech_proxy";

  const info: [string, string][] = [
    ["โครงการ", dash(d.job.project_name)], ["บ้านเลขที่", dash(d.job.house_number)],
    ["ลูกค้า", dash(d.job.customer_name)], ["โทร.", dash(d.job.phone)],
    ["ประเภทงาน", dash(d.job.service_type)], ["ขนาดติดตั้ง", d.job.kwp_list ? `${esc(d.job.kwp_list)} kW` : "-"],
    ["ทีมช่าง", dash(d.job.team_name)], ["วันนัด", thDate(d.job.scheduled_at, true)],
  ];

  let n = 0;
  const body = [
    ...sections.map((s) => sectionHtml(++n, s.sec, s.list, d)),
    r?.repair_needed === 1 ? `<div class="avoid-break"><div class="sec-title">${++n}. พบงานซ่อม</div>
      <div class="sec-body" style="white-space:pre-wrap">${esc(r.repair_detail ?? "")}</div></div>` : "",
    `<div class="avoid-break"><div class="label-top">บันทึกเพิ่มเติม</div><div class="notes">${esc(r?.note ?? "")}</div></div>`,
    `<div class="avoid-break result">
      <span class="label-inline">ผลการตรวจ</span>
      <span>${box(r?.result === "pass", "ok")}ผ่าน</span>
      <span>${box(r?.result === "fail", "ng")}<span class="${r?.result === "fail" ? "ng" : ""}">ไม่ผ่าน</span></span>
      <span class="label-inline" style="margin-left:18px">ปิดงานโดย</span>
      <span>${r?.close_method ? esc(CLOSE_TH[r.close_method] ?? r.close_method) : "-"}${proxy && r?.proxy_reason ? ` — ${esc(r.proxy_reason)}` : ""}</span>
    </div>`,
    `<div class="sigs avoid-break">
      ${sigBox(proxy ? "ลูกค้า (ช่างเซ็นแทน — ดูเหตุผลด้านบน)" : "ลูกค้า", r?.cust_name ?? d.job.customer_name, r?.cust_sign ?? null)}
      ${sigBox("ช่างผู้ปฏิบัติงาน", d.techName, r?.tech_sign ?? null)}
      ${sigBox("ผู้ตรวจสอบ / Q.C.", null, r?.qc_sign ?? null)}
    </div>`,
  ].join("");

  // รูปแนบ — ขึ้นหน้าใหม่แบบใบส่งมอบฝั่งขาย · ก่อนทำงานแล้วตามด้วยหลังทำงาน
  const kinds = [["before", "ก่อนทำงาน"], ["after", "หลังทำงาน"]] as const;
  const photoBlocks = kinds.map(([k, t]) => {
    const list = d.photos.filter((p) => p.kind === k);
    if (!list.length) return "";
    return `<div class="photo-group"><div class="photo-head">${t} · ${list.length} รูป</div><div class="photo-grid">${list.map((p, i) => `
      <div class="photo avoid-break">
        <div class="photo-img">${p.heic ? `<span class="heic">ไฟล์ HEIC แสดงในเอกสารไม่ได้ — ดูในระบบ</span>` : `<img src="${esc(p.src)}" alt=""/>`}</div>
        <div class="photo-cap">${t} ${i + 1} / ${list.length}</div>
      </div>`).join("")}</div></div>`;
  }).join("");

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${esc(docNo)}</title>
<style>
@font-face { font-family: "DBHeavent"; src: url("${DOC_ORIGIN}/font/400.woff") format("woff"); font-weight: 400; }
@font-face { font-family: "DBHeavent"; src: url("${DOC_ORIGIN}/font/500.woff") format("woff"); font-weight: 500; }
@font-face { font-family: "DBHeavent"; src: url("${DOC_ORIGIN}/font/700.woff") format("woff"); font-weight: 700; }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #fff; }
body { font-family: "DBHeavent", sans-serif; color: #111827; font-size: 17px; line-height: 1.45; }
#doc { width: 210mm; }
table.doc { border-collapse: collapse; width: 100%; }
table.doc thead { display: table-header-group; }
table.doc tfoot { display: table-footer-group; }
table.doc td { padding: 0; vertical-align: top; }
.strip-header { background: #1ed0c7; color: #fff; height: 20mm; padding: 4mm 7mm; display: flex; justify-content: space-between; gap: 12px;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.co-name { font-weight: 700; font-size: 20px; line-height: 1.1; letter-spacing: .02em; }
.co-sub { font-size: 14px; opacity: .92; line-height: 1.25; }
.doc-kind { text-align: right; }
.doc-kind .en { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; opacity: .85; }
.doc-kind .th { font-size: 20px; font-weight: 700; line-height: 1.15; }
.ref { padding: 2mm 7mm; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f3f4f6; font-size: 15px; color: #6b7280; }
.ref b { color: #111827; font-size: 22px; letter-spacing: .05em; margin-left: 4px; }
.draft { display: inline-block; margin-left: 10px; padding: 0 8px; border-radius: 999px; background: #fef3c7; color: #92400e; font-size: 14px; font-weight: 700; }
.content { padding: 4mm 7mm; display: flex; flex-direction: column; gap: 3.5mm; }
.label-top { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9ca3af; margin-bottom: 1.5mm; }
.info { display: grid; grid-template-columns: 70px 1fr 90px 1fr; gap: 1mm 3mm; font-size: 16px; }
.info .k { color: #9ca3af; } .info .v { color: #111827; font-weight: 500; }
.sec-title { background: #fff5e1; border: 1px solid #e5e7eb; padding: 1mm 3mm; font-weight: 700; font-size: 16px; }
.sec-body { border: 1px solid #e5e7eb; border-top: 0; padding: 2mm 3.5mm; font-size: 16px; }
.row-check { display: grid; grid-template-columns: 2.2fr 80px 90px 1.4fr; gap: 6px; align-items: center; padding: 1px 0; }
.grid-num { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 8mm; padding-top: 1mm; }
.row-num { display: grid; grid-template-columns: 1fr 80px 34px; gap: 6px; align-items: center; }
.value-box { text-align: center; font-weight: 700; border-bottom: 1px dotted #9ca3af; }
.note-line { color: #b91c1c; font-size: 15px; }
.checkbox { display: inline-flex; width: 13px; height: 13px; border: 1px solid #4b5563; vertical-align: middle; margin-right: 5px;
  align-items: center; justify-content: center; }
.checkbox svg { width: 11px; height: 11px; display: block; }
.checkbox.checked svg { color: #15803d; }
.checkbox.failed { border-color: #dc2626; } .checkbox.failed svg { color: #dc2626; }
.ng { color: #dc2626; font-weight: 700; }
.notes { min-height: 16mm; border: 1px solid #e5e7eb; border-radius: 4px; padding: 2mm 3.5mm; white-space: pre-wrap; font-size: 16px; }
.result { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 16px; }
.label-inline { color: #6b7280; font-weight: 700; }
.sigs { display: flex; justify-content: space-around; gap: 8mm; margin-top: 3mm; }
.sig { flex: 1; max-width: 62mm; text-align: center; }
.sig-img { height: 16mm; display: flex; align-items: flex-end; justify-content: center; }
.sig-img img { max-height: 16mm; max-width: 100%; object-fit: contain; }
.sig-name { border-top: 1px solid #9ca3af; padding-top: 1mm; font-size: 15px; }
.sig-label { font-size: 14px; color: #6b7280; }
.avoid-break { break-inside: avoid; page-break-inside: avoid; }
.photos { break-before: page; page-break-before: always; }
.photo-group { margin-bottom: 3mm; }
.photo-head { font-weight: 700; font-size: 15px; color: #374151; margin: 1mm 0; }
.photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; }
.photo { border: 1px solid #d1d5db; border-radius: 3px; overflow: hidden; }
.photo-img { aspect-ratio: 4 / 3; background: #f9fafb; display: flex; align-items: center; justify-content: center; overflow: hidden; }
.photo-img img { width: 100%; height: 100%; object-fit: cover; }
.heic { font-size: 14px; color: #9ca3af; padding: 4mm; text-align: center; }
.photo-cap { border-top: 1px solid #d1d5db; padding: .5mm 2mm; font-size: 13px; color: #6b7280; text-align: center; }
.strip-footer { background: #f9fafb; border-top: 1px solid #f3f4f6; padding: 2mm 7mm; font-size: 14px; color: #6b7280; text-align: center;
  -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body><div id="doc">
<table class="doc">
  <thead><tr><td>
    <div class="strip-header">
      <div><div class="co-name">${CO.name}</div><div class="co-sub">${CO.address}</div><div class="co-sub">TAX ID: ${CO.taxId} · TEL: ${CO.phone}</div></div>
      <div class="doc-kind"><div class="en">Service Report</div><div class="th">${esc(d.form?.label_th ?? "ใบตรวจรับงาน / ใบบริการ")}</div></div>
    </div>
  </td></tr></thead>
  <tbody><tr><td>
    <div class="ref">
      <span>DOCUMENT NO:<b>${esc(docNo)}</b>${closed ? "" : `<span class="draft">ฉบับร่าง — ยังไม่ปิดงาน</span>`}</span>
      <span>DATE: <span style="color:#1f2937;font-weight:500">${thDate(r?.finished_at ?? d.job.scheduled_at)}</span></span>
    </div>
    <div class="content">
      <div class="avoid-break">
        <div class="label-top">Customer Information</div>
        <div class="info">${info.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join("")}</div>
      </div>
      ${body}
    </div>
    ${photoBlocks ? `<div class="photos content"><div class="sec-title">ภาพหน้างาน · SITE PHOTOS</div>${photoBlocks}</div>` : ""}
  </td></tr></tbody>
  <tfoot><tr><td>
    <div class="strip-footer">การให้บริการด้านเทคนิค ติดต่อ โทร. ${CO.phone} · สายด่วน ${CO.hotline} · ${CO.email}</div>
  </td></tr></tfoot>
</table>
</div></body></html>`;
}
