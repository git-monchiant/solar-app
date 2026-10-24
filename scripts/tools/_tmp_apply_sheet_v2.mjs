// เขียนข้อมูลจากชีต "สรุป บ้านเสนาติดตั้ง solar ส่งพี่เปิ้ล 20260908.xlsx" ลงระบบ
//   - เติมเฉพาะ "ช่องที่ยังว่าง" เท่านั้น (install_date / inverter_kw / po_number) ไม่ทับของเดิม
//   - ค่าที่ชนกันไม่เขียน แต่บันทึกไว้ใน om_field_sources เป็นรายการ conflict ให้ตรวจ
//   - ทุกค่าที่เขียนลงที่มารายฟิลด์ใน om_field_sources (ไฟล์ไหน แถวไหน จับคู่ด้วยอะไร)
// รัน: node scripts/tools/_tmp_apply_sheet_v2.mjs           (ตรวจอย่างเดียว)
//      node scripts/tools/_tmp_apply_sheet_v2.mjs --write    (เขียนจริง ทรานแซกชันเดียว)
import sql from "mssql"; import fs from "fs";
const PLAN = "/private/tmp/claude-502/-Users-chanetw-Documents-Line-OM-Module/e9bfc592-5546-4267-90bb-0d3adeb2a251/scratchpad/write_plan.json";
const FILE = "สรุป บ้านเสนาติดตั้ง solar ส่งพี่เปิ้ล 20260908.xlsx";
const WRITE = process.argv.includes("--write");
const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => /^DB_/.test(l))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const db = env.DB_NAME; if (!/_v3$|_dev$/i.test(db)) throw new Error("DB guard: " + db);
const plan = JSON.parse(fs.readFileSync(PLAN, "utf8"));
const pool = await sql.connect({ server: env.DB_SERVER, port: Number(env.DB_PORT || 1433), user: env.DB_USER, password: env.DB_PASSWORD, database: db, options: { encrypt: false, trustServerCertificate: true } });
fs.appendFileSync("../docs/db-access-log/2026-09-08.jsonl", JSON.stringify({ at: new Date().toISOString(), by: "chanetw", server: "172.41.1.73", database: db, login: env.DB_USER,
  purpose: (WRITE ? "★ WRITE " : "ตรวจ (SELECT) ") + "เติม install_date/inverter_kw/po_number จากชีตส่งพี่เปิ้ล + ที่มารายฟิลด์ om_field_sources" }) + "\n");

const has = (c) => pool.request().query(`SELECT COL_LENGTH('om_installations','${c}') x`).then((r) => r.recordset[0].x != null);
if (!(await has("po_number"))) throw new Error("ยังไม่มีคอลัมน์ po_number — รัน migration 20260908-1726 ก่อน");
const okFS = (await pool.request().query("SELECT OBJECT_ID('om_field_sources','U') x")).recordset[0].x != null;
if (!okFS) throw new Error("ยังไม่มีตาราง om_field_sources — รัน migration 20260909-0930 ก่อน");

const tx = new sql.Transaction(pool); await tx.begin();
const n = { batch: 0, date: 0, kw: 0, po: 0, conflict: 0, skipped: 0, houses: 0 };
try {
  let batchId = null;
  if (WRITE) {
    const b = await new sql.Request(tx)
      .input("f", sql.NVarChar(200), FILE)
      .input("no", sql.NVarChar(300), "เติมวันติดตั้ง/kW อินเวอร์เตอร์/เลข PO เฉพาะช่องที่ว่าง · จับคู่ด้วยรหัสหรือชื่อโครงการในคำอธิบาย + เลขบ้าน/เลขแปลง")
      .input("rc", sql.Int, plan.length)
      .query(`INSERT INTO om_import_batches (source_file, note, row_count) OUTPUT INSERTED.id VALUES (@f, @no, @rc)`);
    batchId = b.recordset[0].id; n.batch = batchId;
  }
  const fs_ = async (v) => {
    if (!WRITE) return;
    await new sql.Request(tx)
      .input("h", sql.Int, v.house_id).input("i", sql.Int, v.inst_id)
      .input("t", sql.VarChar(40), "om_installations").input("c", sql.VarChar(40), v.col)
      .input("nv", sql.NVarChar(200), v.newv == null ? null : String(v.newv))
      .input("ov", sql.NVarChar(200), v.oldv == null ? null : String(v.oldv))
      .input("k", sql.VarChar(20), v.kind).input("b", sql.Int, batchId)
      .input("r", sql.NVarChar(200), v.ref).input("mm", sql.NVarChar(80), v.method)
      .input("cf", sql.VarChar(12), v.conf)
      .query(`INSERT INTO om_field_sources (house_id, installation_id, table_name, column_name, new_value, old_value, source_kind, batch_id, source_ref, match_method, confidence)
              VALUES (@h, @i, @t, @c, @nv, @ov, @k, @b, @r, @mm, @cf)`);
  };
  for (const p of plan) {
    const ref = (r) => `AR-SSE แถว ${r} · ${p.by}`;
    let touched = false;
    if (p.install_date) {
      const r = WRITE ? await new sql.Request(tx).input("i", sql.Int, p.inst_id).input("d", sql.Date, p.install_date)
        .query(`UPDATE om_installations SET install_date=@d, updated_at=SYSDATETIMEOFFSET() WHERE id=@i AND install_date IS NULL`) : { rowsAffected: [1] };
      if (r.rowsAffected[0] === 1) { n.date++; touched = true; await fs_({ ...p, col: "install_date", newv: p.install_date, oldv: null, kind: "import", ref: ref(p.install_date_row), method: p.how, conf: "confirmed" }); }
      else n.skipped++;
    }
    if (p.inverter_kw != null) {
      const r = WRITE ? await new sql.Request(tx).input("i", sql.Int, p.inst_id).input("k", sql.Decimal(10, 4), p.inverter_kw)
        .query(`UPDATE om_installations SET inverter_kw=@k, updated_at=SYSDATETIMEOFFSET() WHERE id=@i AND inverter_kw IS NULL`) : { rowsAffected: [1] };
      if (r.rowsAffected[0] === 1) { n.kw++; touched = true; await fs_({ ...p, col: "inverter_kw", newv: p.inverter_kw, oldv: null, kind: "import", ref: ref(p.inverter_kw_row), method: p.how, conf: "confirmed" }); }
      else n.skipped++;
    }
    if (p.po_number) {
      const r = WRITE ? await new sql.Request(tx).input("i", sql.Int, p.inst_id).input("p", sql.NVarChar(50), p.po_number)
        .query(`UPDATE om_installations SET po_number=@p, updated_at=SYSDATETIMEOFFSET() WHERE id=@i AND po_number IS NULL`) : { rowsAffected: [1] };
      if (r.rowsAffected[0] === 1) { n.po++; touched = true; await fs_({ ...p, col: "po_number", newv: p.po_number, oldv: null, kind: "import", ref: ref(p.po_number_row), method: p.how, conf: "confirmed" }); }
      else n.skipped++;
    }
    // ค่าที่ชนกัน — ไม่เขียนทับ แต่บันทึกไว้ให้ตรวจ
    if (p.date_conflict) {
      n.conflict++;
      await fs_({ ...p, col: "install_date", newv: p.date_conflict, oldv: p.date_current, kind: "import",
        ref: ref(p.date_conflict_row) + " · ★ ไม่เขียนทับ ค่าเดิมต่างกัน", method: p.how, conf: "probable" });
    }
    if (touched) n.houses++;
  }
  if (WRITE) await tx.commit(); else await tx.rollback();
  console.log(WRITE ? "✔ เขียนแล้ว (commit)" : "ตรวจอย่างเดียว — ใส่ --write เพื่อเขียนจริง");
  console.log(`  batch id        : ${n.batch || "-"}`);
  console.log(`  บ้านที่แตะ      : ${n.houses}`);
  console.log(`  เติมวันติดตั้ง  : ${n.date}`);
  console.log(`  เติม kW         : ${n.kw}`);
  console.log(`  เติมเลข PO      : ${n.po}`);
  console.log(`  บันทึกค่าชนกัน  : ${n.conflict}`);
  console.log(`  ข้าม (ไม่ว่างแล้ว): ${n.skipped}`);
} catch (e) { await tx.rollback(); console.error("ROLLBACK:", e.message); process.exitCode = 1; }
await pool.close();
