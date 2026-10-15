import { NextRequest, NextResponse } from "next/server";
import { requireAnyActiveRole } from "@/lib/auth";
import { getB2bDb } from "@/lib/b2b/db";
import { B2B_BOQ_VIEW_ROLES } from "@/lib/b2b/boq";
import { loadBoq, loadCategories } from "@/lib/b2b/boq-server";
import { boqFileName, buildBoqWorkbook } from "@/lib/b2b/boq-excel";

// ดาวน์โหลดใบ BOQ เป็นไฟล์ Excel — สร้างจากข้อมูลที่บันทึกแล้ว (ไม่ใช่ที่ค้างในหน้าจอ) · ทุก revision ดาวน์โหลดได้
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAnyActiveRole(req, B2B_BOQ_VIEW_ROLES);
  if (gate.error) return gate.error;
  const id = parseInt((await params).id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: "id ไม่ถูกต้อง" }, { status: 400 });
  const db = await getB2bDb();
  const [boq, categories] = await Promise.all([loadBoq(db, id), loadCategories(db)]);
  if (!boq) return NextResponse.json({ error: "ไม่พบใบ BOQ" }, { status: 404 });
  try {
    const { buffer } = await buildBoqWorkbook({ header: boq.header, lines: boq.lines, categories });
    const name = boqFileName(boq.header);
    const ascii = `${boq.header.doc_no}_Rev${boq.header.revision}.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("GET /api/b2b/boqs/[id]/excel error:", e);
    return NextResponse.json({ error: "สร้างไฟล์ Excel ไม่สำเร็จ" }, { status: 500 });
  }
}
