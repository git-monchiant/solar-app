import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { B2B_QUOTE_VIEW_ROLES } from "@/lib/b2b/quotation";
import { buildQuoteHtml, printQuotePdf } from "@/lib/b2b/quotation-pdf";

// PDF ใบเสนอราคา B2B — ตรวจ role ทุกครั้ง (Solar B2B · ผู้ตรวจสอบ 3 ชั้น · admin) · ?format=html = ดูตัวอย่างในหน้า
// ?download=1 = ดาวน์โหลด (ค่าเริ่มต้นเปิดในแท็บ) · ไฟล์ตั้งชื่อตามเลขที่ + Rev
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_QUOTE_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const built = await buildQuoteHtml(await getB2bDb(), id);
  if (!built) return NextResponse.json({ error: "ไม่พบใบเสนอราคา" }, { status: 404 });
  if (req.nextUrl.searchParams.get("format") === "html") {
    return new NextResponse(built.html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  }
  try {
    const name = `${built.docNo}${built.revision > 0 ? `_Rev${built.revision}` : ""}.pdf`;
    const pdf = await printQuotePdf(built.html, `${built.docNo}${built.revision > 0 ? ` Rev.${built.revision}` : ""}`);
    const disp = req.nextUrl.searchParams.get("download") === "1" ? "attachment" : "inline";
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${disp}; filename="${name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /api/b2b/quotations/[id]/pdf error:", e);
    return NextResponse.json({ error: "สร้าง PDF ไม่สำเร็จ" }, { status: 500 });
  }
}
