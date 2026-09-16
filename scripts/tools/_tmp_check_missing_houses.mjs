// 20 หลังที่ผู้ใช้ map ได้แต่ไม่มีในทะเบียนเรา — ยิง REM ถามสดว่ามีหน่วยนี้ไหม โอนหรือยัง
// ★ ผู้ใช้สั่ง 9 ก.ย. 69: "ไม่มีในระบบเรา ไปยิงหาว่าโอนหรือยังด้วย ที่หาไม่เจอไม่ตรงกับเรา"
// อ่านอย่างเดียว — ผลออกเป็น JSON + CSV ให้ตัดสินว่าจะสร้างบ้านหลังไหน
import sql from "mssql"; import fs from "fs";
const SRC = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/user_nohouse.json";
const OUT = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/missing_check.json";
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^(DB_|REM_)/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const BASE = env.REM_API_URL || "https://rem-web.sena-it.com/sena/itf";
const KEY = env.REM_API_KEY; if (!KEY) throw new Error("ยังไม่ได้ตั้ง REM_API_KEY");

const norm = (s) => {
  let t = String(s ?? "").replace(/\s+/g, "").trim().replace(/(_\d+|[-_]?(ev|EV|OM|om))$/, "");
  return t ? t.split("/").map((x) => (/^\d+$/.test(x) ? String(parseInt(x, 10)) : x.toUpperCase())).join("/") : "";
};
const seen = new Set();
const items = JSON.parse(fs.readFileSync(SRC, "utf8")).filter((x) => {
  const k = `${x.pid}|${norm(x.hn)}`;
  if (!x.pid || !x.hn || seen.has(k)) return false;
  seen.add(k); return true;
});
console.log(`บ้านที่ต้องตรวจ: ${items.length} หลัง\n`);

const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: "ตรวจ 20 หลังที่ไม่มีในทะเบียนเรา + ยิง REM ถามสถานะโอน (SELECT)" }) + "\n");

const post = async (b) => {
  const r = await fetch(`${BASE}/api/saleorder/transfer`, { method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${KEY}` }, body: JSON.stringify(b), cache: "no-store" });
  if (!r.ok) throw new Error(`REM ${r.status}`);
  const j = await r.json();
  return Array.isArray(j) ? j : (j?.data ?? j?.result ?? []);
};

const out = [];
for (const it of items) {
  const hn = norm(it.hn);
  // 1) หน่วยนี้อยู่ในทะเบียน REM ที่เราดึงมาแล้วไหม
  const u = (await pool.request().input("p", sql.NVarChar(20), it.pid).input("h", sql.NVarChar(60), hn).query(`
    SELECT TOP 1 unit_id, unit_number, house_number, model_name FROM om_rem_units
    WHERE project_id = @p AND house_number_key = @h COLLATE Latin1_General_BIN2`)).recordset[0];
  // 2) บ้านเลขที่นี้ไปโผล่ที่โครงการอื่นในระบบเราหรือเปล่า (สะกดรหัสคนละตัว)
  const other = (await pool.request().input("h", sql.NVarChar(60), hn).query(`
    SELECT TOP 5 h.id, h.project_id, h.house_number, CAST(h.is_om AS int) is_om FROM om_houses h
    WHERE REPLACE(h.house_number, N' ', N'') COLLATE Latin1_General_BIN2 = @h`)).recordset;

  let status = "ไม่มีหน่วยในทะเบียน REM", contract = null, tdate = null, owner = null, err = null;
  if (u?.unit_id) {
    try {
      const list = await post({ projectID: it.pid, unitID: u.unit_id, unitNumber: "", houseNumber: "" });
      const row = list[0];
      status = row ? "โอนแล้ว" : "มีหน่วย แต่ยังไม่โอน";
      contract = row?.contractID ?? null;
      tdate = (row?.transferDate ?? "").slice(0, 10) || null;
      const o = (row?.owners ?? [])[0];
      owner = o ? `${o.firstName ?? ""} ${o.lastName ?? ""}`.trim() + (o.phoneNo1 ? ` · ${o.phoneNo1}` : "") : null;
    } catch (e) { status = "ยิงไม่ได้"; err = e.message; }
  }
  out.push({ ...it, hn_norm: hn, status, contract, transfer_date: tdate, owner,
    rem_unit_id: u?.unit_id ?? null, rem_unit_number: u?.unit_number ?? null, model: u?.model_name ?? null,
    other_projects: other.map((o) => `${o.project_id}#${o.id}${o.is_om ? "" : "(ปิด)"}`).join(", ") || null, err });
  console.log(`  ${it.pid.padEnd(7)}${hn.padEnd(11)}${status.padEnd(24)}${contract ?? ""}${owner ? " · " + owner : ""}${other.length ? "  [เลขนี้มีที่ " + other.map((o) => o.project_id).join(",") + "]" : ""}`);
}
await pool.close();
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
const by = out.reduce((m, x) => ((m[x.status] = (m[x.status] ?? 0) + 1), m), {});
console.log("\nสรุป:", by);

const csv = ["project_id,ชื่อโครงการ,บ้านเลขที่,เลขแปลงในไฟล์,สถานะใน REM,เลขสัญญา,วันโอน,เจ้าของ,unit_number ใน REM,แบบบ้าน,เลขบ้านนี้มีที่โครงการอื่น,วันติดตั้งจากไฟล์"];
for (const x of out)
  csv.push([x.pid, x.pname, x.hn, x.unit, x.status, x.contract, x.transfer_date, x.owner, x.rem_unit_number, x.model, x.other_projects, x.d]
    .map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","));
fs.writeFileSync("../docs/20260909_08_ตรวจ-20-หลังที่ไม่มีในระบบ-กับ-REM.csv", "﻿" + csv.join("\n"));
console.log("เขียน docs/20260909_08_ตรวจ-20-หลังที่ไม่มีในระบบ-กับ-REM.csv");
