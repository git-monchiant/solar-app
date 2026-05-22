import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// POST /api/ocr-battery-serials
// Body: { imageUrls: string[] }
// Returns: { serials: string[] }
// Uses Gemini Vision to read ALL battery serial numbers across one or more
// photos. Sibling of /api/ocr-panel-serials — same shape, different prompt
// (looking for battery modules, not solar panels). Returns raw array; client
// owns dedup / lock-aware placement.
export async function POST(request: NextRequest) {
  const gate = await requireAuth(request);
  if (gate.error) return gate.error;
  try {
    const { imageUrls } = (await request.json()) as { imageUrls?: string[] };
    if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
      return NextResponse.json({ error: "No imageUrls" }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return NextResponse.json({ error: "No API key" }, { status: 500 });

    const port = process.env.PORT || 3700;
    const imageParts = await Promise.all(
      imageUrls.map(async (url) => {
        const full = url.startsWith("/") ? `http://localhost:${port}${url}` : url;
        const res = await fetch(full);
        const buf = await res.arrayBuffer();
        return {
          inlineData: {
            mimeType: res.headers.get("content-type") || "image/jpeg",
            data: Buffer.from(buf).toString("base64"),
          },
        };
      })
    );

    const prompt = `ภาพเหล่านี้คือฉลาก/สติกเกอร์ของแบตเตอรี่ลิเทียม (เช่น Huawei LUNA, BYD, Pylontech, ZTT) — ในแต่ละภาพอาจมี Serial Number หลายก้อน

**หน้าที่:** อ่าน Serial Number (SN / S/N / Serial No. / Module SN) ของ "แบตเตอรี่" เท่านั้นที่เห็นชัดในภาพ แล้ว return เป็น raw JSON:
{
  "serials": ["<serial1>", "<serial2>", ...]
}

**กฎเด็ดขาด (สำคัญที่สุด):**
1. ❌ **ห้ามเดา / ห้ามมโน / ห้ามต่อเลข** — ถ้าอ่านตัวอักษรใดไม่ชัด ให้ข้าม serial นั้นไปเลย ห้ามเดาตัวอักษรแม้แต่ตัวเดียว
2. ❌ **ห้าม extrapolate pattern** — เช่น ถ้าเห็น SN...0001 ห้ามเดาว่ามี ...0002, ...0003 ต่อไปเองโดยไม่เห็นในภาพจริง
3. ✅ อ่านเฉพาะตัวอักษร+ตัวเลขที่ "อ่านออกชัดเจน" ทุกตัว ไม่งั้นข้าม
4. ✅ ถ้าไม่เห็น serial ใดอ่านออกชัดเจนเลย → return {"serials": []}  ยอมรับว่าอ่านไม่ออก ดีกว่ามโน

**Format:**
- ใส่เฉพาะตัวอักษรและตัวเลขของ serial (ไม่ใส่ "SN:" หรือวรรค)
- ลำดับใน array = ลำดับที่เจอในภาพ (ซ้าย→ขวา, บน→ล่าง)
- ห้ามใส่ serial ของอินเวอร์เตอร์/แผงโซลาร์/มิเตอร์ — เฉพาะแบตเตอรี่
- ห้ามใส่ markdown ห้ามใส่ code block`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    const geminiData: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { code?: number; message?: string } } = await geminiRes.json();
    if (geminiData.error) {
      console.error("[ocr-battery-serials] Gemini error:", geminiData.error);
      return NextResponse.json({ serials: [], error: geminiData.error.message || "Gemini error" });
    }
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[ocr-battery-serials] Gemini raw:", textContent);

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ serials: [] });

    try {
      const parsed = JSON.parse(jsonMatch[0]) as { serials?: unknown };
      const raw = Array.isArray(parsed.serials) ? parsed.serials : [];
      const serials = raw
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      return NextResponse.json({ serials });
    } catch {
      return NextResponse.json({ serials: [] });
    }
  } catch (error) {
    console.error("POST /api/ocr-battery-serials error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
