import { NextRequest, NextResponse } from "next/server";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";

const PROMPTPAY_ID = "0859099890";

export async function GET(req: NextRequest) {
  const amount = parseFloat(req.nextUrl.searchParams.get("amount") || "0");
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const payload = generatePayload(PROMPTPAY_ID, { amount });
  const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });

  return NextResponse.json({ qrDataUrl, amount, promptpay_id: PROMPTPAY_ID });
}
