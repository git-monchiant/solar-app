// ยิง REM API ถามสถานะ "โอนกรรมสิทธิ์" รายหลัง สำหรับบ้านที่ยังไม่ผูกลูกค้า
//   ทะเบียนที่เก็บไว้ sync ล่าสุด 2 ก.ย. จึงต้องถามสด ๆ ไม่ใช้ของเก่า
//   อ่านอย่างเดียว ไม่เขียนอะไร — ผลออกเป็น JSON ให้สคริปต์ล้างข้อมูลใช้ต่อ
// รัน: node scripts/tools/_tmp_check_transfer_live.mjs
import sql from "mssql"; import fs from "fs";
const OUT = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/transfer_live.json";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^(DB_|REM_)/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const BASE = env.REM_API_URL || "https://rem-web.sena-it.com/sena/itf";
const KEY = env.REM_API_KEY; if (!KEY) throw new Error("ยังไม่ได้ตั้ง REM_API_KEY");
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: "อ่านรายชื่อบ้านที่ยังไม่ผูกลูกค้า เพื่อยิง REM API ถามสถานะโอน (SELECT)" }) + "\n");

const K = "REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2";
const rows = (await pool.request().query(`
  SELECT h.id, h.project_id, ISNULL(pj.name_th, h.project_name) pname, h.house_number, h.unit_status, h.phone,
         h.rem_unit_id, u.unit_id rem_unit_lookup, u.unit_number,
         i.id inst_id, CONVERT(char(10), i.install_date, 23) install_date, i.inverter_kw, i.po_number,
         i.rem_contract_id, CONVERT(char(10), i.warranty_start, 23) warranty_start,
         (SELECT COUNT(*) FROM om_installation_pos p WHERE p.house_id = h.id) n_po,
         (SELECT ISNULL(SUM(g.qty),0) FROM om_installations i2 JOIN om_entitlement_grants g ON g.installation_id = i2.id WHERE i2.house_id = h.id) grants,
         (SELECT COUNT(*) FROM om_installations i3 JOIN om_redemptions r ON r.installation_id = i3.id WHERE i3.house_id = h.id) n_wash,
         (SELECT COUNT(*) FROM om_bookings b WHERE b.house_id = h.id) n_book,
         t.contract_id db_contract
  FROM om_houses h
  LEFT JOIN om_projects pj ON pj.project_id = h.project_id
  LEFT JOIN om_installations i ON i.house_id = h.id
  OUTER APPLY (SELECT TOP 1 unit_id, unit_number FROM om_rem_units u2 WHERE u2.project_id = h.project_id AND u2.house_number_key = ${K}) u
  OUTER APPLY (SELECT TOP 1 contract_id FROM om_rem_transfers t2 WHERE t2.project_id = h.project_id AND t2.house_number_key = ${K}) t
  WHERE h.is_om = 1 AND h.om_excluded_reason IS NULL
    AND NOT EXISTS (SELECT 1 FROM om_house_customers hc WHERE hc.house_id = h.id)
  ORDER BY h.project_id, h.house_number`)).recordset;
await pool.close();
console.log(`บ้านที่ยังไม่ผูกลูกค้า: ${rows.length} หลัง · ${new Set(rows.map((r) => r.project_id)).size} โครงการ\n`);

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Basic ${KEY}` }, body: JSON.stringify(body), cache: "no-store" });
  if (!res.ok) throw new Error(`REM ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const j = await res.json();
  return Array.isArray(j) ? j : (j?.data ?? j?.result ?? []);
}
const out = [];
for (const r of rows) {
  const unitId = r.rem_unit_id || r.rem_unit_lookup;
  let status = "ไม่มี unit ใน REM", list = [], err = null;
  if (unitId) {
    try {
      list = await post("/api/saleorder/transfer", { projectID: r.project_id, unitID: unitId, unitNumber: "", houseNumber: "" });
      status = list.length ? "โอนแล้ว" : "ยังไม่โอน";
    } catch (e) { status = "ยิงไม่ได้"; err = e.message; }
  }
  const t = list[0] ?? {};
  out.push({ ...r, unitId, status, err,
    rem_contract: t.contractID ?? t.contractId ?? null,
    rem_transfer_date: t.transferDate ?? t.tranDate ?? null,
    rem_customer: t.customerName ?? t.customer ?? null });
  console.log(`  ${r.project_id.padEnd(7)}${String(r.house_number).padEnd(10)} ${status.padEnd(16)}${t.contractID ?? t.contractId ?? ""}`);
}
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const by = out.reduce((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {});
console.log("\nสรุป:", by);
console.log("เขียนผลไว้ที่", OUT);
