import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// POST /api/ocr-serial
// Body: { imageUrl }
// Returns: { serial: string | null }
// Uses Gemini Vision to read the serial number printed/etched on an inverter or
// panel label. Returns the raw alphanumeric string with no formatting.
export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
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

    const prompt = `ภาพนี้คือฉลาก/สติกเกอร์ของอุปกรณ์ไฟฟ้า (อินเวอร์เตอร์ / แบตเตอรี่ / แผงโซลาร์) ที่มีรายละเอียดอุปกรณ์พิมพ์อยู่

**กฎสำคัญ — ป้องกัน hallucination:**
- ห้ามคาดเดา ห้ามแต่งค่า ห้ามเดาตัวอักษรที่ดูไม่ชัด
- ถ้าตัวอักษรเบลอ / มืด / โดนบัง / อ่านไม่ชัด → ตั้ง field นั้นเป็น null
- Serial ต้องตรงกับที่พิมพ์บนป้ายเป๊ะ (อ่านได้ทุกตัวอักษร) ถึงจะใส่ ไม่งั้นให้ null
- Brand ต้องเห็นเป็นโลโก้/ข้อความบนป้ายชัดเจน ไม่ใช่เดาจากรูปลักษณ์อุปกรณ์

**หน้าที่:** ดึงข้อมูลที่อ่านได้ชัดเจน แล้ว return เป็น JSON:
{
  "serial": "<Serial Number / SN / S/N — เฉพาะตัวอักษร+ตัวเลขที่อ่านได้แน่นอน ไม่ใส่ label / วรรค>",
  "brand": "<ยี่ห้อที่เห็นบนป้ายชัดเจน เช่น DEYE, Huawei, JINKO, ZTT>",
  "kw":   "<กำลังไฟอินเวอร์เตอร์ kW ถ้าเห็นชัด — ตัวเลขล้วน>",
  "kwh":  "<ความจุแบตเตอรี่ kWh ถ้าเห็นชัด — ตัวเลขล้วน>"
}

ถ้าไม่เห็นชัด/ไม่มี → null
ห้าม markdown ห้าม code block return JSON ดิบเท่านั้น`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
      const parsed = JSON.parse(jsonMatch[0]) as {
        serial?: string | null;
        brand?: string | null;
        kw?: string | number | null;
        kwh?: string | number | null;
      };
      const serial = typeof parsed.serial === "string" ? parsed.serial.trim() : null;
      const brand  = typeof parsed.brand === "string" && parsed.brand.trim() ? parsed.brand.trim() : null;
      // Gemini occasionally returns "10kW" or "4.8 kWh" — strip non-numeric
      // characters before parsing so the form fields stay clean.
      const toNum = (v: unknown): number | null => {
        if (v == null) return null;
        const cleaned = String(v).replace(/[^\d.]/g, "");
        if (!cleaned) return null;
        const n = parseFloat(cleaned);
        return Number.isFinite(n) ? n : null;
      };
      return NextResponse.json({
        serial: serial || null,
        brand,
        kw:  toNum(parsed.kw),
        kwh: toNum(parsed.kwh),
      });
    } catch {
      return NextResponse.json({ serial: null, brand: null, kw: null, kwh: null });
    }
  } catch (error) {
    console.error("POST /api/ocr-serial error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
