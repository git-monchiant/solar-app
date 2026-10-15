// พิมพ์ใบบริการ O&M เป็น PDF — ★ ฝั่ง server เท่านั้น
// ย้ายออกมาจาก /api/om/jobs/[id]/doc 15 ต.ค. 69 (แผน 20261015-03) ให้ใบเดี่ยวกับไฟล์รวมทั้งแท็บปิดงาน
// (/api/om/jobs/docs) ใช้ตัวเดียวกัน — หน้าตาใบในไฟล์รวมจึงตรงกับใบเดี่ยวเสมอ
//
// ★ สูตรเดียวกับใบส่งมอบงานติดตั้งฝั่งขาย (puppeteer พิมพ์ HTML เป็น A4) แต่ไม่มีหน้า/ข้อมูลสาธารณะ
//   route ตรวจสิทธิ์ อ่านข้อมูลเอง แล้วตอบทุกคำขอของ puppeteer ผ่าน DOC_ORIGIN (ดักคำขอ)
//   · /doc         → HTML ของใบ
//   · /font/<w>    → ฟอนต์ DB Heavent จาก public/fonts (ตัวไทยขึ้นแน่นอนแม้เครื่อง server ไม่มีฟอนต์ไทย)
//   · /photo/<file> → รูปหน้างานจากที่เก็บนอก public/ (ไม่ต้องวนผ่าน API รูปที่ตรวจสิทธิ์ด้วย header)
//   คำขออื่นทั้งหมดถูกตัด — เอกสารไม่ออกไปโหลดอะไรจากข้างนอก
import { readFile } from "fs/promises";
import path from "path";
import puppeteer, { type Browser } from "puppeteer";
import sharp from "sharp";
import { sql } from "@/lib/db";
import { loadJobReport, loadQcSigner } from "@/lib/om/job-report";
import { isSafeName, mimeOfName, photoPath } from "@/lib/om/photo-store";
import { DOC_ORIGIN, renderServiceDocHtml, type ServiceDocInput } from "@/lib/om/service-doc";

const FONT_FILE: Record<string, string> = {
  "400": "db_heavent_v3.2-webfont.woff",
  "500": "db_heavent_med_v3.2-webfont.woff",
  "700": "db_heavent_bd_v3.2-webfont.woff",
};

export type BuiltServiceDoc = {
  bookingId: number;
  html: string;
  /** URL รูปใต้ DOC_ORIGIN ที่ใบนี้ขอได้ — กันขอไฟล์อื่นผ่านช่องรูป */
  photos: Set<string>;
  docNo: string;
  /** มีใบตรวจรับงานไหม — ไฟล์รวมข้ามใบที่ไม่มี */
  hasReport: boolean;
  job: { house_number: string | null; project_name: string | null; customer_name: string | null };
  report: { finished_at: string | null; result: string | null } | null;
};

/** อ่านข้อมูลใบงาน + ประกอบ HTML ของใบบริการ · ไม่พบใบงาน = null */
export async function buildServiceDoc(db: sql.ConnectionPool, id: number): Promise<BuiltServiceDoc | null> {
  const data = await loadJobReport(db, id);
  if (!data) return null;
  const rep = data.report as (ServiceDocInput["report"] & {
    tech_user_id?: number | null; qc_user_id?: number | null; photos?: { file: string; kind: string }[];
  }) | null;

  // ชื่อช่างที่กรอกใบ — ตาราง users อยู่ฐานเดียวกัน
  let techName: string | null = null;
  if (rep?.tech_user_id) {
    const u = await db.request().input("u", sql.Int, rep.tech_user_id).query(`SELECT full_name FROM users WHERE id = @u`);
    techName = u.recordset[0]?.full_name ?? null;
  }

  // ผู้ตรวจสอบ / Q.C. = ผู้ลงนามใบรับประกัน — ใบที่ลงผลแล้วใช้คนที่ล็อกไว้ ยังไม่ลงใช้คนที่ตั้งไว้ตอนนี้
  const qc = await loadQcSigner(db, rep?.qc_user_id);

  const photos = (rep?.photos ?? []).filter((p) => isSafeName(p.file)).map((p) => ({
    kind: p.kind, src: `${DOC_ORIGIN}/photo/${p.file}`, heic: /heic$/i.test(mimeOfName(p.file)),
  }));
  const html = renderServiceDocHtml({
    bookingId: id,
    job: data.job as ServiceDocInput["job"],
    report: rep,
    form: data.form as ServiceDocInput["form"],
    techName,
    qc,
    photos,
  });
  const job = data.job as BuiltServiceDoc["job"];
  return {
    bookingId: id, html,
    photos: new Set(photos.map((p) => p.src)),
    docNo: rep?.job_no ?? `OM-job-${id}`,
    hasReport: !!rep,
    job: { house_number: job.house_number ?? null, project_name: job.project_name ?? null, customer_name: job.customer_name ?? null },
    report: rep ? { finished_at: (rep as { finished_at?: string | null }).finished_at ?? null, result: rep.result ?? null } : null,
  };
}

export function launchDocBrowser() {
  return puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
  });
}

/** รูปในไฟล์รวม — ด้านยาวไม่เกิน 1200px · JPEG (รูปมือถือจริงใบละ 3–8 MB · 19 ใบเต็มขนาดได้ไฟล์หลายสิบ MB)
 *  ช่องรูปในใบกว้างครึ่งหน้า A4 (~85 มม.) 1200px พอสำหรับพิมพ์ · ย่อไม่ได้ (ไฟล์เสีย) = ส่งไฟล์เดิม */
async function shrinkPhoto(buf: Buffer): Promise<{ body: Buffer; type: string } | null> {
  try {
    const body = await sharp(buf).rotate().resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 72, mozjpeg: true }).toBuffer();
    return { body, type: "image/jpeg" };
  } catch { return null; }
}

/**
 * พิมพ์ HTML (ใบบริการ หรือหน้าสรุปของไฟล์รวม) เป็น PDF A4 ในเบราว์เซอร์ที่เปิดไว้แล้ว
 * ★ ตอบทุกคำขอของหน้าเองผ่าน DOC_ORIGIN — HTML · ฟอนต์ · รูปที่อยู่ในรายการของใบนี้เท่านั้น
 */
export async function printDocHtml(browser: Browser, html: string, allowedPhotos: Set<string>, opts?: { shrinkPhotos?: boolean }) {
  const page = await browser.newPage();
  try {
    await page.setRequestInterception(true);
    page.on("request", async (r) => {
      const url = r.url();
      try {
        if (url === `${DOC_ORIGIN}/doc`)
          return await r.respond({ status: 200, contentType: "text/html; charset=utf-8", body: html });
        if (url.startsWith(`${DOC_ORIGIN}/font/`)) {
          const f = FONT_FILE[url.slice(`${DOC_ORIGIN}/font/`.length).replace(/\.woff$/, "")];
          if (!f) return await r.respond({ status: 404, body: "" });
          return await r.respond({ status: 200, contentType: "font/woff",
            body: await readFile(path.join(process.cwd(), "public", "fonts", f)) });
        }
        // รูป — เฉพาะไฟล์ที่อยู่ในรายการของใบงานนี้ (กันขอไฟล์อื่นผ่านช่องนี้)
        if (url.startsWith(`${DOC_ORIGIN}/photo/`) && allowedPhotos.has(url)) {
          const p = await photoPath(url.slice(`${DOC_ORIGIN}/photo/`.length));
          if (!p) return await r.respond({ status: 404, body: "" });
          const buf = await readFile(p);
          const small = opts?.shrinkPhotos ? await shrinkPhoto(buf) : null;
          return await r.respond(small
            ? { status: 200, contentType: small.type, body: small.body }
            : { status: 200, contentType: mimeOfName(p), body: buf });
        }
        // data: (ลายเซ็น) ไม่ผ่าน interception อยู่แล้ว · อย่างอื่นทั้งหมดตัดทิ้ง
        return await r.abort();
      } catch {
        await r.abort().catch(() => {});
      }
    });

    await page.goto(`${DOC_ORIGIN}/doc`, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    return await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });
  } finally {
    await page.close().catch(() => undefined);
  }
}
