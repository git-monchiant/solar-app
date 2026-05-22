#!/usr/bin/env node
// Local iteration harness for panel-serial OCR.
//
// Usage:
//   node scripts/test-panel-ocr.mjs <image-path-1> [image-path-2] ...
//
// Reads images from disk, base64-encodes, calls Gemini Vision directly with
// the same prompt as /api/ocr-panel-serials, prints raw response + parsed
// serials. Useful for iterating prompt/model without round-tripping through
// the Next.js dev server or uploading via UI.

import { readFile } from "node:fs/promises";
import path from "node:path";

// Minimal .env.local loader — avoid adding dotenv dep just for a test script.
try {
  const env = await readFile(".env.local", "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {}

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("Missing GEMINI_API_KEY in .env.local");
  process.exit(1);
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: node scripts/test-panel-ocr.mjs <image-1> [image-2] ...");
  process.exit(1);
}

const MODEL = process.env.OCR_MODEL || "gemini-2.5-flash";

// Keep in sync with src/app/api/(doc)/ocr-panel-serials/route.ts
const PROMPT = `**Context:** ภาพเหล่านี้ถูกอัปโหลดในระบบจัดการ "แผงโซลาร์" — สมมุติได้เลยว่า serial / barcode ทุกอันในภาพคือของแผงโซลาร์ ไม่ต้องระบุว่าเป็นอุปกรณ์อะไร แม้รูปจะซูมใกล้จนเห็นแค่ป้ายก็ตาม

**หน้าที่ — ทำเป็น 2 ขั้นชัดเจน:**

**ขั้นที่ 1:** นับจำนวน barcode/label ที่เห็นในทุกภาพให้ครบ → ได้ตัวเลข N
**ขั้นที่ 2:** อ่าน serial เฉพาะที่อ่านออกชัด — return ไม่เกิน N ตัวเด็ดขาด

Return เป็น raw JSON:
{
  "barcode_count": <N — จำนวน barcode/label ที่เห็น>,
  "serials": ["<serial1>", "<serial2>", ...]
}

**กฎเหล็ก:** \`serials.length\` ต้อง ≤ \`barcode_count\` เสมอ ห้ามเกิน — ถ้าอ่านได้น้อยกว่า barcode_count ก็ได้ (เป็นเรื่องปกติ) แต่ห้ามเกิน

**สิ่งที่นับว่าเป็น serial — ตีความให้กว้างที่สุด ถ้าคิดว่า "น่าจะเป็น serial" ให้อ่านมาเลย:**
- 🔍 **ใช้วิจารณญาณ** — ข้อความใดๆ ที่ดูเหมือนรหัสประจำตัว (unique identifier) ให้ถือว่าเป็น serial ทั้งหมด ไม่ต้องรอ label
- 🔍 ทุก barcode = มี serial อยู่ด้วย: ข้อความตัวอักษร+ตัวเลขที่อยู่ใต้/บน/ข้าง barcode คือ serial เสมอ
- ถ้าเห็น barcode N อัน → ควรได้ serial N ตัว (อย่างน้อย)
- ข้อความที่มี label เช่น SN / S/N / Serial No. / Module SN / Serial Number / รหัส ก็คือ serial
- รหัสที่ดูเป็น unique identifier (ตัวอักษร+ตัวเลขผสม, ยาว ~8 ตัวขึ้นไป) บนสติกเกอร์ผู้ผลิต
- **อย่ารอ context "SN:"** — เห็นรหัสบนป้ายที่ดูเหมือน serial ก็อ่านมาเลย ห้ามข้าม

**กฎเด็ดขาด (สำคัญที่สุด):**
1. 🔢 **ก่อนตอบ — นับจำนวน barcode/label ที่เห็นในภาพให้ได้ก่อน** ตัวเลข array ของ serials ที่ return **ต้องไม่เกิน** จำนวน barcode ที่นับได้
2. ❌ **ห้ามเดา / ห้ามมโน / ห้ามต่อเลข** — ถ้าอ่านตัวอักษรใดไม่ชัด ให้ข้าม serial นั้นไปเลย ห้ามเดาตัวอักษรแม้แต่ตัวเดียว
3. ❌ **ห้าม extrapolate pattern เด็ดขาด** — Solar panel serial มัก "ไม่เรียงต่อกัน" (ของจริงคละกัน) ถ้าเห็น ...0086 ห้าม assume ว่ามี ...0087, ...0088 ติดกัน
4. ❌ **ห้ามใส่ serial ที่อ่านได้ "ครึ่งเดียว"** แล้วเดาที่เหลือต่อจากตัวก่อนหน้า
5. ✅ อ่านเฉพาะตัวอักษร+ตัวเลขที่ "อ่านออกชัดเจน" ทุกตัว ไม่งั้นข้าม
6. ✅ ถ้าไม่เห็น serial ใดอ่านออกชัดเจนเลย → return {"barcode_count": <N>, "serials": []}  ยอมรับว่าอ่านไม่ออก ดีกว่ามโน

**Format:**
- ใส่เฉพาะตัวอักษรและตัวเลขของ serial (ไม่ใส่ "SN:" หรือวรรค)
- ลำดับใน array = ลำดับที่เจอในภาพ (ซ้าย→ขวา, บน→ล่าง)
- ห้ามใส่ markdown ห้ามใส่ code block`;

function mimeFromExt(p) {
  const ext = path.extname(p).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

const parts = [{ text: PROMPT }];
for (const f of files) {
  const buf = await readFile(f);
  parts.push({
    inlineData: {
      mimeType: mimeFromExt(f),
      data: buf.toString("base64"),
    },
  });
  console.log(`📷 ${path.basename(f)} — ${(buf.length / 1024).toFixed(0)} KB`);
}

console.log(`\n→ Calling ${MODEL} with ${files.length} image(s), temperature=0\n`);

const t0 = Date.now();
const res = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  }
);
const data = await res.json();
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

if (data.error) {
  console.error("❌ Gemini error:", data.error);
  process.exit(1);
}

const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
console.log(`\n── RAW (${elapsed}s) ──────────────────────────`);
console.log(text);

try {
  const parsed = JSON.parse(text);
  const serials = Array.isArray(parsed.serials) ? parsed.serials : [];
  const count = typeof parsed.barcode_count === "number" ? parsed.barcode_count : "?";
  console.log(`\n── PARSED (barcode_count=${count}, serials=${serials.length}) ──────────────────────────`);
  serials.forEach((s, i) => console.log(`  ${String(i + 1).padStart(2)}. ${s}`));
} catch (e) {
  console.log(`\n❌ Parse error: ${e.message}`);
}
