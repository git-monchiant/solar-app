import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getOmDb } from "@/lib/om/line";
import { buildServiceDoc, launchDocBrowser, printDocHtml } from "@/lib/om/service-doc-pdf";
import { buildContentDisposition } from "@/lib/doc-filename";

// GET /api/om/jobs/[id]/doc — ใบบริการ PDF (แผน 20260928-04 ข้อ 9 · ผู้ใช้เคาะ 28 ก.ย. 69)
// ★ ตัวสร้างใบ (อ่านข้อมูล + HTML + ดักคำขอฟอนต์/รูปผ่าน DOC_ORIGIN) ย้ายไป src/lib/om/service-doc-pdf.ts
//   15 ต.ค. 69 (แผน 20261015-03) — ใช้ร่วมกับไฟล์รวมทั้งแท็บปิดงาน (/api/om/jobs/docs) หน้าตาจึงตรงกันเสมอ
// ★ หน้าเว็บเปิดด้วย fetch ที่แนบ header แล้วเปิดเป็น blob (ServiceDocButton) — ไม่ใช้ ?user_id= ใน URL

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAuth(req);
  if (gate.error) return gate.error;
  const id = Number((await ctx.params).id);
  if (!id) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });

  const db = await getOmDb();
  const doc = await buildServiceDoc(db, id);
  if (!doc) return NextResponse.json({ error: "ไม่พบใบงานนี้" }, { status: 404 });

  let browser: Awaited<ReturnType<typeof launchDocBrowser>> | null = null;
  try {
    browser = await launchDocBrowser();
    const bytes = await printDocHtml(browser, doc.html, doc.photos);

    const docNo = doc.docNo.replace(/[^A-Za-z0-9_-]/g, "_");
    const download = req.nextUrl.searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": buildContentDisposition({
          base: docNo, ext: "pdf",
          customerName: doc.job.customer_name,
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
