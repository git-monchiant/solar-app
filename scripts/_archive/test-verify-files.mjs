import { readFileSync, statSync } from "fs";
import path from "path";

const env = readFileSync("/Users/monchiant/sena-projects/solar-app/.env.local", "utf8");
for (const line of env.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) process.env[m[1]] = m[2]; }
const apiKey = process.env.GEMINI_API_KEY;

const PROMPT = `อ่านภาพแล้วตอบเฉพาะที่เห็นในภาพจริง — ห้ามเดา ถ้าไม่เห็นให้ตอบ false หรือ null

ตอบ visual yes/no:
- has_success_message: เห็นข้อความ "โอนเงินสำเร็จ"/"Transfer Successful"/"Success" หรือไม่?
- has_qr_code_dominant: ภาพหลักเป็น QR ขนาดใหญ่?
- shows_form_or_app_ui: หน้าจอ app/website ทั่วไป?
- shows_bank_logo: เห็นโลโก้ธนาคาร/e-wallet ชัดเจน?
- is_cheque: เป็นเช็คกระดาษ?

return raw JSON เท่านั้น:
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

async function ask(filePath) {
  const buf = readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === ".png" ? "image/png" : ext === ".heic" ? "image/heic" : "image/jpeg";
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: PROMPT }, { inlineData: { mimeType: mime, data: buf.toString("base64") } }] }] }),
  });
  const data = await r.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  if (!text) { console.log(path.basename(filePath), "→ NO RESPONSE"); return; }
  let j; try { j = JSON.parse(text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/)?.[0] || "{}"); } catch { console.log(path.basename(filePath), "→ PARSE FAIL"); return; }
  const result = classify(j);
  const cues = `hsm=${j.has_success_message?"Y":"n"} qr=${j.has_qr_code_dominant?"Y":"n"} form=${j.shows_form_or_app_ui?"Y":"n"} bank=${j.shows_bank_logo?"Y":"n"} chk=${j.is_cheque?"Y":"n"}`;
  console.log(`${result.padEnd(7)} | ${cues} | amount=${j.amount} tx=${j.trans_id||j.ref2||""} | ${path.basename(filePath)}`);
}

const dir = "/Users/monchiant/Downloads/Images";
const { readdirSync } = await import("fs");
const files = readdirSync(dir).filter(f => /\.(jpg|jpeg|png|heic)$/i.test(f));
for (const f of files) {
  const fp = path.join(dir, f);
  if (statSync(fp).size > 8 * 1024 * 1024) { console.log("SKIP large", f); continue; }
  await ask(fp);
}
