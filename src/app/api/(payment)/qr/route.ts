import { NextRequest, NextResponse } from "next/server";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { getDb } from "@/lib/db";

async function getPromptPayTaxId(): Promise<string> {
  const db = await getDb();
  const result = await db.request().query(`SELECT value FROM app_settings WHERE [key] = 'promptpay_tax_id'`);
  return result.recordset[0]?.value || "";
}

export async function GET(req: NextRequest) {
  const amount = parseFloat(req.nextUrl.searchParams.get("amount") || "0");
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const taxId = await getPromptPayTaxId();
  if (!taxId) {
    return NextResponse.json({ error: "PromptPay not configured" }, { status: 500 });
  }

  const payload = generatePayload(taxId, { amount });
  const format = req.nextUrl.searchParams.get("format");

  if (format === "image") {
    const buffer = await QRCode.toBuffer(payload, { width: 600, margin: 2, type: "png" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  }

  const qrDataUrl = await QRCode.toDataURL(payload, { width: 400, margin: 2 });
  return NextResponse.json({ qrDataUrl, amount, promptpay_tax_id: taxId });
}
