import { NextRequest, NextResponse } from "next/server";

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
                text: `อ่านข้อความทั้งหมดจากภาพนี้ แล้ว return เป็น raw JSON object **ห้ามใส่ markdown ห้ามอธิบาย ห้ามใช้ code block** ต้องขึ้นต้นด้วย { และจบด้วย } เท่านั้น

schema:
{
  "doc_type": "id_card | house_registration | electricity_bill | other",
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

คำอธิบาย field (สำคัญ: ดึงให้ครบทุกอันที่เห็น แม้จะแปลกๆ):
- people = ชื่อ-สกุลทุกคนที่เห็น (ไม่ใส่คำนำหน้า) ทั้งไทย/อังกฤษ รวมชื่อผู้ใช้ไฟ/ผู้ถือบัตร
- addresses = ที่อยู่ทุกที่ที่เห็น เต็มรูปแบบ (เลขที่ ซอย ถนน แขวง/ตำบล เขต/อำเภอ จังหวัด รหัสไปรษณีย์)
- id_card_numbers = เลขบัตรประชาชน 13 หลัก (ถ้ามีในเอกสาร)
- ca_numbers = เลขผู้ใช้ไฟฟ้า (CA number) จากบิลค่าไฟ
- meter_numbers = เลขมิเตอร์ไฟฟ้า
- phones = เบอร์โทรศัพท์
- utility_provider = "MEA" หรือ "PEA" (ดูจากโลโก้หรือคำว่า "การไฟฟ้านครหลวง"/"การไฟฟ้าส่วนภูมิภาค")
- amounts = ยอดเงินทุกอันที่เจอ
- monthly_bill = ยอดรวมค่าไฟเดือนนี้ (เฉพาะยอดสุทธิที่ต้องชำระ "รวมเงินที่ต้องชำระ" / "Amount" / "Total") เป็น string
- dates = วันที่ที่เจอ
- other_text = ข้อความอื่นๆ

**อย่าใส่ [] ถ้ามีข้อมูล** — ถ้าเห็นชื่อคนก็ใส่ใน people, ที่อยู่ก็ใส่ใน addresses เสมอ
ถ้าไม่แน่ใจว่าเป็นหมวดไหน เดาก่อนใส่ใน field ที่น่าจะตรง
**Response ต้องเป็น valid JSON ไม่มี backtick ไม่มีคำว่า json ไม่มี markdown**`
              },
              {
                inlineData: { mimeType, data: base64 }
              }
            ]
          }]
        }),
      });

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    // Per-attempt timeout so a hung connection can't exceed the route's maxDuration.
    // 15s * 3 attempts = 45s worst case, well under Next's 60s default.
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
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        geminiRes = await fetchWithTimeout(15_000);
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

      if (docType === "electricity_bill") {
        // Bill — only electric-related fields + install address
        if (parsed.utility_provider && typeof parsed.utility_provider === "string") flat.utility_provider = parsed.utility_provider;
        const ca = pick(parsed.ca_numbers);
        if (ca) flat.ca_number = ca;
        const meter = pick(parsed.meter_numbers);
        if (meter) flat.meter_number = meter;
        if (parsed.monthly_bill) {
          const bill = String(parsed.monthly_bill).replace(/[^\d.]/g, "");
          if (bill) flat.monthly_bill = bill;
        }
        const address = pick(parsed.addresses);
        if (address) flat.installation_address = address;
      } else if (docType === "id_card") {
        const fullName = pick(parsed.people);
        if (fullName) flat.full_name = fullName;
        const idCard = pick(parsed.id_card_numbers);
        if (idCard) flat.id_card_number = String(idCard).replace(/\D/g, "").slice(0, 13);
        const address = pick(parsed.addresses);
        if (address) flat.id_card_address = address;
      } else if (docType === "house_registration") {
        const fullName = pick(parsed.people);
        if (fullName) flat.full_name = fullName;
        const address = pick(parsed.addresses);
        if (address) flat.installation_address = address;
      } else {
        // other — autofill everything we find
        const fullName = pick(parsed.people);
        if (fullName) flat.full_name = fullName;
        const address = pick(parsed.addresses);
        if (address) { flat.installation_address = address; flat.id_card_address = address; }
        const idCard = pick(parsed.id_card_numbers);
        if (idCard) flat.id_card_number = String(idCard).replace(/\D/g, "").slice(0, 13);
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
