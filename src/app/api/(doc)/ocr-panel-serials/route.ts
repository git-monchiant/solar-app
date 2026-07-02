import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// POST /api/ocr-panel-serials
// Body: { imageUrls: string[] }
// Returns: { serials: string[] }
//
// Single-pass OCR with Flash + thinking=0. Bench on real lot photos (3 photos,
// 5-6 closeup labels each): 16/16 correct in 4s for ~$0.002/batch — 30x
// cheaper than the 2-pass Pro recipe and just as accurate when the photo is a
// proper closeup (not a wide pallet shot). We tried 2-pass when an early test
// used a low-res pallet shot, but real-world photos are closeups; single-pass
// is the right tier.
//
// The K-hint in the prompt + the dedupe post-process are the two things that
// move Flash from "barely works" to "perfect" — keep them both.

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

    // Fetch + base64-encode every image. Local /uploads/... paths go through
    // the dev port; absolute URLs pass through.
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

    const prompt = `อ่าน serial number จากสติกเกอร์ barcode label ทุกอันที่เห็นชัดในภาพ และระบุพิกัด bounding box ของสติกเกอร์แต่ละอัน

ตัวอย่างรูปแบบ serial: E2FXK226C107513735402534

**ตัวอักษรที่อ่านผิดบ่อย:**
- **K** มีขาเฉียงด้านขวา ดูเหมือน X ได้ (แต่ไม่ใช่ XX) — ถ้าเห็นเส้นเฉียง อ่านเป็น K
- ตัวสุดท้ายมักเป็นตัวเลข

Return raw JSON (each entry has the serial + 0-1000 normalized box [ymin, xmin, ymax, xmax] of the sticker label):
{ "items": [ { "serial": "<sn>", "box": [<ymin>,<xmin>,<ymax>,<xmax>] }, ... ] }

- ใส่เฉพาะตัวอักษร+ตัวเลขของ serial (ไม่รวม " I2" ที่ตามหลัง)
- box ใช้รูปแบบ Gemini มาตรฐาน [ymin, xmin, ymax, xmax] normalized 0-1000
- ลำดับ: บน→ล่าง
- raw JSON only`;

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const geminiRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, ...imageParts] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          // Disable Flash's thinking — with thinking on, the model went off the
          // rails and extrapolated hundreds of fake SNs ("...0438, ...0439, ...
          // 0500"). thinking=0 gives a calm, focused read.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    const geminiData: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { code?: number; message?: string } } = await geminiRes.json();
    if (geminiData.error) {
      console.error("[ocr-panel-serials] Gemini error:", geminiData.error);
      return NextResponse.json({ serials: [], error: geminiData.error.message || "Gemini error" });
    }
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[ocr-panel-serials] Gemini raw:", textContent);

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ serials: [] });

    try {
      // New shape: { items: [{serial, box}, ...] }. We also accept the
      // legacy { serials: [...] } shape for older/raw responses.
      const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown; serials?: unknown };
      type RawItem = { serial: string; box: number[] | null };
      let raw: RawItem[] = [];
      if (Array.isArray(parsed.items)) {
        raw = (parsed.items as Array<Record<string, unknown>>)
          .map((it) => ({
            serial: typeof it.serial === "string" ? it.serial : "",
            box: Array.isArray(it.box) && it.box.every((n) => typeof n === "number") ? it.box as number[] : null,
          }))
          .filter((it) => it.serial);
      } else if (Array.isArray(parsed.serials)) {
        raw = (parsed.serials as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map((s) => ({ serial: s, box: null }));
      }
      const seen = new Set<string>();
      const out: Array<{ serial: string; box: number[] | null }> = [];
      for (const it of raw) {
        const sn = normalizeSerial(it.serial.trim());
        if (!sn) continue;
        const k = sn.toUpperCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ serial: sn, box: it.box });
      }
      console.log(`[ocr-panel-serials] items.length=${out.length}`);
      // Keep `serials: string[]` for back-compat with any caller that hasn't
      // adopted the new boxes shape yet.
      return NextResponse.json({
        serials: out.map((o) => o.serial),
        items: out,
      });
    } catch {
      return NextResponse.json({ serials: [], items: [] });
    }
  } catch (error) {
    console.error("POST /api/ocr-panel-serials error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}

// Collapse consecutive identical CAPITAL LETTERS — real panel SNs never have
// AA/KK/XX runs in the letter portion. Doubles come from the model
// over-correcting the K↔X hint. Digits are left alone (e.g. ...410088).
function normalizeSerial(sn: string): string | null {
  if (!sn) return null;
  const cleaned = sn.replace(/([A-Z])\1+/g, "$1").trim();
  return cleaned.length > 0 ? cleaned : null;
}
