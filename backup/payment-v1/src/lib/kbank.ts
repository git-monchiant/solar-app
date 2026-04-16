import crypto from "crypto";

const API_URL = process.env.KBANK_API_URL || "";
const SECRET_KEY = process.env.KBANK_SECRET_KEY || "";

export interface KBankCreateQRResponse {
  id: string;
  object: string;
  order_id: string;
  account_name: string;
  paint_text: string;
  image_with_base64: string;
  sof_support: { code: string; desc: string; icon_url?: string }[];
  status: string;
  created: string;
  livemode: boolean;
  failure_code: string | null;
  failure_message: string | null;
  expire_time_seconds: number;
}

export interface KBankInquiryResponse {
  id: string;
  object: string;
  created: string;
  livemode: boolean;
  amount: number;
  currency: string;
  description: string;
  source: { id: string; object: string; brand: string };
  status: string;
  order_id: string;
  transaction_state: string;
  reference_order: string;
  failure_code: string | null;
  failure_message: string | null;
}

export interface KBankWebhookBody {
  id: string;
  order_id: string;
  object: string;
  amount: number;
  currency: string;
  transaction_state: string;
  source: { id: string; object: string; brand: string };
  created: string;
  status: string;
  reference_order: string;
  description: string;
  livemode: boolean;
  failure_code: string;
  failure_message: string;
  checksum: string;
}

async function kbankFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": SECRET_KEY,
      ...(init?.headers || {}),
    },
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`KBank API non-JSON response: ${text.slice(0, 300)}`);
  }
  if (!res.ok) {
    throw new Error(`KBank API ${res.status}: ${text.slice(0, 300)}`);
  }
  return json as T;
}

export async function createThaiQR(params: {
  amount: number;
  referenceOrder: string;
  description: string;
}): Promise<KBankCreateQRResponse> {
  return kbankFetch<KBankCreateQRResponse>("/qr/v2/qr", {
    method: "POST",
    body: JSON.stringify({
      amount: params.amount,
      currency: "THB",
      description: params.description,
      sof: "ThaiQR",
      reference_order: params.referenceOrder,
    }),
  });
}

export async function inquiryQR(chargeOrOrderId: string): Promise<KBankInquiryResponse> {
  return kbankFetch<KBankInquiryResponse>(`/qr/v2/qr/${chargeOrOrderId}`, { method: "GET" });
}

export async function cancelQR(qrId: string): Promise<{ status: string }> {
  return kbankFetch(`/qr/v2/qr/${qrId}/cancel`, { method: "POST" });
}

export function verifyWebhookChecksum(body: KBankWebhookBody): boolean {
  const amountStr = body.amount != null ? body.amount.toFixed(4) : "null";
  const initString = [
    body.id,
    amountStr,
    body.currency,
    body.status,
    body.transaction_state,
    body.failure_code ?? "",
    SECRET_KEY,
  ].join("");
  const hash = crypto.createHash("sha256").update(initString).digest("hex");
  return hash === body.checksum;
}

export function isPaymentAuthorized(body: Pick<KBankWebhookBody, "status" | "transaction_state">): boolean {
  return body.status === "success" && body.transaction_state === "Authorized";
}
