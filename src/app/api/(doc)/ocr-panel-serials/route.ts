import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

// POST /api/ocr-panel-serials
// Body: { imageUrls: string[] }
// Returns: { serials: string[] }
// Uses Gemini Vision to read ALL panel serial numbers across one or more photos.
// Each photo may contain multiple labels (e.g. a sticker sheet, or a wide shot
// showing several panels). Returns a flat de-duplicated list.
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

    // Fetch & encode each image. Local paths (/uploads/…) resolve via the
    // dev port; absolute https URLs pass through as-is.
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

    const prompt = `**Context:** ภาพเหล่านี้ถูกอัปโหลดในระบบจัดการ "แผงโซลาร์" — สมมุติได้เลยว่า serial / barcode ทุกอันในภาพคือของแผงโซลาร์ ไม่ต้องระบุว่าเป็นอุปกรณ์อะไร แม้รูปจะซูมใกล้จนเห็นแค่ป้ายก็ตาม

**หน้าที่ — ทำเป็น 2 ขั้นชัดเจน:**

**ขั้นที่ 1:** นับจำนวน barcode/label ที่เห็นในทุกภาพให้ครบ → ได้ตัวเลข N
**ขั้นที่ 2:** อ่าน serial เฉพาะที่อ่านออกชัด — return ไม่เกิน N ตัวเด็ดขาด

Return เป็น raw JSON:
{
  "barcode_count": <N — จำนวน barcode/label ที่เห็น>,
  "serials": ["<serial1>", "<serial2>", ...]
}

**กฎเหล็ก:** จำนวน serials ใน array ต้อง ≤ barcode_count เสมอ ห้ามเกิน — ถ้าอ่านได้น้อยกว่า barcode_count ก็ได้ (เป็นเรื่องปกติ) แต่ห้ามเกิน

**สิ่งที่นับว่าเป็น serial — ตีความให้กว้างที่สุด ถ้าคิดว่า "น่าจะเป็น serial" ให้อ่านมาเลย:**
- 🔍 **ใช้วิจารณญาณ** — ข้อความใดๆ ที่ดูเหมือนรหัสประจำตัว (unique identifier) ให้ถือว่าเป็น serial ทั้งหมด ไม่ต้องรอ label
- 🔍 ทุก barcode = มี serial อยู่ด้วย: ข้อความตัวอักษร+ตัวเลขที่อยู่ใต้/บน/ข้าง barcode คือ serial เสมอ
- ถ้าเห็น barcode N อัน → ควรได้ serial N ตัว (อย่างน้อย)
- ข้อความที่มี label เช่น SN / S/N / Serial No. / Module SN / Serial Number / รหัส ก็คือ serial
- รหัสที่ดูเป็น unique identifier (ตัวอักษร+ตัวเลขผสม, ยาว ~8 ตัวขึ้นไป) บนสติกเกอร์ผู้ผลิต
- **อย่ารอ context "SN:"** — เห็นรหัสบนป้ายที่ดูเหมือน serial ก็อ่านมาเลย ห้ามข้าม

**กฎเด็ดขาด (สำคัญที่สุด):**
1. 🔢 **ก่อนตอบ — นับจำนวน barcode/label ที่เห็นในภาพให้ได้ก่อน** ตัวเลข array ของ serials ที่ return **ต้องไม่เกิน** จำนวน barcode ที่นับได้ ถ้าเห็น 16 barcode → return ได้สูงสุด 16 ตัว ห้ามเกิน
2. ❌ **ห้ามเดา / ห้ามมโน / ห้ามต่อเลข** — ถ้าอ่านตัวอักษรใดไม่ชัด ให้ข้าม serial นั้นไปเลย ห้ามเดาตัวอักษรแม้แต่ตัวเดียว
3. ❌ **ห้าม extrapolate pattern เด็ดขาด** — Solar panel serial มัก "ไม่เรียงต่อกัน" (ของจริงคละกัน) ถ้าเห็น ...0086 ห้าม assume ว่ามี ...0087, ...0088 ติดกัน — ถ้าเห็น 2 อันต่อกันแบบเรียง (เช่น 410086 + 410087) ส่วนใหญ่คุณกำลังมโน อันที่ 2
4. ❌ **ห้ามใส่ serial ที่อ่านได้ "ครึ่งเดียว"** แล้วเดาที่เหลือต่อจากตัวก่อนหน้า
5. ✅ อ่านเฉพาะตัวอักษร+ตัวเลขที่ "อ่านออกชัดเจน" ทุกตัว ไม่งั้นข้าม
6. ✅ ถ้าไม่เห็น serial ใดอ่านออกชัดเจนเลย → return {"serials": []}  ยอมรับว่าอ่านไม่ออก ดีกว่ามโน

**Format:**
- ใส่เฉพาะตัวอักษรและตัวเลขของ serial (ไม่ใส่ "SN:" หรือวรรค)
- ลำดับใน array = ลำดับที่เจอในภาพ (ซ้าย→ขวา, บน→ล่าง)
- ห้ามใส่ markdown ห้ามใส่ code block`;

    // Gemini 2.5 Flash with thinking disabled — Pro requires thinking_mode
    // (adds 20-30s per call). Flash with thinkingBudget=0 returns in 3-6s and
    // is accurate enough for OCR when paired with the strong prompt above.
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
      console.error("[ocr-panel-serials] Gemini error:", geminiData.error);
      return NextResponse.json({ serials: [], error: geminiData.error.message || "Gemini error" });
    }
    const textContent = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[ocr-panel-serials] Gemini raw:", textContent);

    const cleaned = textContent.replace(/```json|```/g, "").trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return NextResponse.json({ serials: [] });

    try {
      const parsed = JSON.parse(jsonMatch[0]) as { serials?: unknown; barcode_count?: unknown };
      const raw = Array.isArray(parsed.serials) ? parsed.serials : [];
      const barcodeCount = typeof parsed.barcode_count === "number" ? parsed.barcode_count : null;
      // Strip whitespace + drop empties. Dedup / lock-aware placement is the
      // client's responsibility.
      let serials = raw
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      // Safety net — if Gemini violates its own "serials.length ≤ barcode_count"
      // rule, slice down to barcode_count. Keeps the prompt's contract enforced
      // even if the model hallucinates extras.
      if (barcodeCount !== null && serials.length > barcodeCount) {
        console.warn(`[ocr-panel-serials] AI returned ${serials.length} serials but counted only ${barcodeCount} barcodes — truncating`);
        serials = serials.slice(0, barcodeCount);
      }
      console.log(`[ocr-panel-serials] barcode_count=${barcodeCount}, serials.length=${serials.length}`);
      return NextResponse.json({ serials });
    } catch {
      return NextResponse.json({ serials: [] });
    }
  } catch (error) {
    console.error("POST /api/ocr-panel-serials error:", error);
    return NextResponse.json({ error: "OCR failed" }, { status: 500 });
  }
}
