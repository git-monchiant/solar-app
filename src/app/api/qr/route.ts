import { NextRequest, NextResponse } from "next/server";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { createCanvas, loadImage } from "canvas";
import path from "path";

const PROMPTPAY_ID = "0859099890";
const formatPrice = (n: number) => new Intl.NumberFormat("th-TH").format(n);

export async function GET(req: NextRequest) {
  const amount = parseFloat(req.nextUrl.searchParams.get("amount") || "0");
  const name = req.nextUrl.searchParams.get("name") || "";
  if (amount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const format = req.nextUrl.searchParams.get("format");
  const payload = generatePayload(PROMPTPAY_ID, { amount });

  if (format === "full") {
    // Load template + overlay QR code
    const templatePath = path.join(process.cwd(), "public", "templates", "thaiqr.png");
    const templateImg = await loadImage(templatePath);
    const W = templateImg.width;
    const H = templateImg.height;

    // Template is 400x480. Header ~60px, PromptPay logo ~60-120px, QR area 130-460
    const qrSize = 340;
    const qrX = Math.round((W - qrSize) / 2);
    const qrY = 155;

    const qrBuffer = await QRCode.toBuffer(payload, { width: qrSize, margin: 2, type: "png" });
    const qrImage = await loadImage(qrBuffer);

    // Create canvas with template + QR + footer
    const totalH = H + 180;
    const canvas = createCanvas(W, totalH);
    const ctx = canvas.getContext("2d");

    // White background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, totalH);

    // Draw template
    ctx.drawImage(templateImg, 0, 0, W, H);

    // Overlay QR
    ctx.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

    // Footer — amount + promptpay
    const footerY = H + 10;
    ctx.fillStyle = "#9ca3af";
    ctx.font = "20px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(name ? `เงินมัดจำ : ${name}` : "เงินมัดจำ", W / 2, footerY + 20);

    ctx.fillStyle = "#111827";
    ctx.font = "bold 48px sans-serif";
    ctx.fillText(`${formatPrice(amount)} THB`, W / 2, footerY + 80);

    ctx.fillStyle = "#6b7280";
    ctx.font = "18px sans-serif";
    ctx.fillText(`PromptPay: ${PROMPTPAY_ID.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3")}`, W / 2, footerY + 115);

    const buffer = canvas.toBuffer("image/png");
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  }

  if (format === "image") {
    const buffer = await QRCode.toBuffer(payload, { width: 600, margin: 2, type: "png" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  }

  const qrDataUrl = await QRCode.toDataURL(payload, { width: 300, margin: 2 });
  return NextResponse.json({ qrDataUrl, amount, promptpay_id: PROMPTPAY_ID });
}
