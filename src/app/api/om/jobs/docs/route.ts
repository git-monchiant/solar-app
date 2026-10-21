import { NextRequest, NextResponse } from "next/server";
import { PDFDocument } from "pdf-lib";
import { requireAuth } from "@/lib/auth";
import { getOmDb } from "@/lib/om/line";
import { CO, DOC_ORIGIN } from "@/lib/om/service-doc";
import { buildServiceDoc, launchDocBrowser, printDocHtml, type BuiltServiceDoc } from "@/lib/om/service-doc-pdf";
import { buildContentDisposition } from "@/lib/doc-filename";

export const runtime = "nodejs";
export const maxDuration = 120;

// GET /api/om/jobs/docs?ids=1,2,3&title=… — ใบบริการหลายใบรวมเป็น PDF เดียว (แผน 20261015-03)
// ★ ผู้ใช้เคาะ 15 ต.ค. 69: ปุ่ม "PDF รวม" ในหน้าต่างแท็บปิดงานของภาพรวม O&M · หน้าแรกเป็นหน้าสรุปรายการ · ย่อรูป
//   ใบแต่ละใบพิมพ์ด้วยตัวเดียวกับใบเดี่ยว (service-doc-pdf.ts) เรียงตามลำดับที่ส่งมา แล้วต่อด้วย pdf-lib
//   ใบที่ไม่มีใบตรวจรับงาน = ข้าม (เขียนไว้ท้ายหน้าสรุป + header X-Om-Docs-Skipped ให้หน้าจอบอก)
// ★ ครั้งละไม่เกิน 50 ใบ — ใบละ ~1 วินาที คำขอยาวเกิน nginx prod (มักตัดที่ 60 วินาที) ไม่ได้

const MAX_DOCS = 50;
/** หน้าที่พิมพ์พร้อมกันในเบราว์เซอร์เดียว — มากกว่านี้เครื่อง server กินแรมเกินคุ้ม */
const PARALLEL = 4;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const thDate = (v: string | null) =>
  v ? new Date(v).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit", timeZone: "Asia/Bangkok" }) : "-";

type Skip = { id: number; house: string | null; reason: string };

/** หน้าสรุปรายการ — ฟอนต์/โทนชุดเดียวกับใบบริการ · starts = หน้าที่แต่ละใบเริ่ม (รอบแรกยังไม่รู้ = null) */
function coverHtml(title: string, docs: BuiltServiceDoc[], starts: number[] | null, skipped: Skip[]) {
  const now = new Date().toLocaleString("th-TH", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });
  const rows = docs.map((d, i) => `<tr>
      <td class="c">${i + 1}</td><td class="mono">${esc(d.docNo)}</td><td>${esc(d.job.house_number ?? "-")}</td>
      <td>${esc(d.job.customer_name ?? "-")}</td><td>${esc(d.job.project_name ?? "-")}</td>
      <td class="c">${thDate(d.report?.finished_at ?? null)}</td>
      <td class="c ${d.report?.result === "fail" ? "fail" : ""}">${d.report?.result === "pass" ? "ผ่าน" : d.report?.result === "fail" ? "ไม่ผ่าน" : "-"}</td>
      <td class="c mono">${starts ? starts[i] : "…"}</td></tr>`).join("");
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"/><style>
@font-face { font-family: "DBHeavent"; src: url("${DOC_ORIGIN}/font/400.woff") format("woff"); font-weight: 400; }
@font-face { font-family: "DBHeavent"; src: url("${DOC_ORIGIN}/font/700.woff") format("woff"); font-weight: 700; }
@page { size: A4; margin: 12mm 12mm 14mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: "DBHeavent", sans-serif; font-size: 15px; color: #1f2937; }
.co { font-weight: 700; font-size: 18px; }
.co-sub { font-size: 13px; color: #6b7280; }
h1 { font-size: 26px; margin: 6mm 0 1mm; }
.meta { font-size: 14px; color: #4b5563; margin-bottom: 4mm; }
/* table-layout: fixed + colgroup — เดิมตารางยืดตามเนื้อ (คอลัมน์ nowrap) จนล้นชิดขอบขวาของกระดาษ */
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
td { overflow-wrap: anywhere; }
thead { display: table-header-group; }
th { background: #f3f4f6; font-weight: 700; font-size: 14px; text-align: left; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
th, td { border: 1px solid #d1d5db; padding: 1.2mm 2mm; vertical-align: top; }
tr { break-inside: avoid; }
.c { text-align: center; white-space: nowrap; }
.mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
.fail { color: #dc2626; font-weight: 700; }
.skip { margin-top: 5mm; font-size: 14px; color: #92400e; }
</style></head><body>
  <div class="co">${esc(CO.name)}</div>
  <div class="co-sub">${esc(CO.nameTh)} · TAX ID: ${esc(CO.taxId)}</div>
  <h1>${esc(title)}</h1>
  <div class="meta">ใบบริการ ${docs.length} ใบ · สร้างเมื่อ ${esc(now)}</div>
  <table>
    <colgroup><col style="width:5%"/><col style="width:16%"/><col style="width:10%"/><col style="width:25%"/><col style="width:22%"/><col style="width:10%"/><col style="width:7%"/><col style="width:5%"/></colgroup>
    <thead><tr><th class="c">#</th><th>เลขที่ใบบริการ</th><th>บ้านเลขที่</th><th>ลูกค้า</th><th>โครงการ</th><th class="c">วันที่ให้บริการ</th><th class="c">ผลตรวจ</th><th class="c">หน้า</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${skipped.length ? `<div class="skip">ไม่ได้รวม ${skipped.length} ใบ: ${skipped.map((s) =>
    `ใบงานเลขที่ ${s.id}${s.house ? ` (บ้านเลขที่ ${esc(s.house)})` : ""} — ${esc(s.reason)}`).join(" · ")}</div>` : ""}
</body></html>`;
}

export async function GET(req: NextRequest) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const u = req.nextUrl.searchParams;
  const ids = [...new Set((u.get("ids") ?? "").split(",").map((s) => Number(s.trim())).filter((x) => Number.isInteger(x) && x > 0))];
  const title = (u.get("title") ?? "").trim().slice(0, 80) || "ใบบริการ O&M";
  if (!ids.length) return NextResponse.json({ error: "ไม่มีใบงานให้รวม" }, { status: 400 });
  if (ids.length > MAX_DOCS) return NextResponse.json({ error: `รวมได้ครั้งละไม่เกิน ${MAX_DOCS} ใบ` }, { status: 400 });

  const db = await getOmDb();
  const docs: BuiltServiceDoc[] = [];
  const skipped: Skip[] = [];
  for (const id of ids) {
    const d = await buildServiceDoc(db, id);
    if (!d) skipped.push({ id, house: null, reason: "ไม่พบใบงาน" });
    else if (!d.hasReport) skipped.push({ id, house: d.job.house_number, reason: "ไม่มีใบตรวจรับงาน" });
    else docs.push(d);
  }
  if (!docs.length) return NextResponse.json({ error: "ไม่มีใบบริการให้รวม — ทุกใบยังไม่มีใบตรวจรับงาน" }, { status: 404 });

  let browser: Awaited<ReturnType<typeof launchDocBrowser>> | null = null;
  try {
    browser = await launchDocBrowser();
    // ใบบริการ — รูปย่อเฉพาะในไฟล์รวม (ใบเดี่ยวยังฝังรูปเต็ม)
    // ★ พิมพ์พร้อมกันทีละ PARALLEL ใบในเบราว์เซอร์เดียว — ทีละใบ 19 ใบใช้ 27 วินาที (50 ใบเกิน 60 วินาทีของ nginx)
    //   ผลเก็บตามตำแหน่งเดิม ลำดับในไฟล์จึงตรงกับรายชื่อเสมอ
    const browserNow = browser;
    const parts: PDFDocument[] = new Array(docs.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(PARALLEL, docs.length) }, async () => {
      while (next < docs.length) {
        const i = next++;
        parts[i] = await PDFDocument.load(await printDocHtml(browserNow, docs[i].html, docs[i].photos, { shrinkPhotos: true }));
      }
    }));

    // หน้าสรุป 2 รอบ: รอบแรกนับว่าตัวเองยาวกี่หน้า แล้วคิดเลขหน้าที่แต่ละใบเริ่ม (ปกยาวขึ้นเมื่อใบเยอะ)
    const startsFor = (coverPages: number) => {
      let p = coverPages + 1;
      return parts.map((x) => { const s = p; p += x.getPageCount(); return s; });
    };
    let cover = await PDFDocument.load(await printDocHtml(browser, coverHtml(title, docs, null, skipped), new Set()));
    const n1 = cover.getPageCount();
    cover = await PDFDocument.load(await printDocHtml(browser, coverHtml(title, docs, startsFor(n1), skipped), new Set()));
    if (cover.getPageCount() !== n1)   // ใส่เลขหน้าแล้วปกยาวขึ้น/สั้นลง (แทบไม่เกิด) — คิดใหม่อีกรอบ
      cover = await PDFDocument.load(await printDocHtml(browser, coverHtml(title, docs, startsFor(cover.getPageCount()), skipped), new Set()));

    const out = await PDFDocument.create();
    out.setTitle(title);
    for (const src of [cover, ...parts]) {
      const pages = await out.copyPages(src, src.getPageIndices());
      pages.forEach((p) => out.addPage(p));
    }
    const bytes = await out.save();
    const day = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition({ base: `OM-service-reports_${day}`, ext: "pdf", customerName: null, disposition: "attachment" }),
        // ใบมีลายเซ็น + รูปบ้านลูกค้า — ห้าม proxy/CDN เก็บไว้
        "Cache-Control": "private, no-store",
        "X-Om-Docs-Included": String(docs.length),
        "X-Om-Docs-Skipped": String(skipped.length),
      },
    });
  } catch (e) {
    console.error("OM service-docs bundle PDF error:", e);
    return NextResponse.json({ error: "สร้าง PDF รวมไม่สำเร็จ" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
