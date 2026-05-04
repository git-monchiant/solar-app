import { readFileSync } from "fs";
const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const apiKey = process.env.GEMINI_API_KEY;

const PROMPT = `อ่านภาพแล้วตอบเฉพาะที่เห็นในภาพจริง — ห้ามเดา ถ้าไม่เห็นให้ตอบ false หรือ null

ตอบ visual yes/no:
- has_success_message: เห็นข้อความ "โอนเงินสำเร็จ"/"Transfer Successful"/"Success" หรือไม่?
- has_qr_code_dominant: ภาพหลักเป็น QR ขนาดใหญ่?
- shows_form_or_app_ui: หน้าจอ app/website ทั่วไป (ฟอร์ม, รายชื่อ, dashboard)?
- shows_bank_logo: เห็นโลโก้ธนาคาร/e-wallet ชัดเจน?
- is_cheque: เป็นเช็คกระดาษ?

return raw JSON เท่านั้น (ห้าม markdown):
{"has_success_message":<bool>,"has_qr_code_dominant":<bool>,"shows_form_or_app_ui":<bool>,"shows_bank_logo":<bool>,"is_cheque":<bool>,"amount":<number|null>,"recipient_name":<string|null>,"recipient_account":<string|null>,"sender_name":<string|null>,"sender_account":<string|null>,"bank":<string|null>,"datetime":<string|null>,"reference":<string|null>,"ref1":<string|null>,"ref2":<string|null>,"trans_id":<string|null>,"cheque_no":<string|null>}`;

function classify(j) {
  const tx = !!(j.trans_id || j.ref2 || j.reference);
  const snd = !!(j.sender_name || j.sender_account);
  const rcp = !!(j.recipient_name || j.recipient_account);
  if (j.is_cheque && j.cheque_no) return "cheque";
  if (j.has_success_message && j.shows_bank_logo && !j.has_qr_code_dominant && j.amount && tx && snd && rcp && j.datetime) return "slip";
  if (j.amount && tx && j.datetime && !j.has_qr_code_dominant) return "paper";
  return "other";
}

async function ask(url, label) {
  const imgRes = await fetch(url);
  if (!imgRes.ok) { console.log(`SKIP ${label}: HTTP ${imgRes.status}`); return; }
  const buf = Buffer.from(await imgRes.arrayBuffer()).toString("base64");
  const mime = imgRes.headers.get("content-type") || "image/jpeg";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: buf } }] }] }),
  });
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const j = JSON.parse(text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0] || "{}");
  console.log(`${label} → ${classify(j)}  cues: hsm=${j.has_success_message} qr=${j.has_qr_code_dominant} form=${j.shows_form_or_app_ui} bank=${j.shows_bank_logo}  amount=${j.amount}  tx=${j.trans_id||j.ref2||j.reference||""}`);
}

await ask("https://senasolar.ngrok.app/api/payments/113", "Real slip 113");
await ask("https://senasolar.ngrok.app/api/payments/106", "Real slip 106");
await ask("https://senasolar.ngrok.app/api/leads/521/signature/install_customer", "Signature image");
