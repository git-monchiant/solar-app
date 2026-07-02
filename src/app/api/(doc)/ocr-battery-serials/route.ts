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

    // Build a list of candidate base URLs to try, in order:
    //   1. The request's own origin (ngrok in dev, public host in prod)
    //   2. localhost on common dev ports (3010, 3700, 3000) — useful when
    //      origin isn't fetchable from inside the server (e.g. ngrok loop).
    // Internal /api/files/* endpoints don't require auth on same-host fetches,
    // so any of these should serve the image if reachable.
    const bases: string[] = [];
    try {
      bases.push(new URL(request.url).origin);
    } catch { /* not a parseable URL — skip */ }
    if (process.env.PORT) bases.push(`http://localhost:${process.env.PORT}`);
    bases.push("http://localhost:3010", "http://localhost:3700", "http://localhost:3000");

    const fetchWithFallback = async (url: string): Promise<Response> => {
      if (!url.startsWith("/")) return fetch(url);
      let lastErr: unknown = null;
      for (const base of bases) {
        try {
          const r = await fetch(`${base}${url}`);
          if (r.ok) return r;
          lastErr = new Error(`${base}${url} → ${r.status}`);
        } catch (e) { lastErr = e; }
      }
      throw lastErr instanceof Error ? lastErr : new Error(`No base URL reachable for ${url}`);
    };

    const imageParts = await Promise.all(
      imageUrls.map(async (url) => {
        const res = await fetchWithFallback(url);
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

**หน้าที่:** อ่าน Serial Number (SN / S/N / Serial No. / Module SN) ของ "แบตเตอรี่" เท่านั้นที่เห็นชัดในภาพ พร้อมระบุ bounding box ของบรรทัด serial — return เป็น raw JSON:
{
  "items": [ { "serial": "<sn1>", "box": [<ymin>,<xmin>,<ymax>,<xmax>] }, ... ]
}

**กฎเด็ดขาด (สำคัญที่สุด):**
1. ❌ **ห้ามเดา / ห้ามมโน / ห้ามต่อเลข** — ถ้าอ่านตัวอักษรใดไม่ชัด ให้ข้าม serial นั้นไปเลย ห้ามเดาตัวอักษรแม้แต่ตัวเดียว
2. ❌ **ห้าม extrapolate pattern** — เช่น ถ้าเห็น SN...0001 ห้ามเดาว่ามี ...0002, ...0003 ต่อไปเองโดยไม่เห็นในภาพจริง
3. ✅ อ่านเฉพาะตัวอักษร+ตัวเลขที่ "อ่านออกชัดเจน" ทุกตัว ไม่งั้นข้าม
4. ✅ ถ้าไม่เห็น serial ใดอ่านออกชัดเจนเลย → return {"items": []}  ยอมรับว่าอ่านไม่ออก ดีกว่ามโน

**Format:**
- ใส่เฉพาะตัวอักษรและตัวเลขของ serial (ไม่ใส่ "SN:" หรือวรรค)
- box ใช้รูปแบบ Gemini มาตรฐาน [ymin, xmin, ymax, xmax] normalized 0-1000 ครอบบรรทัด serial นั้น
- ลำดับใน array = ลำดับที่เจอในภาพ (ซ้าย→ขวา, บน→ล่าง)
- ห้ามใส่ serial ของอินเวอร์เตอร์/แผงโซลาร์/มิเตอร์ — เฉพาะแบตเตอรี่
- ห้ามใส่ markdown ห้ามใส่ code block`;

    // Flash + thinkingBudget=0 — Pro was over-cautious on borderline text and
    // refused otherwise-readable SNs (e.g. ZTT label with a clear `I` between
    // digits). Flash matches the panel OCR recipe that the user has already
    // validated for accuracy + cost.
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
      // New shape: { items: [{serial, box}, ...] }. Fall back to the legacy
      // { serials: [...] } shape in case the model regresses to it.
      const parsed = JSON.parse(jsonMatch[0]) as { items?: unknown; serials?: unknown };
      type RawItem = { serial: string; box: number[] | null };
      let raw: RawItem[] = [];
      if (Array.isArray(parsed.items)) {
        raw = (parsed.items as Array<Record<string, unknown>>)
          .map(it => ({
            serial: typeof it.serial === "string" ? it.serial : "",
            box: Array.isArray(it.box) && it.box.every(n => typeof n === "number") ? (it.box as number[]) : null,
          }))
          .filter(it => it.serial);
      } else if (Array.isArray(parsed.serials)) {
        raw = (parsed.serials as unknown[])
          .filter((s): s is string => typeof s === "string")
          .map(s => ({ serial: s, box: null }));
      }
      const out = raw
        .map(it => ({ serial: it.serial.trim(), box: it.box }))
        .filter(it => it.serial.length > 0);
      // Keep `serials: string[]` for back-compat with callers that haven't
      // adopted the new items shape yet.
      return NextResponse.json({
        serials: out.map(o => o.serial),
        items: out,
      });
    } catch {
      return NextResponse.json({ serials: [], items: [] });
    }
  } catch (error) {
    console.error("POST /api/ocr-battery-serials error:", error);
    // Surface the underlying message in dev so the client console shows
    // *why* it failed (PORT mismatch, ngrok loop, Gemini key, etc).
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `OCR failed: ${msg}` }, { status: 500 });
  }
}
