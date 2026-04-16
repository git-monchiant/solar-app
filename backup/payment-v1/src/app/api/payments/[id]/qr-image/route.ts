import { NextRequest, NextResponse } from "next/server";
import { getDb, sql } from "@/lib/db";
import QRCode from "qrcode";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const db = await getDb();
    const result = await db.request().input("id", sql.Int, parseInt(id))
      .query(`SELECT qr_paint_text FROM payment_transactions WHERE id = @id`);
    if (result.recordset.length === 0 || !result.recordset[0].qr_paint_text) {
      return new NextResponse("Not found", { status: 404 });
    }
    const buffer = await QRCode.toBuffer(result.recordset[0].qr_paint_text, {
      type: "png",
      width: 512,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    });
    return new NextResponse(buffer as unknown as BodyInit, {
      status: 200,
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("GET qr-image error:", error);
    return new NextResponse("Error", { status: 500 });
  }
}
