// สร้างบ้าน K9BK2 45/190 และ 45/191 จากทะเบียน REM (ผู้ใช้ยืนยัน 9 ก.ย. 69 ว่าเป็นของพาร์ควิลล์ 2)
//   ที่มา: ไฟล์บัญชี AR-SSE แถว 2179/2180 · PO23100316 · 2023-11-28 · 3.33 kW (ชุดเดียวกับ 45/189, 45/192, 45/193)
//   REM มี unit TWC-190 / TWD-191 อยู่แล้ว แต่ยังไม่มีสัญญาโอน ⇒ ไม่ให้สิทธิ์ล้างแผงอัตโนมัติ
// รัน: node scripts/tools/_tmp_create_k9bk2_190_191.mjs [--write]
import sql from "mssql"; import fs from "fs";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-09.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "สร้างบ้าน K9BK2 45/190, 45/191 จากทะเบียน REM + ผูกข้อมูลจากไฟล์บัญชี" }) + "\n");

const ITEMS = [
  { hn: "45/190", row: 2179, po: "PO23100316", date: "2023-11-28", kw: 3.33 },
  { hn: "45/191", row: 2180, po: "PO23100316", date: "2023-11-28", kw: 3.33 },
];
const tx = new sql.Transaction(pool); await tx.begin();
const log = [];
try {
  let batchId = null;
  if (WRITE) {
    const b = await new sql.Request(tx)
      .input("f", sql.NVarChar(200), "REM om_rem_units (ผู้ใช้ระบุโครงการ)")
      .input("no", sql.NVarChar(300), "สร้างบ้าน K9BK2 45/190, 45/191 — ไฟล์บัญชีมีงานติดตั้ง แต่ยังไม่มีบ้านในทะเบียนเรา")
      .input("rc", sql.Int, ITEMS.length)
      .query(`INSERT INTO om_import_batches (source_file, note, row_count) OUTPUT INSERTED.id VALUES (@f, @no, @rc)`);
    batchId = b.recordset[0].id;
  }
  for (const it of ITEMS) {
    const u = (await new sql.Request(tx).input("h", sql.NVarChar(40), it.hn).query(`
      SELECT TOP 1 unit_id, unit_number, house_number, model_name, titledeed_area, project_name
      FROM om_rem_units WHERE project_id='K9BK2' AND house_number_key = @h COLLATE Latin1_General_BIN2`)).recordset[0];
    if (!u) throw new Error(`ไม่พบ ${it.hn} ในทะเบียน REM ของ K9BK2`);
    const dup = (await new sql.Request(tx).input("h", sql.NVarChar(40), it.hn).query(`
      SELECT id FROM om_houses WHERE project_id='K9BK2' AND REPLACE(house_number, N' ', N'') = @h`)).recordset[0];
    if (dup) { log.push({ hn: it.hn, result: `มีอยู่แล้ว id ${dup.id} — ข้าม` }); continue; }
    if (!WRITE) { log.push({ hn: it.hn, result: `จะสร้างใหม่ · unit ${u.unit_number} · ${u.model_name}` }); continue; }
    const h = await new sql.Request(tx)
      .input("pid", sql.NVarChar(20), "K9BK2").input("pn", sql.NVarChar(200), u.project_name)
      .input("hn", sql.NVarChar(40), u.house_number).input("uid", sql.NVarChar(60), u.unit_id)
      .input("mn", sql.NVarChar(100), u.model_name).input("ta", sql.Decimal(10, 2), u.titledeed_area)
      .input("b", sql.Int, batchId)
      .input("note", sql.NVarChar(500), `[9 ก.ย. 69 สร้างจากทะเบียน REM — ไฟล์บัญชีมีงานติดตั้ง (AR-SSE แถว ${it.row}) แต่ยังไม่มีบ้านในระบบ · ผู้ใช้ยืนยันว่าเป็นโครงการพาร์ควิลล์ 2]`)
      .query(`INSERT INTO om_houses (project_id, project_name, house_number, segment, is_om, has_solar,
                                     unit_status, rem_unit_id, model_name, titledeed_area, source_batch_id, note, enabled)
              OUTPUT INSERTED.id
              VALUES (@pid, @pn, @hn, 'house', 1, 1, N'occupied', @uid, @mn, @ta, @b, @note, 1)`);
    const houseId = h.recordset[0].id;
    const i = await new sql.Request(tx).input("h", sql.Int, houseId).input("b", sql.Int, batchId)
      .input("d", sql.Date, it.date).input("k", sql.Decimal(10, 4), it.kw).input("p", sql.NVarChar(50), it.po)
      .query(`INSERT INTO om_installations (house_id, install_date, inverter_kw, po_number, source_batch_id)
              OUTPUT INSERTED.id VALUES (@h, @d, @k, @p, @b)`);
    const instId = i.recordset[0].id;
    for (const [col, val] of [["install_date", it.date], ["inverter_kw", it.kw], ["po_number", it.po]]) {
      await new sql.Request(tx).input("h", sql.Int, houseId).input("i", sql.Int, instId)
        .input("c", sql.VarChar(40), col).input("nv", sql.NVarChar(200), String(val)).input("b", sql.Int, batchId)
        .input("r", sql.NVarChar(200), `AR-SSE แถว ${it.row} · เลขบ้าน ${it.hn}`)
        .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, source_kind, batch_id, source_ref, match_method, confidence)
                VALUES (@h, @i, 'om_installations', @c, @nv, 'import', @b, @r, N'ผู้ใช้ระบุโครงการ (9 ก.ย. 69)', 'confirmed')`);
    }
    log.push({ hn: it.hn, result: `สร้างแล้ว house ${houseId} · installation ${instId} · unit ${u.unit_number}` });
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.table(log);
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
