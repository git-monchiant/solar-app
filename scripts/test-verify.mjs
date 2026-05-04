import { readFileSync } from "fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) { console.error("No GEMINI_API_KEY"); process.exit(1); }

async function ask(imageUrl, label) {
  console.log(`\n========== ${label} ==========`);
  console.log("URL:", imageUrl);
  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) { console.error("Fetch failed:", imgRes.status); return; }
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");
  const mimeType = imgRes.headers.get("content-type") || "image/jpeg";

  const prompt = `อ่านภาพแล้วตอบเฉพาะที่เห็นในภาพจริง — ห้ามเดา ถ้าไม่เห็นให้ตอบ false หรือ null

ตอบ visual yes/no:
- has_success_message: เห็นข้อความ "โอนเงินสำเร็จ" / "Transfer Successful" / "ทำรายการสำเร็จ" / "เรียบร้อย" / "Success" หรือไม่?
- has_qr_code_dominant: ภาพหลักเป็น QR code ขนาดใหญ่ครอบคลุมพื้นที่ส่วนใหญ่หรือไม่?
- shows_form_or_app_ui: เป็นหน้าจอ app/website ทั่วไป (ฟอร์ม, รายชื่อ, dashboard, เมนู)?
- shows_bank_logo: เห็นโลโก้ธนาคาร/e-wallet ชัดเจน (KBANK/SCB/BBL/KTB/BAY/TMB/TrueMoney)?
- is_cheque: เป็นเช็คกระดาษ?

return raw JSON เท่านั้น (ห้าม markdown):
{"has_success_message":<bool>,"has_qr_code_dominant":<bool>,"shows_form_or_app_ui":<bool>,"shows_bank_logo":<bool>,"is_cheque":<bool>,"amount":<number|null>,"recipient_name":<string|null>,"recipient_account":<string|null>,"sender_name":<string|null>,"sender_account":<string|null>,"bank":<string|null>,"datetime":<string|null>,"reference":<string|null>,"ref1":<string|null>,"ref2":<string|null>,"trans_id":<string|null>,"cheque_no":<string|null>}`;

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType, data: base64 } }] }] }),
  });
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  console.log("Gemini raw:", text);
  try {
    const j = JSON.parse(text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0] || "{}");
    const cues = { hsm: j.has_success_message, qr: j.has_qr_code_dominant, form: j.shows_form_or_app_ui, bank: j.shows_bank_logo, chk: j.is_cheque };
    console.log("Cues:", cues);
    let docType = "other";
    if (j.is_cheque && j.cheque_no) docType = "cheque";
    else if (j.has_success_message && j.shows_bank_logo && !j.has_qr_code_dominant && !j.shows_form_or_app_ui && j.amount && (j.trans_id||j.ref2||j.reference) && (j.sender_name||j.sender_account) && (j.recipient_name||j.recipient_account) && j.datetime) docType = "slip";
    else if (j.amount && (j.trans_id||j.ref2||j.reference) && j.datetime && !j.has_qr_code_dominant && !j.shows_form_or_app_ui) docType = "paper";
    console.log("→ classified:", docType);
  } catch (e) { console.error("Parse fail:", e); }
}

// Test: real confirmed slip (lead 521 payment 113 had pre_slip_url confirmed)
await ask("https://senasolar.ngrok.app/api/payments/113", "Real slip (payment 113)");
// Test: ngrok URL of public files? Use a known image - signature  
await ask("https://senasolar.ngrok.app/api/leads/521/signature/install_customer", "Customer signature (not a slip)");
