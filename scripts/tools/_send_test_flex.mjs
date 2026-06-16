// One-off LINE Flex tester — pushes a flex variant to MONCHI😱N so the new
// brand logo can be reviewed without bothering real customers. Uses the ngrok
// tunnel as ORIGIN so the local logo image is what LINE fetches.
import { readFile } from "node:fs/promises";
import { buildAppointmentFlex, buildSurveyResultFlex, buildWarrantyFlex, buildPaymentFlex } from "../../src/lib/utils/line-flex.ts";

const TO = "U734f01324656c9af174f0aef15d95b84"; // MONCHI😱N
const ORIGIN = "https://senasolar.ngrok.app"; // serves the new local logo

// Manual .env.local parse (avoids dotenv dep)
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8")).split("\n")
    .map(l => l.trim()).filter(l => l && !l.startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")]; })
);
const TOKEN = env.LINE_CHANNEL_ACCESS_TOKEN;
if (!TOKEN) { console.error("LINE_CHANNEL_ACCESS_TOKEN missing in .env.local"); process.exit(1); }

const which = (process.argv[2] || "appt-survey").toLowerCase();
const all = {
  "appt-survey": () => buildAppointmentFlex({
    origin: ORIGIN, kind: "survey", name: "คุณทดสอบ Test",
    date: "2026-07-20", timeSlot: "morning",
    address: "311/77 หมู่ 6 เสนา วีว่า รัตนาธิเบศร์ นนทบุรี 11110",
    project: "เสนา วีว่า รัตนาธิเบศร์",
    documents: ["บัตรประชาชน", "บิลค่าไฟล่าสุด"],
    actionLabel: "ยืนยันนัด", actionUrl: `${ORIGIN}/leads/999`,
  }),
  "appt-install": () => buildAppointmentFlex({
    origin: ORIGIN, kind: "install", name: "คุณทดสอบ Test",
    date: "2026-08-15", address: "311/77 หมู่ 6 เสนา วีว่า รัตนาธิเบศร์",
    project: "เสนา วีว่า รัตนาธิเบศร์",
    packageLabel: "5 kWp 3 เฟส + Battery 10 kWh",
    documents: ["สำเนาบัตรประชาชน", "สำเนาทะเบียนบ้าน", "บิลค่าไฟล่าสุด"],
    actionLabel: "ดูรายละเอียด", actionUrl: `${ORIGIN}/leads/999`,
  }),
  "survey-result": () => buildSurveyResultFlex({
    origin: ORIGIN, name: "คุณทดสอบ Test", surveyDate: "2026-07-20",
    recommendedKw: 5.5, systemLabel: "On-Grid 3 เฟส + Battery", panelCount: 10,
    packageLabel: "5 kWp 3 เฟส + Battery 10 kWh",
    pdfUrl: `${ORIGIN}/api/survey/999`,
    note: "ทีมงานจะติดต่อกลับเพื่อนัดติดตั้งภายใน 3 วัน",
  }),
  "warranty": () => buildWarrantyFlex({
    origin: ORIGIN, docNo: "SSE-260001", name: "คุณทดสอบ Test",
    pdfUrl: `${ORIGIN}/api/warranty/999`,
    periodLabel: "20 ก.ค. 2569 – 20 ก.ค. 2571 (2 ปี)",
  }),
  "payment": () => buildPaymentFlex({
    origin: ORIGIN, title: "ค่าจอง Survey", amount: 1000, name: "คุณทดสอบ Test",
    actionLabel: "ชำระเงิน", actionUrl: `${ORIGIN}/pay/test-token`,
    details: [{ label: "เลขที่เอกสาร", value: "SM-260001" }, { label: "กำหนดชำระ", value: "ภายใน 7 วัน" }],
    note: "ชำระเพื่อจองคิวสำรวจ",
  }),
};
if (which === "all") {
  for (const [k, fn] of Object.entries(all)) await send(k, fn());
} else {
  if (!all[which]) { console.error(`unknown variant '${which}'. options: ${Object.keys(all).join(", ")}, all`); process.exit(2); }
  await send(which, all[which]());
}

async function send(label, m) {
  const res = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ to: TO, messages: [m] }),
  });
  if (res.ok) console.log(`✓ ${label}: ${m.altText}`);
  else console.error(`✗ ${label}\n  ${await res.text()}`);
  await new Promise(r => setTimeout(r, 300));
}
