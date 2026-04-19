import { NextRequest, NextResponse } from "next/server";

// POST /api/ocr-serial
// Body: { imageUrl }
// Returns: { serial: string | null }
// Uses Gemini Vision to read the serial number printed/etched on an inverter or
// panel label. Returns the raw alphanumeric string with no formatting.
export async function POST(request: NextRequest) {
  try {
    const { imageUrl } = await request.json();
    if (!imageUrl) return NextResponse.json({ error: "No imageUrl" }, { status: 400 });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    const fullUrl = imageUrl.startsWith("/") ? `http://localhost:${process.env.PORT || 3700}${imageUrl}` : imageUrl;
    const imgRes = await fetch(fullUrl);
    const imgBuf = await imgRes.arrayBuffer();
    const base64 = Buffer.from(imgBuf).toString("base64");
    const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

    const prompt = `ภาพนี้คือฉลาก/สติกเกอร์ของอุปกรณ์ไฟฟ้า (อินเวอร์เตอร์หรือแผงโซลาร์) ที่มี Serial Number พิมพ์อยู่

**หน้าที่:** อ่าน Serial Number (SN / S/N / Serial No.) ที่เห็นในภาพ แล้ว return เป็น raw JSON:
{
  "serial": "<string เฉพาะตัวอักษรและตัวเลขของ serial — ไม่ใส่ label 'SN:' หรือวรรค>"
}

ถ้าไม่เห็น serial number → return {"serial": null}
ห้ามใส่ markdown ห้ามใส่ code block`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }],
      }),
    });
    const geminiData: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { code?: number; message?: string } } = await geminiRes.json();
    if (geminiData.error) {
      console.error("[ocr-serial] Gemini error:", geminiData.error);
      return NextResponse.json({ serial: null, error: geminiData.error.message || "Gemini error" });
    }
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[ocr-serial] Gemini raw:", textContent);

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ serial: null });

    try {
      const parsed = JSON.parse(jsonMatch[0]) as { serial?: string | null };
      const serial = typeof parsed.serial === "string" ? parsed.serial.trim() : null;
      return NextResponse.json({ serial: serial || null });
    } catch {
      return NextResponse.json({ serial: null });
    }
  } catch (error) {
    console.error("POST /api/ocr-serial error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
