import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "No imageUrl" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    // Fetch image and convert to base64
    const fullUrl = imageUrl.startsWith("/") ? `http://localhost:${process.env.PORT || 3700}${imageUrl}` : imageUrl;
    const imgRes = await fetch(fullUrl);
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuf).toString("base64");
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    // Call Gemini Vision
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              {
                text: `อ่านข้อมูลจากรูปเอกสารนี้ (อาจเป็นบัตรประชาชน, ทะเบียนบ้าน, บิลค่าไฟ, หรือเอกสารอื่น)
ให้ extract ข้อมูลที่พบเป็น JSON เท่านั้น ไม่ต้องอธิบาย
ถ้าไม่เจอ field ไหนให้ใส่ null
{
  "full_name": "ชื่อ-สกุล ภาษาไทย (ไม่ต้องใส่คำนำหน้า นาย/นาง/นางสาว)",
  "id_card_number": "เลขบัตรประชาชน 13 หลัก",
  "id_card_address": "ที่อยู่",
  "phone": "เบอร์โทร",
  "installation_address": "ที่อยู่ติดตั้ง (บ้านเลขที่ ซอย ถนน ตำบล อำเภอ จังหวัด)",
  "meter_number": "เลขมิเตอร์ไฟฟ้า",
  "ca_number": "เลขผู้ใช้ไฟ CA"
}`
              },
              {
                inlineData: { mimeType, data: base64 }
              }
            ]
          }]
        }),
      }
    );

    const geminiData = await geminiRes.json();
    if (!geminiRes.ok) {
      console.error("Gemini API error:", JSON.stringify(geminiData));
      return NextResponse.json({ data: {}, error: "Gemini error" });
    }
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Gemini OCR raw:", textContent.slice(0, 500));

    // Parse JSON from response
    const jsonMatch = textContent.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ data: {} });

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      // Clean nulls
      const clean: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === "string" && v !== "null") clean[k] = v;
      }
      return NextResponse.json({ data: clean });
    } catch {
      return NextResponse.json({ data: {} });
    }
  } catch (error) {
    console.error("POST /api/ocr error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
