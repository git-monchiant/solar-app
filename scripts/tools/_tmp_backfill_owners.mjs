// เติมเจ้าของที่หายไปใน om_rem_owners โดยยิง REM transfer "รายหลัง"
//
// ★★ ปัญหาที่พบ 9 ก.ย. 69: ยิง /api/saleorder/transfer ทั้งโครงการ REM ส่ง owners ไม่ครบ
//    อาการเดียวกับ promotions ที่เคยเจอ 2 ก.ย. — บางสัญญาได้ owners ซ้ำ บางสัญญาได้ว่างเปล่า
//    ตัวอย่าง LIFK6: 45/215 ทั้งโครงการได้ 4 (ซ้ำ 2 คน) · 45/216 กับ 45/209 ได้ 0
//    ยิงรายหลัง (unitID) ได้ครบถูกต้องทุกครั้ง
//    ⇒ สคริปต์นี้ไล่ยิงรายหลังเฉพาะสัญญาที่ยังไม่มี owners แล้วเติมลง staging
//    (ทางแก้ถาวรคือแก้ rem-sync ให้ดึง owners รายหลังเหมือน promotions)
//
// รัน: node scripts/tools/_tmp_backfill_owners.mjs [--write] [--limit=N]
import sql from "mssql"; import fs from "fs";
const WRITE = process.argv.includes("--write");
const LIMIT = Number((process.argv.find((a) => a.startsWith("--limit=")) ?? "--limit=600").split("=")[1]);
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^(DB_|REM_)/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const BASE = env.REM_API_URL || "https://rem-web.sena-it.com/sena/itf";
const KEY = env.REM_API_KEY; if (!KEY) throw new Error("ยังไม่ได้ตั้ง REM_API_KEY");
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE om_rem_owners " : "ตรวจ (SELECT) ") + "เติมเจ้าของที่หายจากการยิง REM ทั้งโครงการ" }) + "\n");

const todo = (await pool.request().input("n", sql.Int, LIMIT).query(`
  SELECT TOP (@n) t.contract_id, t.project_id, t.unit_id, t.house_number
  FROM om_rem_transfers t
  WHERE NOT EXISTS (SELECT 1 FROM om_rem_owners o WHERE o.contract_id = t.contract_id)
    AND ISNULL(t.unit_id, N'') <> N''
  ORDER BY t.project_id, t.house_number`)).recordset;
console.log(`สัญญาที่ยังไม่มีเจ้าของ (จะยิงรอบนี้): ${todo.length}`);

const post = async (b) => {
  const r = await fetch(`${BASE}/api/saleorder/transfer`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${KEY}` }, body: JSON.stringify(b), cache: "no-store" });
  if (!r.ok) throw new Error(`REM ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.data ?? j?.result ?? []);
};
const phoneKey = (s) => String(s ?? "").replace(/\D/g, "").slice(-9);
let found = 0, ins = 0, empty = 0, fail = 0;
const CONC = 4;
for (let i = 0; i < todo.length; i += CONC) {
  const chunk = todo.slice(i, i + CONC);
  const res = await Promise.all(chunk.map(async (t) => {
    try { return { t, list: await post({ projectID: t.project_id, unitID: t.unit_id, unitNumber: "", houseNumber: "" }) }; }
    catch (e) { return { t, err: e.message }; }
  }));
  for (const r of res) {
    if (r.err) { fail++; continue; }
    // ★ guard: รับเฉพาะสัญญาที่ตรงกับที่ขอ (host เดียวกับที่เคยพบว่าค้นไม่ตรงตัว)
    const row = r.list.find((x) => String(x.contractID) === r.t.contract_id);
    const owners = (row?.owners ?? []).filter((o) => String(o.contractID) === r.t.contract_id);
    if (!owners.length) { empty++; continue; }
    found++;
    if (!WRITE) { ins += owners.length; continue; }
    const seen = new Set();
    for (const o of owners) {
      const k = `${o.customerItemID ?? ""}|${o.firstName ?? ""}|${o.lastName ?? ""}`;
      if (seen.has(k)) continue; seen.add(k);      // REM ส่งซ้ำได้ ตัดออกก่อนเขียน
      await pool.request()
        .input("a", sql.NVarChar(80), r.t.contract_id).input("b", sql.NVarChar(60), o.customerItemID ?? null)
        .input("c", sql.NVarChar(200), o.firstName ?? null).input("d", sql.NVarChar(200), o.lastName ?? null)
        .input("e", sql.Bit, o.isMainCustomer ? 1 : 0)
        .input("f", sql.NVarChar(20), /^\d{13}$/.test(String(o.citizenID)) ? o.citizenID : null)
        .input("g", sql.NVarChar(40), o.passportID || null).input("h", sql.NVarChar(30), o.phoneNo1 || null)
        .input("i", sql.NVarChar(20), phoneKey(o.phoneNo1) || null).input("j", sql.NVarChar(200), o.email || null)
        .input("k", sql.NVarChar(100), o.nationalityName || null)
        .query(`INSERT INTO om_rem_owners (contract_id, customer_item_id, first_name, last_name, is_main, citizen_id, passport_id, phone, phone_key, email, nationality_name)
                VALUES (@a,@b,@c,@d,@e,@f,@g,@h,@i,@j,@k)`);
      ins++;
    }
  }
  if ((i + CONC) % 100 < CONC) console.log(`  ...${Math.min(i + CONC, todo.length)}/${todo.length} · เจอเจ้าของ ${found} · ว่าง ${empty} · ยิงไม่ได้ ${fail}`);
}
console.log(`\n${WRITE ? "✔ เขียนแล้ว" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง"}`);
console.log(`  สัญญาที่ยิง      : ${todo.length}`);
console.log(`  เจอเจ้าของเพิ่ม  : ${found} สัญญา · ${ins} คน`);
console.log(`  REM ตอบว่างจริง  : ${empty}`);
console.log(`  ยิงไม่ได้        : ${fail}`);
await pool.close();
