import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

type DocType = "slip" | "cheque" | "paper" | "other";

interface VisualCues {
  // Hard yes/no questions about the IMAGE itself (not what we wish it was)
  has_success_message: boolean;   // "โอนเงินสำเร็จ", "Transfer Successful", "Success"
  has_qr_code_dominant: boolean;  // QR code occupies a large portion of the image
  shows_form_or_app_ui: boolean;  // Generic app screen: form fields, lists, menus
  shows_bank_logo: boolean;       // Visible bank/e-wallet logo
  is_cheque: boolean;             // Paper cheque with signature line + cheque number
}

interface SlipData extends VisualCues {
  amount: number | null;
  recipient_name: string | null;
  recipient_account: string | null;
  sender_name: string | null;
  sender_account: string | null;
  bank: string | null;
  datetime: string | null;
  reference: string | null;
  ref1: string | null;
  ref2: string | null;
  trans_id: string | null;
  cheque_no: string | null;
}

export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) return NextResponse.json({ is_slip: false, doc_type: "other" });

    const skipVerify = process.env.SKIP_VERIFY_SLIP === "1";
    if (skipVerify) {
      // Bypass Gemini entirely — quota concerns or temporary disable.
      // Upload always accepted; admin reviews the slip image manually.
      return NextResponse.json({ is_slip: true, doc_type: null, amount: null, recipient_name: null, recipient_account: null, sender_name: null, sender_account: null, bank: null, datetime: null, reference: null, ref1: null, ref2: null, trans_id: null, cheque_no: null });
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ is_slip: false, doc_type: "other", error: "No API key" });

    const fullUrl = imageUrl.startsWith("/") ? `http://localhost:${process.env.PORT || 3700}${imageUrl}` : imageUrl;
    const imgRes = await fetch(fullUrl);
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuf).toString("base64");
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    const prompt = `อ่านภาพแล้วตอบเฉพาะที่เห็นในภาพจริง — ห้ามเดา ถ้าไม่เห็นให้ตอบ false หรือ null

ตอบ visual yes/no (ตามที่เห็นจริงในภาพ):
- has_success_message: เห็นข้อความ "โอนเงินสำเร็จ" / "Transfer Successful" / "ทำรายการสำเร็จ" / "เรียบร้อย" / "Success" หรือไม่?
- has_qr_code_dominant: ภาพหลักเป็น QR code ขนาดใหญ่ครอบคลุมพื้นที่ส่วนใหญ่หรือไม่?
- shows_form_or_app_ui: เป็นหน้าจอ app/website ทั่วไป (ฟอร์มกรอกข้อมูล, รายชื่อ, dashboard, เมนู) หรือไม่?
- shows_bank_logo: เห็นโลโก้ธนาคารหรือ e-wallet ชัดเจน (KBANK/SCB/BBL/KTB/BAY/TMB/TrueMoney) หรือไม่?
- is_cheque: เป็นเช็คกระดาษ (มีเลขเช็ค + ลายเซ็นสั่งจ่าย) หรือไม่?

แล้วอ่าน text เท่าที่เห็นจริง — ไม่เห็น/ไม่แน่ใจ → null:

return raw JSON เท่านั้น (ห้าม markdown/code block):
{
  "has_success_message": <true|false>,
  "has_qr_code_dominant": <true|false>,
  "shows_form_or_app_ui": <true|false>,
  "shows_bank_logo": <true|false>,
  "is_cheque": <true|false>,
  "amount": <number|null>,
  "recipient_name": <string|null>,
  "recipient_account": <string|null>,
  "sender_name": <string|null>,
  "sender_account": <string|null>,
  "bank": <string|null>,
  "datetime": <"YYYY-MM-DDTHH:mm:ss" (พ.ศ.→ค.ศ.) | null>,
  "reference": <string|null>,
  "ref1": <string|null>,
  "ref2": <string|null>,
  "trans_id": <string|null>,
  "cheque_no": <string|null>
}

กฎสำคัญ: ถ้าไม่เห็นในภาพ → ตอบ null/false ห้ามแต่งขึ้นมา`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType, data: base64 } },
          ],
        }],
      }),
    });

    const geminiData: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>; error?: { code?: number; message?: string; status?: string }; promptFeedback?: unknown } = await geminiRes.json();
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    if (!textContent) {
      console.error("[verify-slip] Gemini empty response:", JSON.stringify(geminiData).slice(0, 500));
    } else {
      console.log("[verify-slip] Gemini raw:", textContent);
    }

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ is_slip: false, doc_type: "other" });

    const parsed = JSON.parse(jsonMatch[0]) as Partial<SlipData>;

    const amount = typeof parsed.amount === "number" ? parsed.amount
      : typeof parsed.amount === "string" ? parseFloat(String(parsed.amount).replace(/,/g, "")) : null;
    const finalAmount = isNaN(amount as number) ? null : amount;

    // Server-side classification based on visual cues — Gemini just describes
    // what it sees; we make the decision so the model can't hallucinate a
    // category to please the user.
    // Tx evidence — real slips always have a unique transaction id; QR/form
    // screens never do. Also require sender info — receipts/QRs typically
    // don't show a remitting account.
    const hasTxEvidence = !!(parsed.trans_id || parsed.ref2 || parsed.reference);
    const hasSender = !!(parsed.sender_name || parsed.sender_account);
    const hasRecipient = !!(parsed.recipient_name || parsed.recipient_account);

    let docType: DocType = "other";
    if (parsed.is_cheque && parsed.cheque_no) {
      docType = "cheque";
    } else if (
      parsed.has_success_message
      && parsed.shows_bank_logo
      && !parsed.has_qr_code_dominant   // QR-request screens still get rejected
      && finalAmount !== null
      && hasTxEvidence                   // real slips have a unique tx id
      && hasSender                       // real slips show the remitter
      && hasRecipient                    // real slips show the payee
      && !!parsed.datetime               // real slips have a timestamp
    ) {
      // NOTE: shows_form_or_app_ui is NOT a disqualifier — bank slips ARE
      // rendered inside an app UI. A QR/form screenshot fails the
      // hasTxEvidence + hasSender + hasRecipient checks above instead.
      docType = "slip";
    } else if (
      finalAmount !== null
      && hasTxEvidence
      && parsed.datetime
      && !parsed.has_qr_code_dominant
    ) {
      docType = "paper";
    }

    console.log("[verify-slip] classified:", { docType, cues: { has_success_message: parsed.has_success_message, has_qr_code_dominant: parsed.has_qr_code_dominant, shows_form_or_app_ui: parsed.shows_form_or_app_ui, shows_bank_logo: parsed.shows_bank_logo, is_cheque: parsed.is_cheque }, finalAmount });

    return NextResponse.json({
      // SKIP_VERIFY_SLIP = the upload is always accepted; doc_type is just
      // a hint for display. Without skip, doc_type === "other" gates the upload.
      is_slip: skipVerify ? true : docType !== "other",
      doc_type: docType,
      amount: finalAmount,
      recipient_name: parsed.recipient_name || null,
      recipient_account: parsed.recipient_account || null,
      sender_name: parsed.sender_name || null,
      sender_account: parsed.sender_account || null,
      bank: parsed.bank || null,
      datetime: parsed.datetime || null,
      reference: parsed.reference || null,
      ref1: parsed.ref1 || null,
      ref2: parsed.ref2 || null,
      trans_id: parsed.trans_id || null,
      cheque_no: parsed.cheque_no || null,
    });
  } catch (error) {
    console.error("verify-slip error:", error);
    return NextResponse.json({ is_slip: false, doc_type: "other" });
  }
}
