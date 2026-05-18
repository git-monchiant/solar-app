// DRY-RUN ONLY: classify legacy follow-up titles into the 5 allowed outcomes.
// Allowed values only:
//   A = "ติดต่อได้ - Sale เสนอขาย"
//   B = "ติดต่อได้ - ลูกค้าไม่สะดวกคุย"
//   C = "ติดต่อไม่ได้ - ไม่รับสาย"
//   D = "ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง"
//   E = "อื่นๆ"
//   null = leave untouched

import sql from 'mssql';

const A = "ติดต่อได้ - Sale เสนอขาย";
const B = "ติดต่อได้ - ลูกค้าไม่สะดวกคุย";
const C = "ติดต่อไม่ได้ - ไม่รับสาย";
const D = "ติดต่อไม่ได้ - ข้อมูลติดต่อไม่ถูกต้อง";
const E = "อื่นๆ";

function classify(note) {
  if (!note) return null;
  const n = note;
  // D — wrong contact info (explicit)
  if (/เบอร์ผิด|ผิดเบอร์|ข้อมูลผิด|ข้อมูลไม่ถูก|wrong number|เบอร์ไม่ถูก/i.test(n)) return D;
  // C — explicit no-answer / silent only
  if (/ไม่รับสาย|ลูกค้าเงียบ|ไม่ตอบกลับ|ลูกค้าไม่ตอบ|ติดต่อไม่ได้/i.test(n)) return C;
  // B — explicit "not convenient" wording
  if (/ไม่สะดวก|อยู่ตลาด|ติดประชุม|ไม่ว่างคุย/i.test(n)) return B;
  // A — explicit product/price/decision discussion (excludes bare "ไม่สนใจ")
  if (/ราคา|เสนอ|kwp|kWh|แพ็คเกจ|แพคเกจ|ขอคุย(กับ)?(แฟน|ทางบ้าน|ภรรยา)|ขอเวลาคิด|ขอคิดดู|รอช่วง|ฟีดแบค|ปลายปี|ข้อมูลเพิ่ม|ตัดสินใจ|งบประมาณ|สินเชื่อ|อัพเกรด|scale.?up/i.test(n)) return A;
  // anything else → unmapped (won't be applied)
  return null;
}

const pool = await sql.connect({ server:'172.41.1.73', port:1433, user:'monchiant', password:'monchiant', database:'solardb', options:{encrypt:false,trustServerCertificate:true}});
const r = await pool.request().query(`
  SELECT id, activity_type, title, note
  FROM lead_activities
  WHERE activity_type IN ('call','visit','line','other','follow_up','loan_followup')
    AND title IS NOT NULL
    AND (title NOT LIKE N'ติดต่อได้%' AND title NOT LIKE N'ติดต่อไม่ได้%' AND title <> N'อื่นๆ')
`);

const counts = {[A]:0,[B]:0,[C]:0,[D]:0,[E]:0,'__null__':0};
const samples = {[A]:[],[B]:[],[C]:[],[D]:[],[E]:[]};
for (const row of r.recordset) {
  const v = classify(row.note);
  if (v === null) counts.__null__++;
  else {
    counts[v]++;
    if (samples[v].length < 3) samples[v].push(row.note?.slice(0,80) || "");
  }
}

console.log("=== DRY-RUN: legacy → 5 outcomes ===\n");
console.log(`total legacy rows: ${r.recordset.length}\n`);
for (const k of [A,B,C,D,E]) {
  console.log(`${counts[k].toString().padStart(4)}  ${k}`);
  for (const s of samples[k]) console.log(`        e.g. "${s}"`);
}
console.log(`${counts.__null__.toString().padStart(4)}  (note=NULL — leave untouched)`);

await pool.close();
