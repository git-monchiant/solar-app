import { readFileSync } from "fs";
import { join } from "path";
import { launchDocBrowser } from "@/lib/om/service-doc-pdf";
import { sql } from "./db";
import { editableStatus, type QuoteStatus } from "./quotation";
import { buildSnapshot, type QuoteSnapshot } from "./quotation-server";
import { renderQuoteHtml, WATERMARK, type DocSigner } from "./quotation-doc";

// พิมพ์ใบเสนอราคา B2B — ★ ฝั่ง server เท่านั้น (แผน 20261015-07 เฟส 2)
// ร่าง/ส่งกลับแก้ = ข้อมูลสดจากโครงการ (ลายน้ำ DRAFT) · ส่งอนุมัติแล้ว = snapshot ที่แช่ไว้ + ชื่อ/ลายเซ็นที่แช่ตอนกด
// ฟอนต์ + โลโก้ฝังเป็น data URL (ไม่มีคำขอออกนอกหน้า) · หน้ากระดาษตาม @page (เนื้อหาไหลข้ามหน้าเองถ้าหมายเหตุยาว)

const font = (w: number, f: string) =>
  `@font-face { font-family: "DBHeavent"; font-weight: ${w}; src: url(data:font/woff;base64,${readFileSync(join(process.cwd(), "public", "fonts", f)).toString("base64")}) format("woff"); }`;
let assetsCache: { fontFaces: string; logo: string } | null = null;
const assets = () => (assetsCache ??= {
  fontFaces: [font(400, "db_heavent_v3.2-webfont.woff"), font(500, "db_heavent_med_v3.2-webfont.woff"), font(700, "db_heavent_bd_v3.2-webfont.woff")].join("\n"),
  logo: `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "logos", "logo-sena.png")).toString("base64")}`,
});

const dataUrl = (data: unknown, mime: unknown) =>
  data ? `data:${typeof mime === "string" && mime ? mime : "image/png"};base64,${Buffer.from(data as Buffer).toString("base64")}` : null;

type Queryable = { request(): sql.Request };

export async function buildQuoteHtml(db: Queryable, id: number): Promise<{ html: string; docNo: string; revision: number } | null> {
  const q = (await db.request().input("id", sql.Int, id).query(`
    SELECT status, created_by, snapshot_json, proposer_name, submitted_at, proposer_sig, proposer_sig_mime,
           r1_name, r1_at, r1_sig, r1_sig_mime, r2_name, r2_at, r2_sig, r2_sig_mime, r3_name, r3_at, r3_sig, r3_sig_mime
    FROM b2b_quotations WHERE id = @id`)).recordset[0];
  if (!q) return null;
  const status = q.status as QuoteStatus;
  const live = editableStatus(status) || !q.snapshot_json;
  const snap: QuoteSnapshot | null = live ? await buildSnapshot(db, id, q.created_by) : JSON.parse(q.snapshot_json);
  if (!snap) return null;
  const signer = (name: unknown, at: unknown, sig: unknown, mime: unknown): DocSigner =>
    ({ name: (name as string) ?? null, date: at ? String(at instanceof Date ? at.toISOString() : at) : null, signature: dataUrl(sig, mime) });
  const signers = live
    ? { proposer: { name: snap.proposer.name, date: null, signature: null }, r1: signer(null, null, null, null), r2: signer(null, null, null, null), r3: signer(null, null, null, null) }
    : {
        proposer: signer(q.proposer_name, q.submitted_at, q.proposer_sig, q.proposer_sig_mime),
        r1: signer(q.r1_name, q.r1_at, q.r1_sig, q.r1_sig_mime),
        r2: signer(q.r2_name, q.r2_at, q.r2_sig, q.r2_sig_mime),
        r3: signer(q.r3_name, q.r3_at, q.r3_sig, q.r3_sig_mime),
      };
  return { html: renderQuoteHtml(snap, signers, WATERMARK[status] ?? null, assets()), docNo: snap.doc_no, revision: snap.revision };
}

export async function printQuotePdf(html: string, footer: string): Promise<Uint8Array> {
  const browser = await launchDocBrowser();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    return await page.pdf({
      preferCSSPageSize: true, printBackground: true, displayHeaderFooter: true,
      headerTemplate: "<span></span>",
      // ส่วนท้ายพิมพ์คนละบริบทกับหน้า (ฟอนต์ไทยในหน้าไม่ตามมา) — ใช้ตัวอักษรอังกฤษ/ตัวเลขล้วน
      footerTemplate: `<div style="font-size:8px;color:#9ca3af;width:100%;padding:0 13mm;text-align:right;font-family:Arial,sans-serif">${footer.replace(/[<>&]/g, "")} &middot; Page <span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    });
  } finally {
    await browser.close().catch(() => undefined);
  }
}
