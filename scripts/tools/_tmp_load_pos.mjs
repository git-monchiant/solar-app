// โหลดเลข PO ทุกใบจากไฟล์บัญชีลง om_installation_pos (ผู้ใช้เคาะ 9 ก.ย. 69 "เก็บหลายใบ")
//   ตารางเดิม om_installations.po_number เก็บได้ใบเดียว ⇒ ใบงานบริการทับใบงานติดตั้ง
//   ตารางลูกเก็บครบทุกใบ พร้อมประเภท (install/service) และจุดอ้างอิงในไฟล์ต้นทาง
// รัน: node scripts/tools/_tmp_load_pos.mjs [--write]
import sql from "mssql"; import fs from "fs";
const PLAN = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/po_plan.json";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "โหลด PO ทุกใบลง om_installation_pos" }) + "\n");
if ((await pool.request().query("SELECT OBJECT_ID('om_installation_pos','U') x")).recordset[0].x == null)
  throw new Error("ยังไม่มีตาราง om_installation_pos — รัน migration 20260909-1100 ก่อน");

const tx = new sql.Transaction(pool); await tx.begin();
const n = { batch: 0, ins: 0, dup: 0, install: 0, service: 0, houses: new Set() };
try {
  let batchId = null;
  if (WRITE) {
    const b = await new sql.Request(tx)
      .input("f", sql.NVarChar(200), "สรุป บ้านเสนาติดตั้ง solar ส่งพี่เปิ้ล 20260908.xlsx")
      .input("no", sql.NVarChar(300), "เลข PO ทุกใบ (งานติดตั้ง + งานบริการ) ลงตารางลูก om_installation_pos")
      .input("rc", sql.Int, plan.length)
      .query(`INSERT INTO om_import_batches (source_file, note, row_count) OUTPUT INSERTED.id VALUES (@f, @no, @rc)`);
    batchId = b.recordset[0].id; n.batch = batchId;
  }
  for (const p of plan) {
    if (!WRITE) { n.ins++; n[p.kind]++; n.houses.add(p.house_id); continue; }
    const r = await new sql.Request(tx)
      .input("h", sql.Int, p.house_id).input("i", sql.Int, p.inst_id)
      .input("po", sql.NVarChar(80), p.po).input("d", sql.Date, p.date || null)
      .input("k", sql.VarChar(12), p.kind).input("no", sql.NVarChar(300), p.note || null)
      .input("kw", sql.Decimal(10, 4), p.kw ?? null)
      .input("ref", sql.NVarChar(200), p.ref).input("b", sql.Int, batchId)
      .query(`IF NOT EXISTS (SELECT 1 FROM om_installation_pos
                             WHERE installation_id=@i AND po_number=@po
                               AND ISNULL(po_date,'1900-01-01')=ISNULL(@d,'1900-01-01'))
                INSERT INTO om_installation_pos (house_id, installation_id, po_number, po_date, kind, note, amount_kw, source_ref, batch_id)
                VALUES (@h, @i, @po, @d, @k, @no, @kw, @ref, @b)`);
    if (r.rowsAffected[0] === 1) { n.ins++; n[p.kind]++; n.houses.add(p.house_id); } else n.dup++;
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
  console.log(`  batch id      : ${n.batch || "-"}`);
  console.log(`  ใบ PO ที่บันทึก: ${n.ins}  (งานติดตั้ง ${n.install} · งานบริการ ${n.service})`);
  console.log(`  บ้าน          : ${n.houses.size}`);
  console.log(`  ซ้ำ ข้าม      : ${n.dup}`);
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
