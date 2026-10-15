import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import puppeteer from "puppeteer";
import { requireAuth } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getOmDb } from "@/lib/om/line";
import { loadJobReport, loadQcSigner } from "@/lib/om/job-report";
import { isSafeName, mimeOfName, photoPath } from "@/lib/om/photo-store";
import { DOC_ORIGIN, renderServiceDocHtml, type ServiceDocInput } from "@/lib/om/service-doc";
import { buildContentDisposition } from "@/lib/doc-filename";

// GET /api/om/jobs/[id]/doc — ใบบริการ PDF (แผน 20260928-04 ข้อ 9 · ผู้ใช้เคาะ 28 ก.ย. 69)
// ★ สูตรเดียวกับใบส่งมอบงานติดตั้งฝั่งขาย (puppeteer พิมพ์ HTML เป็น A4) แต่ไม่มีหน้า/ข้อมูลสาธารณะ
//   route นี้ตรวจสิทธิ์ อ่านข้อมูลเอง แล้วตอบทุกคำขอของ puppeteer ผ่าน DOC_ORIGIN (ดักคำขอ)
//   · /doc         → HTML ของใบ
//   · /font/<w>    → ฟอนต์ DB Heavent จาก public/fonts (ตัวไทยขึ้นแน่นอนแม้เครื่อง server ไม่มีฟอนต์ไทย)
//   · /photo/<file> → รูปหน้างานจากที่เก็บนอก public/ (ไม่ต้องวนผ่าน API รูปที่ตรวจสิทธิ์ด้วย header)
//   คำขออื่นทั้งหมดถูกตัด — เอกสารไม่ออกไปโหลดอะไรจากข้างนอก
// ★ หน้าเว็บเปิดด้วย fetch ที่แนบ header แล้วเปิดเป็น blob (ServiceDocButton) — ไม่ใช้ ?user_id= ใน URL

const FONT_FILE: Record<string, string> = {
  "400": "db_heavent_v3.2-webfont.woff",
  "500": "db_heavent_med_v3.2-webfont.woff",
  "700": "db_heavent_bd_v3.2-webfont.woff",
};

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });

  const db = await getOmDb();
  const data = await loadJobReport(db, id);
  if (!data) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });
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
  const allowedPhotos = new Set(photos.map((p) => p.src));

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-crash-reporter"],
    });
    const page = await browser.newPage();
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
          return await r.respond({ status: 200, contentType: mimeOfName(p), body: await readFile(p) });
        }
        // data: (ลายเซ็น) ไม่ผ่าน interception อยู่แล้ว · อย่างอื่นทั้งหมดตัดทิ้ง
        return await r.abort();
      } catch {
        await r.abort().catch(() => {});
      }
    });

    await page.goto(`${DOC_ORIGIN}/doc`, { waitUntil: "load", timeout: 30000 });
    await page.evaluate(() => (document as unknown as { fonts: { ready: Promise<unknown> } }).fonts.ready);
    const bytes = await page.pdf({ format: "A4", printBackground: true, margin: { top: "0", right: "0", bottom: "0", left: "0" } });

    const docNo = (rep?.job_no ?? `OM-job-${id}`).replace(/[^A-Za-z0-9_-]/g, "_");
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition({
          base: docNo, ext: "pdf",
          customerName: (data.job as { customer_name?: string | null }).customer_name ?? null,
          disposition: download ? "attachment" : "inline",
        }),
        // ใบมีลายเซ็น + รูปบ้านลูกค้า — ห้าม proxy/CDN เก็บไว้
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("OM service-doc PDF error:", e);
    return NextResponse.json({ error: "สร้างใบบริการ PDF ไม่สำเร็จ" }, { status: 500 });
  } finally {
    if (browser) await browser.close().catch(() => undefined);
  }
}
