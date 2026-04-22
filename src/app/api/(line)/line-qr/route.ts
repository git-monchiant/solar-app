import { NextResponse } from "next/server";
import QRCode from "qrcode";

// SENA SOLAR LINE Official Account add-friend URL.
const LINE_OA_URL = "https://line.me/R/ti/p/@092uxarn";

export async function GET() {
  const buffer = await QRCode.toBuffer(LINE_OA_URL, { width: 600, margin: 2, type: "png" });
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
