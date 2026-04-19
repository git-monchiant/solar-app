import { NextRequest, NextResponse } from "next/server";

interface SlipData {
  is_slip: boolean;
  amount: number | null;
  recipient_name: string | null;
  recipient_account: string | null;
  sender_name: string | null;
  sender_account: string | null;
  bank: string | null;
  datetime: string | null;
  reference: string | null;
}

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) return NextResponse.json({ is_slip: false });

    // Temporary bypass: Gemini quota is tight, skip verification — trust upload.
    // Re-enable by unsetting SKIP_VERIFY_SLIP (or deleting this block).
    if (process.env.SKIP_VERIFY_SLIP === "1") {
      return NextResponse.json({ is_slip: true, amount: null, recipient_name: null, recipient_account: null, sender_name: null, sender_account: null, bank: null, datetime: null, reference: null });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ is_slip: false, error: "No API key" });

    const fullUrl = imageUrl.startsWith("/") ? `http://localhost:${process.env.PORT || 3700}${imageUrl}` : imageUrl;
    const imgRes = await fetch(fullUrl);
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuf).toString("base64");
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    const prompt = `ภาพนี้เป็น **สลิปโอนเงินจริง** จากแอปธนาคาร/PromptPay/e-Wallet ที่มีการทำรายการโอนเงินสำเร็จหรือไม่?

ต้องเข้าเกณฑ์ **ทุกข้อ** จึงถือเป็น slip จริง (is_slip: true):
1. มีข้อความยืนยันว่าโอนเงินสำเร็จ เช่น "โอนเงินสำเร็จ", "Transfer Successful", "ทำรายการสำเร็จ", "เรียบร้อย"
2. มี **จำนวนเงินที่โอน** ชัดเจน
3. มี **ชื่อผู้รับเงิน** (หรือเลขบัญชี/พร้อมเพย์)
4. มี **วันเวลาที่โอน**
5. มีโลโก้/ชื่อธนาคารหรือผู้ให้บริการ

**ไม่ใช่ slip** ถ้า:
- เป็น QR code สำหรับสแกน (ยังไม่ได้จ่าย)
- เป็นหน้ายืนยันก่อนโอน (ยังไม่กด confirm)
- เป็นภาพอื่น: meme, รูปคน, บัตร, บิล, screenshot แชท, ฯลฯ

ถ้าเป็น slip จริง → return raw JSON:
{
  "is_slip": true,
  "amount": <ยอดที่โอนเป็น number>,
  "recipient_name": "<ชื่อผู้รับ>",
  "recipient_account": "<บัญชี/พร้อมเพย์ผู้รับ>",
  "sender_name": "<ชื่อผู้โอน>",
  "sender_account": "<บัญชี/พร้อมเพย์ผู้โอน>",
  "bank": "<ธนาคาร เช่น KBANK, SCB, BBL>",
  "datetime": "<วันเวลา>",
  "reference": "<ref/รหัส transaction>"
}

ถ้าไม่ใช่ → return: {"is_slip": false}

ห้ามใส่ markdown ห้ามใส่ code block return JSON ดิบเท่านั้น`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
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
    if (!jsonMatch) return NextResponse.json({ is_slip: false });

    const parsed = JSON.parse(jsonMatch[0]) as Partial<SlipData>;
    if (!parsed.is_slip) return NextResponse.json({ is_slip: false });

    const amount = typeof parsed.amount === "number" ? parsed.amount
      : typeof parsed.amount === "string" ? parseFloat(String(parsed.amount).replace(/,/g, "")) : null;

    return NextResponse.json({
      is_slip: true,
      amount: isNaN(amount as number) ? null : amount,
      recipient_name: parsed.recipient_name || null,
      recipient_account: parsed.recipient_account || null,
      sender_name: parsed.sender_name || null,
      sender_account: parsed.sender_account || null,
      bank: parsed.bank || null,
      datetime: parsed.datetime || null,
      reference: parsed.reference || null,
    });
  } catch (error) {
    console.error("verify-slip error:", error);
    return NextResponse.json({ is_slip: false });
  }
}
