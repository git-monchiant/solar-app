import { NextRequest, NextResponse } from "next/server";
import generatePayload from "promptpay-qr";
import QRCode from "qrcode";
import { getDb } from "@/lib/db";

const BILL_PAYMENT_AID = "A000000677010112";

type BillerSettings = {
  mode: string;
  taxId: string;
  billerId: string;
  ref1: string;
  ref2: string;
  merchantName: string;
  terminal: string;
};

async function loadBillerSettings(): Promise<BillerSettings> {
  const db = await getDb();
  const result = await db.request().query(`
    SELECT [key], value FROM app_settings
    WHERE [key] IN (
      'promptpay_mode',
      'promptpay_tax_id',
      'promptpay_biller_id',
      'promptpay_ref1',
      'promptpay_ref2',
      'promptpay_merchant_name',
      'promptpay_terminal',
      'company_name'
    )
  `);
  const map: Record<string, string> = {};
  for (const row of result.recordset) map[row.key] = row.value || "";
  // Default merchant name = explicit override, else company_name, else generic.
  const merchantName = map.promptpay_merchant_name || map.company_name || "";
  return {
    mode: map.promptpay_mode || "credit_transfer",
    taxId: map.promptpay_tax_id || "",
    billerId: map.promptpay_biller_id || "",
    ref1: map.promptpay_ref1 || "",
    ref2: map.promptpay_ref2 || "",
    merchantName,
    terminal: map.promptpay_terminal || "",
  };
}

function tlv(tag: string, value: string): string {
  return tag + value.length.toString().padStart(2, "0") + value;
}

function crc16(data: string): string {
  let crc = 0xFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function buildBillPaymentPayload(opts: {
  billerId: string;
  ref1: string;
  ref2?: string;
  merchantName: string;
  terminal: string;
  amount: number;
}): string {
  const merchant =
    tlv("00", BILL_PAYMENT_AID) +
    tlv("01", opts.billerId) +
    tlv("02", opts.ref1) +
    (opts.ref2 ? tlv("03", opts.ref2.slice(0, 20)) : "");
  const hasAmount = opts.amount > 0;
  const core =
    tlv("00", "01") +
    tlv("01", hasAmount ? "12" : "11") +
    tlv("30", merchant) +
    tlv("53", "764") +
    (hasAmount ? tlv("54", opts.amount.toFixed(2)) : "") +
    tlv("58", "TH") +
    // Fall back to company_name from settings (loaded by caller as
    // merchantName) or a generic label so the QR is always self-describing.
    tlv("59", (opts.merchantName || "SENA SOLAR ENERGY").slice(0, 25)) +
    (opts.terminal ? tlv("62", tlv("07", opts.terminal)) : "");
  const withCrcPrefix = core + "6304";
  return withCrcPrefix + crc16(withCrcPrefix);
}

export async function GET(req: NextRequest) {
  const requestedAmount = parseFloat(req.nextUrl.searchParams.get("amount") || "0");
  const ref2Param = req.nextUrl.searchParams.get("ref2") || "";
  const leadIdParam = req.nextUrl.searchParams.get("lead_id") || "";
  const stepNoParam = req.nextUrl.searchParams.get("step_no") || "";
  if (requestedAmount <= 0) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const forcedAmount = parseFloat(process.env.QR_FORCE_AMOUNT || "");
  const testMode = forcedAmount > 0;
  const amount = testMode ? forcedAmount : requestedAmount;

  const cfg = await loadBillerSettings();
  const useBillPayment = cfg.mode === "bill_payment" && !!cfg.billerId && !!cfg.ref1;

  // Ref1 = configured prefix (e.g. "87UX") + per-payment tag "L<lead>S<step:2d>".
  // Max 20 chars per EMV spec; leading prefix is preserved so Digio still recognizes the merchant.
  const ref1Suffix = [
    leadIdParam && `L${leadIdParam}`,
    stepNoParam && `S${stepNoParam.padStart(2, "0")}`,
  ].filter(Boolean).join("");
  const ref1Value = (cfg.ref1 + ref1Suffix).slice(0, 20);

  let payload: string;
  if (useBillPayment) {
    payload = buildBillPaymentPayload({
      billerId: cfg.billerId,
      ref1: ref1Value,
      ref2: ref2Param || cfg.ref2 || undefined,
      merchantName: cfg.merchantName,
      terminal: cfg.terminal,
      amount,
    });
  } else {
    if (!cfg.taxId) {
      return NextResponse.json({ error: "PromptPay not configured" }, { status: 500 });
    }
    payload = generatePayload(cfg.taxId, { amount });
  }

  const format = req.nextUrl.searchParams.get("format");
  if (format === "image") {
    const buffer = await QRCode.toBuffer(payload, { width: 600, margin: 2, type: "png" });
    return new NextResponse(new Uint8Array(buffer), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  }

  const qrDataUrl = await QRCode.toDataURL(payload, { width: 400, margin: 2 });
  return NextResponse.json({
    qrDataUrl,
    amount,
    mode: useBillPayment ? "bill_payment" : "credit_transfer",
    test_mode: testMode,
    // Refs are only meaningful in bill_payment mode (Credit Transfer QRs have
    // no Ref fields). Returned so the UI can show them next to the QR for
    // post-transfer reconciliation.
    ref1: useBillPayment ? ref1Value : null,
    ref2: useBillPayment ? (ref2Param || cfg.ref2 || null) : null,
  });
}
