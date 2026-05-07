import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// Per-request budget — Gemini Vision on dense Thai text can take 30-50s end
// to end. Default Next maxDuration would cut us off mid-call.
export const maxDuration = 60;
export const runtime = "nodejs";

const FIELD_HINTS: Record<string, string> = {
  full_name: "ชื่อ-สกุลของบุคคล/ผู้ใช้ไฟ/ผู้ถือบัตร ภาษาไทย (ไม่ต้องใส่คำนำหน้า นาย/นาง/นางสาว)",
  id_card_number: "เลขบัตรประชาชน 13 หลัก (ถ้าเป็นบิลค่าไฟอาจไม่มี ให้ใส่ null)",
  id_card_address: "ที่อยู่ตามบัตรประชาชน (ถ้าเป็นบิลค่าไฟอาจไม่มี ให้ใส่ null)",
  phone: "เบอร์โทรศัพท์",
  installation_address: "ที่อยู่ติดตั้ง/ที่อยู่ผู้ใช้ไฟ (บ้านเลขที่ ซอย ถนน ตำบล อำเภอ จังหวัด) — ถ้าเป็นบิลค่าไฟให้ใช้ที่อยู่ของผู้ใช้ไฟที่ปรากฏบนบิล",
  meter_number: "เลขมิเตอร์ไฟฟ้า",
  ca_number: "เลขผู้ใช้ไฟ CA",
  monthly_bill: "ค่าไฟต่อเดือน (ตัวเลข)",
  utility: "การไฟฟ้า (MEA หรือ PEA)",
  peak_usage: "ช่วงใช้ไฟสูงสุด (เช้า/บ่าย/เย็น)",
};

export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { imageUrl, fields } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "No imageUrl" }, { status: 400 });

    const requestedFields: string[] = Array.isArray(fields) && fields.length > 0
      ? fields.filter((f: unknown): f is string => typeof f === "string" && FIELD_HINTS[f] !== undefined)
      : Object.keys(FIELD_HINTS);
    const schemaBlock = "{\n" + requestedFields.map(f => `  "${f}": "${FIELD_HINTS[f]}"`).join(",\n") + "\n}";

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    // Fetch image and convert to base64
    const fullUrl = imageUrl.startsWith("/") ? `http://localhost:${process.env.PORT || 3700}${imageUrl}` : imageUrl;
    const imgRes = await fetch(fullUrl);
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuf).toString("base64");
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    // Call Gemini Vision (with retry on 503)
    const buildRequest = () => ({
      method: "POST" as const,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `คุณเป็น OCR สำหรับเอกสารไทย — บัตรประชาชน, ทะเบียนบ้าน, บิลค่าไฟ, สลิปโอนเงิน
อ่านภาพแล้ว return raw JSON object **ห้าม markdown ห้าม backtick ห้ามอธิบาย** ขึ้น { จบ } เท่านั้น

schema:
{
  "doc_type": "id_card | house_registration | electricity_bill | bank_slip | envelope | other",
  "people": [],
  "addresses": [],
  "id_card_numbers": [],
  "ca_numbers": [],
  "meter_numbers": [],
  "phones": [],
  "utility_provider": null,
  "amounts": [],
  "monthly_bill": null,
  "dates": [],
  "other_text": []
}

กฎการอ่าน (สำคัญมาก ห้ามผิด):

1. **doc_type** — ระบุให้ถูกต้องตามที่เห็นจริง:
   - "id_card" = มีคำว่า "บัตรประจำตัวประชาชน" หรือ "Thai National ID Card"
   - "house_registration" = มีคำว่า "ทะเบียนบ้าน" หรือ "เลขรหัสประจำบ้าน"
   - "electricity_bill" = มีโลโก้/ชื่อ การไฟฟ้านครหลวง (MEA) หรือ การไฟฟ้าส่วนภูมิภาค (PEA)
   - "bank_slip" = สลิปโอนเงิน มีคำว่า "โอนเงินสำเร็จ", "ใบเสร็จการโอน", PromptPay, etc.
   - "envelope" = ซองจดหมาย/ซองพัสดุ มี "ผู้ส่ง"/"ผู้รับ"/"กรุณาส่ง"/แสตมป์ หรือเป็นรูปซองชัดเจน
   - "other" = ใช้เมื่อไม่ตรงกับ 5 อันบน

2. **people** — ชื่อ-สกุลของ "เจ้าของเอกสาร" เท่านั้น
   - บัตร ปชช → ชื่อใต้คำว่า "ชื่อ-สกุล/Name"
   - ทะเบียนบ้าน → ชื่อ "เจ้าบ้าน" หรือ "หัวหน้าครอบครัว"
   - บิลค่าไฟ → ชื่อ "ผู้ใช้ไฟฟ้า"
   - ซองจดหมาย → ชื่อ "ผู้รับ" (NOT ผู้ส่ง) เพราะลูกค้าคือผู้รับซอง
   - สลิป → **อย่าใส่อะไรใน people** (ชื่อผู้โอน/ผู้รับ ไม่ใช่เจ้าของลีด)
   - ตัดคำนำหน้า นาย/นาง/นางสาว/น.ส./ด.ช./ด.ญ./Mr./Mrs./Miss ออก
   - ตัดชื่อภาษาอังกฤษ (transliteration) ออก เก็บแต่ภาษาไทย ถ้ามีทั้งคู่

3. **addresses** — ที่อยู่ของเจ้าของเอกสารเท่านั้น (อย่าใส่ที่อยู่ของบริษัท/หน่วยงาน/โลโก้บนเอกสาร)
   - บัตร ปชช → ที่อยู่ใต้คำว่า "ที่อยู่/Address"
   - ทะเบียนบ้าน → ที่อยู่บ้าน
   - บิลค่าไฟ → ที่อยู่ผู้ใช้ไฟ (ไม่ใช่ที่อยู่การไฟฟ้า)
   - ซองจดหมาย → **ที่อยู่ผู้รับ** (ส่วนใหญ่เขียนใหญ่อยู่กลาง/ขวา) — **ห้ามใช้ที่อยู่ผู้ส่ง** (มุมซ้ายบน)
   - **format ที่อยู่ครบเต็ม**: เลขที่ ซอย/หมู่ ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์
   - สลิป → ใส่ [] ว่าง

4. **id_card_numbers** — เลข **13 หลัก** เท่านั้น (รูปแบบ x-xxxx-xxxxx-xx-x หรือ xxxxxxxxxxxxx) จากบัตร ปชช หรือทะเบียนบ้าน
5. **ca_numbers** — เลขผู้ใช้ไฟ จากบิลค่าไฟ
6. **meter_numbers** — เลขมิเตอร์ไฟฟ้า จากบิลค่าไฟ
7. **phones** — เบอร์โทร (มือถือ ขึ้น 06/08/09)
8. **utility_provider** — "MEA" / "PEA" / null
9. **monthly_bill** — ยอดรวมค่าไฟ (จำนวนเงินที่ต้องชำระทั้งหมด) เป็น string ตัวเลขล้วน

**ถ้าไม่เห็น/ไม่แน่ใจ field ไหน → ใส่ [] หรือ null** อย่าเดาเด็ดขาด เพราะข้อมูลผิดเสียหายกว่าไม่มีข้อมูล`
              },
              {
                inlineData: { mimeType, data: base64 }
              }
            ]
          }]
        }),
      });

    // Stick with gemini-2.5-flash (not flash-lite) — Thai ID cards need the
    // extra accuracy on small text + handwritten-looking serif font. Speed
    // wins come from image compression + reduced timeout, not the model swap.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    // Per-attempt timeout: 25s × 2 attempts = ~52s worst case. Tested: flash
    // on Thai ID card sometimes takes 30-45s end-to-end (model is slow on
    // dense Thai text). 8s caused all calls to abort; 25s gives the slow path
    // room to finish on the first try, retry only catches actual hangs.
    const fetchWithTimeout = async (ms: number) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), ms);
      try {
        return await fetch(endpoint, { ...buildRequest(), signal: ctrl.signal });
      } finally {
        clearTimeout(t);
      }
    };
    let geminiRes: Response | null = null;
    let geminiData: { error?: { code?: number; status?: string }; candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> } = {};
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        geminiRes = await fetchWithTimeout(25_000);
        geminiData = await geminiRes.json();
        if (geminiRes.ok) break;
        const status = geminiData.error?.code;
        if (status !== 503 && status !== 429) break;
      } catch (e) {
        lastError = e;
        geminiRes = null;
      }
      await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
    }
    if (!geminiRes || !geminiRes.ok) {
      console.error("Gemini API error:", lastError || JSON.stringify(geminiData));
      return NextResponse.json({ data: {}, error: "Gemini error", details: geminiData });
    }
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[OCR] requested fields:", requestedFields);
    console.log("[OCR] Gemini raw:", textContent);

    // Parse JSON (strip markdown fences if present)
    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ data: {}, raw: textContent });

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const pick = (arr: unknown): string | null => Array.isArray(arr) && arr.length > 0 && typeof arr[0] === "string" ? arr[0] : null;
      const docType = typeof parsed.doc_type === "string" ? parsed.doc_type : "other";
      const flat: Record<string, string> = {};

      // Filter mobile only (skip 02 office numbers)
      const mobilePhones = Array.isArray(parsed.phones) ? parsed.phones.filter((p: unknown) => {
        if (typeof p !== "string") return false;
        const digits = p.replace(/\D/g, "");
        return !digits.startsWith("02") && digits.length >= 9;
      }) : [];

      // Permissive fill: take whatever Gemini extracted and put it in the
      // matching form field. doc_type is used only for *exclusions* — slips
      // get nothing because their "people" is sender/receiver names, not the
      // lead's identity. Anything else (id_card, envelope, electricity_bill,
      // house_registration, even "other") gets the address + name + numeric
      // IDs that Gemini found.
      if (docType === "bank_slip") {
        // skip — return empty data so the form is untouched
      } else {
        // Name — only set when doc looks identity-bearing (id card, house reg,
        // envelope/other where we trust Gemini's people array). Skip on
        // electricity_bill so the meter-account holder name doesn't overwrite
        // a properly-entered customer name.
        if (docType !== "electricity_bill") {
          const fullName = pick(parsed.people);
          if (fullName) flat.full_name = fullName;
        }
        // ID card number — 13-digit only, available on id_card / house_reg
        const idCard = pick(parsed.id_card_numbers);
        if (idCard) flat.id_card_number = String(idCard).replace(/\D/g, "").slice(0, 13);
        // Address — fill installation_address and id_card_address from
        // whatever Gemini found. CustomerInfoForm and DocumentScanner pick
        // which fields they care about.
        const address = pick(parsed.addresses);
        if (address) {
          flat.installation_address = address;
          flat.id_card_address = address;
        }
        // Electricity-bill specifics — ignored on other doc types
        if (parsed.utility_provider && typeof parsed.utility_provider === "string") flat.utility_provider = parsed.utility_provider;
        const ca = pick(parsed.ca_numbers);
        if (ca) flat.ca_number = ca;
        const meter = pick(parsed.meter_numbers);
        if (meter) flat.meter_number = meter;
        if (parsed.monthly_bill) {
          const bill = String(parsed.monthly_bill).replace(/[^\d.]/g, "");
          if (bill) flat.monthly_bill = bill;
        }
        if (mobilePhones.length > 0) flat.phone = mobilePhones[0];
      }

      return NextResponse.json({ data: flat, doc_type: docType, raw: textContent, categorized: parsed });
    } catch (err) {
      return NextResponse.json({ data: {}, raw: textContent, parseError: String(err) });
    }
  } catch (error) {
    console.error("POST /api/ocr error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
